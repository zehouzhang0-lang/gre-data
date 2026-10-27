package cn.grestudy.vocabulary;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import android.util.Base64;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/** Native-only credentials, excluded from Android backup and vocabulary exports. */
final class PlanCredentials {
    private static final String ALIAS = "gre.chatgpt.plan.v1";
    private static final byte[] AAD = "gre-chatgpt-plan:1".getBytes(StandardCharsets.UTF_8);
    private final AtomicFile file;
    PlanCredentials(Context context) {
        file = new AtomicFile(new File(context.getNoBackupFilesDir(), "chatgpt-plan.enc"));
    }
    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (!store.containsAlias(ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).setRandomizedEncryptionRequired(true).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(ALIAS, null);
    }
    synchronized JSONObject read() throws Exception {
        if (!file.getBaseFile().exists() && !new File(file.getBaseFile().getPath() + ".bak").exists()) {
            JSONObject initial = new JSONObject().put("version", 1).put("host_id", "urn:uuid:" + UUID.randomUUID());
            write(initial);
            return initial;
        }
        byte[] bytes = file.readFully();
        if (bytes.length > 262144) throw new PlanProtocol.Failure("本机登录凭据格式异常，请重新登录", "CREDENTIALS");
        JSONObject envelope = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
        if (envelope.getInt("version") != 1) throw new PlanProtocol.Failure("请升级应用以读取登录凭据", "CREDENTIALS");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(envelope.getString("iv"), Base64.NO_WRAP)));
        cipher.updateAAD(AAD);
        JSONObject decoded = new JSONObject(new String(cipher.doFinal(Base64.decode(envelope.getString("data"), Base64.NO_WRAP)), StandardCharsets.UTF_8));
        if (decoded.getInt("version") != 1 || decoded.optString("host_id").isEmpty()) throw new PlanProtocol.Failure("本机登录凭据格式异常", "CREDENTIALS");
        return decoded;
    }
    synchronized void write(JSONObject value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key()); cipher.updateAAD(AAD);
        JSONObject envelope = new JSONObject().put("version", 1)
            .put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
            .put("data", Base64.encodeToString(cipher.doFinal(value.toString().getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP));
        FileOutputStream out = null;
        try {
            out = file.startWrite();
            out.write(envelope.toString().getBytes(StandardCharsets.UTF_8));
            file.finishWrite(out);
        } catch (Exception e) { if (out != null) file.failWrite(out); throw e; }
    }
}
