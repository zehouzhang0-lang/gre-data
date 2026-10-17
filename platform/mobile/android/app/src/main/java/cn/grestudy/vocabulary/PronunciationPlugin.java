package cn.grestudy.vocabulary;

import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/** Fallback for subsequently added words. No file or learning-data access. */
@CapacitorPlugin(name = "Pronunciation")
public class PronunciationPlugin extends Plugin {
    private final Handler main = new Handler(Looper.getMainLooper());
    private TextToSpeech engine;
    private boolean ready;
    private PluginCall pending;
    private String utterance;
    private List<Voice> voices = new ArrayList<>();
    private int voiceIndex;
    private Runnable timeout;

    @PluginMethod public void speak(PluginCall call) {
        String word = call.getString("word", "");
        String accent = call.getString("accent", "");
        if (word.trim().isEmpty() || word.length() > 200 || !(accent.equals("gb") || accent.equals("us"))) {
            call.reject("无效的单词或口音"); return;
        }
        main.post(() -> {
            cancel(); pending = call;
            timeout = () -> fail("语音服务暂时不可用，请检查网络或系统英语语音");
            main.postDelayed(timeout, 20000);
            if (engine == null) {
                engine = new TextToSpeech(getContext(), status -> main.post(() -> {
                    if (engine == null) return;
                    if (status != TextToSpeech.SUCCESS) {
                        fail("设备语音引擎不可用，请检查系统英语语音");
                        if (engine != null) engine.shutdown(); engine = null; ready = false; return;
                    }
                    ready = true;
                    engine.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                        @Override public void onStart(String id) {}
                        @Override public void onDone(String id) { main.post(() -> {
                            if (pending != null && id.equals(utterance)) {
                                PluginCall result = pending; pending = null;
                                clearTimeout(); result.resolve(new JSObject());
                            }
                        }); }
                        @Override public void onError(String id) { main.post(() -> {
                            if (pending != null && id.equals(utterance)) playNextVoice();
                        }); }
                    });
                    if (pending != null) prepare();
                }));
            } else if (ready) prepare();
        });
    }

    private void prepare() {
        Locale locale = "gb".equals(pending.getString("accent")) ? Locale.UK : Locale.US;
        voices = new ArrayList<>();
        if (engine.getVoices() != null) for (Voice voice : engine.getVoices()) {
            Locale available = voice.getLocale();
            if (available.getLanguage().equals("en") && available.getCountry().equals(locale.getCountry())
                && (voice.getFeatures() == null || !voice.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED))) voices.add(voice);
        }
        // Offline first; a network voice is a fallback only for the requested accent.
        voices.sort(Comparator.comparing(Voice::isNetworkConnectionRequired).thenComparing(Comparator.comparingInt(Voice::getQuality).reversed()));
        voiceIndex = 0;
        if (voices.isEmpty()) { fail("设备尚未安装此口音的英语语音，请在系统语音设置中安装"); return; }
        playNextVoice();
    }

    private void playNextVoice() {
        if (pending == null) return;
        while (voiceIndex < voices.size()) {
            Voice voice = voices.get(voiceIndex++);
            if (engine.setVoice(voice) != TextToSpeech.SUCCESS) continue;
            engine.setSpeechRate(0.85f);
            utterance = UUID.randomUUID().toString();
            if (engine.speak(pending.getString("word"), TextToSpeech.QUEUE_FLUSH, null, utterance) == TextToSpeech.SUCCESS) return;
        }
        fail("语音服务暂时不可用，请检查网络或系统英语语音");
    }

    private void clearTimeout() { if (timeout != null) main.removeCallbacks(timeout); timeout = null; }
    private void fail(String message) {
        clearTimeout(); utterance = null;
        if (engine != null) engine.stop();
        if (pending != null) { PluginCall call = pending; pending = null; call.reject(message); }
    }
    private void cancel() { fail("播放已停止"); }
    @PluginMethod public void stop(PluginCall call) { main.post(() -> { cancel(); call.resolve(); }); }
    @Override protected void handleOnPause() { main.post(this::cancel); }
    @Override protected void handleOnDestroy() { main.post(() -> { cancel(); if (engine != null) engine.shutdown(); engine = null; ready = false; }); }
}
