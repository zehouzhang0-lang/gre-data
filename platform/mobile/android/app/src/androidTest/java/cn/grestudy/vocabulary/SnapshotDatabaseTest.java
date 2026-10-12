package cn.grestudy.vocabulary;

import static org.junit.Assert.*;
import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.nio.charset.StandardCharsets;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Runs only against a separate test database; never clears a learner's database. */
@RunWith(AndroidJUnit4.class)
public class SnapshotDatabaseTest {
    private static final String TEST_DATABASE = "gre-vocab-native-instrumentation-only.sqlite";
    private Context context;
    private VocabStoragePlugin.SnapshotDatabase db;

    @Before public void setup() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        context.deleteDatabase(TEST_DATABASE);
        db = new VocabStoragePlugin.SnapshotDatabase(context, TEST_DATABASE);
    }
    @After public void cleanup() {
        db.close();
        context.deleteDatabase(TEST_DATABASE);
    }
    @Test public void freshDatabaseReturnsNull() throws Exception {
        assertNull(db.readSnapshot());
    }
    @Test public void multiMegabyteUnicodeSnapshotSurvivesReopen() throws Exception {
        StringBuilder text = new StringBuilder();
        for (int n = 0; n < 180000; n++) text.append("abate:减少，清楚，忘记\n");
        byte[] bytes = text.toString().getBytes(StandardCharsets.UTF_8);
        assertTrue(bytes.length > 2 * 1024 * 1024);
        db.writeSnapshot(bytes);
        db.close();
        db = new VocabStoragePlugin.SnapshotDatabase(context, TEST_DATABASE);
        assertEquals(text.toString(), db.readSnapshot());
    }
    @Test public void failedChunkWriteRollsBackToPreviousSnapshot() throws Exception {
        db.writeSnapshot("original".getBytes(StandardCharsets.UTF_8));
        db.getWritableDatabase().execSQL("CREATE TRIGGER fail_test_insert BEFORE INSERT ON snapshot_chunks WHEN NEW.ordinal = 1 BEGIN SELECT RAISE(ABORT, 'test-only simulated failure'); END");
        try {
            db.writeSnapshot(new byte[600000]);
            fail("Expected an interrupted transaction");
        } catch (android.database.SQLException expected) {
            assertEquals("original", db.readSnapshot());
        }
    }
    @Test public void orphanedChunksAreNotTreatedAsFirstInstall() throws Exception {
        db.writeSnapshot("preserve".getBytes(StandardCharsets.UTF_8));
        db.getWritableDatabase().delete("snapshot_meta", null, null);
        try { db.readSnapshot(); fail("Corrupted metadata must not reseed the learner database"); }
        catch (java.io.IOException expected) { assertNotNull(expected.getMessage()); }
    }
    @Test public void malformedUtf8DoesNotSilentlyChangeWords() throws Exception {
        db.writeSnapshot(new byte[] { (byte) 0xC3, (byte) 0x28 });
        try { db.readSnapshot(); fail("Expected invalid UTF-8 to be rejected"); }
        catch (java.nio.charset.CharacterCodingException expected) { /* Preserve corrupted bytes for recovery. */ }
    }
}
