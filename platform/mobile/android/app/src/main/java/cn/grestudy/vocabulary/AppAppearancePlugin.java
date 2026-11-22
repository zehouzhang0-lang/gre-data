package cn.grestudy.vocabulary;

import android.graphics.Color;
import android.os.Build;
import android.view.Window;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AppAppearance")
public class AppAppearancePlugin extends Plugin {
    @PluginMethod
    public void setSurface(PluginCall call) {
        String value = call.getString("color", "");
        if (!value.matches("#[0-9a-fA-F]{6}")) {
            call.reject("Invalid surface color");
            return;
        }
        int color = Color.parseColor(value);
        getBridge().executeOnMainThread(() -> {
            Window window = getActivity().getWindow();
            window.getDecorView().setBackgroundColor(color);
            getBridge().getWebView().setBackgroundColor(color);
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) {
                window.setStatusBarColor(color);
                window.setNavigationBarColor(color);
            }
            call.resolve();
        });
    }
}
