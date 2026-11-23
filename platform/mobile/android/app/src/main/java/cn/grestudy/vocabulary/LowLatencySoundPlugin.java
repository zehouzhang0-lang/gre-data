package cn.grestudy.vocabulary;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.media.AudioAttributes;
import android.media.SoundPool;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.lang.reflect.Field;
import java.util.HashMap;
import java.util.Map;

/** Plays short interface cues without requesting audio focus. */
@CapacitorPlugin(name = "LowLatencySound")
public final class LowLatencySoundPlugin extends Plugin {
    private static final int SAMPLE_RATE = 48_000;
    private static final long MAX_CLIP_MS = 3_500;
    private static final Object PLAYBACK = new Object();
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Map<Integer, String> loading = new HashMap<>();
    private final Map<String, Integer> loaded = new HashMap<>();
    private final Map<String, String> statuses = new HashMap<>();
    private final Map<Integer, Long> streams = new HashMap<>();
    private SoundPool pool;
    private boolean paused;

    @Override public void load() { main.post(this::preload); }

    @SuppressWarnings("deprecation")
    private void preload() {
        try {
            AudioAttributes attributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_GAME)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setFlags(AudioAttributes.FLAG_LOW_LATENCY)
                .build();
            pool = new SoundPool.Builder().setMaxStreams(8).setAudioAttributes(attributes).build();
            pool.setOnLoadCompleteListener((source, sample, result) -> {
                String id = loading.remove(sample);
                if (id == null || source != pool) return;
                if (result == 0) loaded.put(id, sample);
                updateStatus(id, result == 0 ? "ready" : "failed");
            });
            for (Field field : R.raw.class.getFields()) {
                if (!field.getName().startsWith("ui_") || field.getType() != int.class) continue;
                String id = field.getName().substring(3);
                try {
                    int sample = pool.load(getContext(), field.getInt(null), 1);
                    if (sample != 0) {
                        statuses.put(id, "loading");
                        loading.put(sample, id);
                    } else updateStatus(id, "failed");
                } catch (IllegalAccessException | RuntimeException ignored) {
                    updateStatus(id, "failed");
                }
            }
        } catch (RuntimeException unavailable) {
            // The web engine will prepare the same WAVs if the native pool cannot start.
            if (pool != null) pool.release();
            pool = null;
        }
    }

    private void updateStatus(String id, String status) {
        statuses.put(id, status);
        notifyListeners("soundLoad", new JSObject().put("id", id).put("status", status));
    }

    @PluginMethod public void status(PluginCall call) {
        main.post(() -> {
            JSObject sounds = new JSObject();
            for (Map.Entry<String, String> entry : statuses.entrySet()) sounds.put(entry.getKey(), entry.getValue());
            call.resolve(new JSObject().put("sampleRate", SAMPLE_RATE).put("sounds", sounds));
        });
    }

    @PluginMethod public void copyDiagnostic(PluginCall call) {
        String text = call.getString("text", "");
        if (text.isEmpty() || text.length() > 12_000) {
            call.reject("Invalid sound diagnostic");
            return;
        }
        main.post(() -> {
            try {
                ClipboardManager clipboard = getContext().getSystemService(ClipboardManager.class);
                if (clipboard == null) {
                    call.reject("Clipboard unavailable");
                    return;
                }
                clipboard.setPrimaryClip(ClipData.newPlainText("音效诊断", text));
                call.resolve();
            } catch (RuntimeException unavailable) {
                call.reject("Clipboard unavailable");
            }
        });
    }

    @PluginMethod(returnType = PluginMethod.RETURN_NONE)
    public void play(PluginCall call) {
        String id = call.getString("id", "");
        if (!id.matches("[a-z_0-9]{1,40}")) return;
        float requestedRate = call.getFloat("rate", 1f), requestedVolume = call.getFloat("volume", 1f);
        if (!Float.isFinite(requestedRate) || !Float.isFinite(requestedVolume)) return;
        float rate = Math.max(.998f, Math.min(1.002f, requestedRate));
        float volume = Math.max(0f, Math.min(1f, requestedVolume));
        int delay = Math.max(0, Math.min(3_000, call.getInt("delayMs", 0)));
        int generation = call.getInt("generation", 0);
        main.postAtTime(() -> {
            if (paused) return;
            int stream = 0;
            if (pool != null && loaded.containsKey(id)) {
                try { stream = pool.play(loaded.get(id), volume, volume, 1, 0, rate); }
                catch (RuntimeException ignored) { /* Web fallback below. */ }
            }
            if (stream == 0) {
                notifyListeners("playUnavailable", new JSObject()
                    .put("id", id).put("rate", rate).put("volume", volume).put("generation", generation));
            } else {
                long now = SystemClock.uptimeMillis();
                streams.entrySet().removeIf(entry -> entry.getValue() < now - MAX_CLIP_MS);
                streams.put(stream, now);
            }
        }, PLAYBACK, SystemClock.uptimeMillis() + delay);
    }

    private void stopPlaying() {
        main.removeCallbacksAndMessages(PLAYBACK);
        if (pool != null) for (int stream : streams.keySet()) pool.stop(stream);
        streams.clear();
    }

    @PluginMethod(returnType = PluginMethod.RETURN_NONE)
    public void stopAll(PluginCall call) { main.post(this::stopPlaying); }

    @Override protected void handleOnPause() {
        main.post(() -> { paused = true; stopPlaying(); });
    }

    @Override protected void handleOnResume() {
        main.post(() -> paused = false);
    }

    @Override protected void handleOnDestroy() {
        main.post(() -> {
            stopPlaying();
            if (pool != null) pool.release();
            pool = null;
        });
    }
}
