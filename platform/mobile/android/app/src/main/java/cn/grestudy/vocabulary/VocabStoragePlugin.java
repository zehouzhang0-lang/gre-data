package cn.grestudy.vocabulary;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONObject;

/** One committed SQLite snapshot, plus explicit user-selected external JSON files. */
@CapacitorPlugin(name = "VocabStorage")
public class VocabStoragePlugin extends Plugin {
    static final int MAX_BYTES = 20 * 1024 * 1024;
    static final int MAX_STORAGE_BYTES = 48 * 1024 * 1024;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final AtomicBoolean pickerBusy = new AtomicBoolean(false);
    private SnapshotDatabase database;
    private byte[] pendingExport;
    private String pendingName;

    @Override
    public void load() {
        database = new SnapshotDatabase(getContext());
    }

    @Override
    public Boolean shouldOverrideLoad(Uri url) {
        // Do not forward arbitrary links/intents to another application either.
        return !("https".equals(url.getScheme()) && "localhost".equals(url.getHost())
            && (url.getPort() == -1 || url.getPort() == 443));
    }

    @PluginMethod
    public void read(PluginCall call) {
        io.execute(() -> {
            try {
                String value = database.readSnapshot();
                JSObject result = new JSObject();
                result.put("value", value == null ? JSONObject.NULL : value);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("读取本机词库失败，原数据没有被清空。", "IO_ERROR", error);
            }
        });
    }

    @PluginMethod
    public void write(PluginCall call) {
        String value = call.getString("value");
        if (value == null) { call.reject("缺少词库数据。", "INVALID_ARGUMENT"); return; }
        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_STORAGE_BYTES) { call.reject("本机数据超过 48 MB 上限。", "TOO_LARGE"); return; }
        io.execute(() -> {
            try {
                database.writeSnapshot(bytes);
                call.resolve(); // Only after endTransaction successfully commits.
            } catch (Exception error) {
                call.reject("保存失败，未确认的修改没有写入。", "IO_ERROR", error);
            }
        });
    }

    @PluginMethod
    public void exportFile(PluginCall call) {
        String content = call.getString("content");
        String name = call.getString("name", "GRE-vocabulary-backup.json");
        if (content == null) { call.reject("缺少备份内容。", "INVALID_ARGUMENT"); return; }
        byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_BYTES) { call.reject("备份超过 20 MB 上限。", "TOO_LARGE"); return; }
        if (!pickerBusy.compareAndSet(false, true)) { call.reject("请先完成当前文件操作。", "BUSY"); return; }
        pendingExport = bytes;
        pendingName = name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
        if (!pendingName.toLowerCase(java.util.Locale.ROOT).endsWith(".json")) pendingName += ".json";
        // Never put a multi-megabyte backup in Android's saved-activity Bundle.
        call.getData().remove("content");
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, pendingName);
        getActivity().runOnUiThread(() -> {
            try { startActivityForResult(call, intent, "onExportResult"); }
            catch (Exception error) { finishPicker(); call.reject("无法打开保存文件窗口。", "IO_ERROR", error); }
        });
    }

    @ActivityCallback
    private void onExportResult(PluginCall call, ActivityResult activityResult) {
        if (call == null) { finishPicker(); return; }
        if (activityResult.getResultCode() != Activity.RESULT_OK || activityResult.getData() == null) {
            finishPicker(); call.reject("已取消导出，未保存备份文件。", "CANCELLED"); return;
        }
        Uri uri = activityResult.getData().getData();
        byte[] bytes = pendingExport;
        String name = pendingName;
        if (uri == null || bytes == null) {
            finishPicker(); call.reject("导出已中断，请重新导出。", "INTERRUPTED"); return;
        }
        io.execute(() -> {
            try {
                try (OutputStream output = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                    if (output == null) throw new java.io.IOException("No writable document stream");
                    output.write(bytes);
                    output.flush();
                }
                JSObject result = new JSObject();
                result.put("name", name);
                result.put("uri", uri.toString());
                call.resolve(result);
            } catch (Exception error) {
                call.reject("备份文件写入失败，请重新导出。", "IO_ERROR", error);
            } finally { finishPicker(); }
        });
    }

    @PluginMethod
    public void importFile(PluginCall call) {
        if (!pickerBusy.compareAndSet(false, true)) { call.reject("请先完成当前文件操作。", "BUSY"); return; }
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "application/json", "text/plain", "application/octet-stream" });
        getActivity().runOnUiThread(() -> {
            try { startActivityForResult(call, intent, "onImportResult"); }
            catch (Exception error) { finishPicker(); call.reject("无法打开选择文件窗口。", "IO_ERROR", error); }
        });
    }

    @ActivityCallback
    private void onImportResult(PluginCall call, ActivityResult activityResult) {
        if (call == null) { finishPicker(); return; }
        if (activityResult.getResultCode() != Activity.RESULT_OK || activityResult.getData() == null) {
            finishPicker(); call.reject("已取消导入，本机数据未改变。", "CANCELLED"); return;
        }
        Uri uri = activityResult.getData().getData();
        if (uri == null) { finishPicker(); call.reject("没有选中文件。", "CANCELLED"); return; }
        io.execute(() -> {
            try {
                String name = "backup.json";
                try (Cursor cursor = getContext().getContentResolver().query(uri,
                    new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE }, null, null, null)) {
                    if (cursor != null && cursor.moveToFirst()) {
                        int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                        int sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE);
                        if (nameIndex >= 0 && !cursor.isNull(nameIndex)) name = cursor.getString(nameIndex);
                        if (sizeIndex >= 0 && !cursor.isNull(sizeIndex) && cursor.getLong(sizeIndex) > MAX_BYTES)
                            throw new TooLargeException();
                    }
                }
                byte[] bytes;
                try (InputStream input = getContext().getContentResolver().openInputStream(uri);
                     ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                    if (input == null) throw new java.io.IOException("No readable document stream");
                    byte[] buffer = new byte[65536];
                    int count;
                    while ((count = input.read(buffer)) != -1) {
                        if (output.size() + count > MAX_BYTES) throw new TooLargeException();
                        output.write(buffer, 0, count);
                    }
                    bytes = output.toByteArray();
                }
                String content = StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes)).toString();
                if (content.startsWith("\uFEFF")) content = content.substring(1);
                JSObject result = new JSObject();
                result.put("name", name);
                result.put("content", content);
                call.resolve(result); // This only reads; validation/restore happens separately.
            } catch (TooLargeException error) {
                call.reject("文件超过 20 MB 上限，本机数据未改变。", "TOO_LARGE");
            } catch (Exception error) {
                call.reject("无法读取 UTF-8 JSON 文件，本机数据未改变。", "IO_ERROR", error);
            } finally { finishPicker(); }
        });
    }

    @Override
    protected Bundle saveInstanceState() {
        // A killed process must retry export, not restore an incomplete file operation as success.
        return null;
    }

    @Override
    protected void handleOnDestroy() {
        // Already queued writes finish before closing; an activity exit must not cancel a commit.
        io.execute(() -> { if (database != null) database.close(); });
        io.shutdown();
        super.handleOnDestroy();
    }

    private void finishPicker() {
        pendingExport = null;
        pendingName = null;
        pickerBusy.set(false);
    }

    private static class TooLargeException extends java.io.IOException {}

    static class SnapshotDatabase extends SQLiteOpenHelper {
        SnapshotDatabase(Context context) { this(context, "gre-vocabulary.sqlite"); }
        SnapshotDatabase(Context context, String name) { super(context, name, null, 1); }
        @Override public void onConfigure(SQLiteDatabase db) { db.execSQL("PRAGMA synchronous=FULL"); }
        @Override public void onCreate(SQLiteDatabase db) {
            db.execSQL("CREATE TABLE snapshot_chunks (ordinal INTEGER PRIMARY KEY, value BLOB NOT NULL)");
            db.execSQL("CREATE TABLE snapshot_meta (id INTEGER PRIMARY KEY CHECK(id = 1), byte_length INTEGER NOT NULL)");
        }
        @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
            throw new IllegalStateException("Unsupported database migration; preserve the original database");
        }
        synchronized void writeSnapshot(byte[] value) {
            SQLiteDatabase db = getWritableDatabase();
            db.beginTransaction();
            try {
                db.delete("snapshot_chunks", null, null);
                db.delete("snapshot_meta", null, null);
                for (int offset = 0, ordinal = 0; offset < value.length; offset += 262144, ordinal++) {
                    ContentValues chunk = new ContentValues();
                    chunk.put("ordinal", ordinal);
                    chunk.put("value", java.util.Arrays.copyOfRange(value, offset, Math.min(offset + 262144, value.length)));
                    db.insertOrThrow("snapshot_chunks", null, chunk);
                }
                ContentValues meta = new ContentValues();
                meta.put("id", 1);
                meta.put("byte_length", value.length);
                db.insertOrThrow("snapshot_meta", null, meta);
                db.setTransactionSuccessful();
            } finally { db.endTransaction(); }
        }
        synchronized String readSnapshot() throws java.io.IOException {
            SQLiteDatabase db = getReadableDatabase();
            int length;
            try (Cursor cursor = db.rawQuery("SELECT byte_length FROM snapshot_meta WHERE id = 1", null)) {
                if (!cursor.moveToFirst()) {
                    try (Cursor chunks = db.rawQuery("SELECT count(*) FROM snapshot_chunks", null)) {
                        if (chunks.moveToFirst() && chunks.getInt(0) > 0)
                            throw new java.io.IOException("Snapshot metadata missing; preserve stored chunks");
                    }
                    return null;
                }
                length = cursor.getInt(0);
            }
            if (length < 0 || length > MAX_STORAGE_BYTES) throw new TooLargeException();
            // Keep every row below Android CursorWindow limits, including multi-megabyte libraries.
            try (ByteArrayOutputStream output = new ByteArrayOutputStream(length)) {
                try (Cursor cursor = db.rawQuery("SELECT ordinal, value FROM snapshot_chunks ORDER BY ordinal", null)) {
                    int ordinal = 0;
                    while (cursor.moveToNext()) {
                        if (cursor.getInt(0) != ordinal++) throw new java.io.IOException("Missing snapshot chunk");
                        byte[] bytes = cursor.getBlob(1);
                        if (bytes.length > 262144 || output.size() + bytes.length > length)
                            throw new java.io.IOException("Invalid snapshot chunk");
                        output.write(bytes);
                    }
                }
                if (output.size() != length) throw new java.io.IOException("Incomplete snapshot");
                return StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(output.toByteArray())).toString();
            }
        }
    }
}
