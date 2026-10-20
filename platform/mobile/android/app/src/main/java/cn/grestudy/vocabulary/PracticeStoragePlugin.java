package cn.grestudy.vocabulary;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/** Practice has its own SQLite file; never opens or migrates vocabulary data. */
@CapacitorPlugin(name = "PracticeStorage")
public class PracticeStoragePlugin extends Plugin {
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private VocabStoragePlugin.SnapshotDatabase database;

    @Override public void load() {
        database = new VocabStoragePlugin.SnapshotDatabase(getContext(), "gre-practice.sqlite");
    }

    @PluginMethod public void read(PluginCall call) {
        io.execute(() -> {
            try {
                String value = database.readSnapshot();
                JSObject result = new JSObject();
                result.put("value", value == null ? JSONObject.NULL : value);
                call.resolve(result);
            } catch (Exception error) { call.reject("读取刷题记录失败，原数据没有被清空。", "IO_ERROR", error); }
        });
    }

    @PluginMethod public void write(PluginCall call) {
        String value = call.getString("value");
        if (value == null) { call.reject("缺少刷题记录。", "INVALID_ARGUMENT"); return; }
        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > 20 * 1024 * 1024) { call.reject("刷题记录超过 20 MB 上限。", "TOO_LARGE"); return; }
        io.execute(() -> {
            try { database.writeSnapshot(bytes); call.resolve(); }
            catch (Exception error) { call.reject("刷题记录未保存，请重试；原记录保留。", "IO_ERROR", error); }
        });
    }

    @Override protected void handleOnDestroy() {
        io.execute(() -> { if (database != null) database.close(); });
        io.shutdown();
        super.handleOnDestroy();
    }
}
