package cn.grestudy.vocabulary;

import android.graphics.Color;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VocabStoragePlugin.class);
        registerPlugin(PracticeStoragePlugin.class);
        registerPlugin(PronunciationPlugin.class);
        super.onCreate(savedInstanceState);
        if (getBridge() != null) {
            getBridge().getWebView().setBackgroundColor(Color.WHITE);
            getBridge().getWebView().getSettings().setAllowFileAccess(false);
            getBridge().getWebView().getSettings().setAllowContentAccess(false);
            getBridge().getWebView().getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
        }
    }
}
