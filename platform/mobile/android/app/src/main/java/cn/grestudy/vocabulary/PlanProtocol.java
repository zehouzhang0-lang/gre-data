package cn.grestudy.vocabulary;

import android.util.Base64;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.math.BigInteger;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.spec.RSAPublicKeySpec;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ScheduledExecutorService;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONArray;
import org.json.JSONObject;

/** Protocol helpers: never log bodies, token values, authorization URLs or server messages. */
final class PlanProtocol {
    private static final ScheduledExecutorService NETWORK_TIMERS = Executors.newSingleThreadScheduledExecutor(r -> { Thread t = new Thread(r, "gre-plan-deadlines"); t.setDaemon(true); return t; });
    private static final ExecutorService NETWORK_CLOSERS = Executors.newCachedThreadPool(r -> { Thread t = new Thread(r, "gre-plan-close"); t.setDaemon(true); return t; });
    static PlanOperation operation(long milliseconds, PlanOperation.Ended ended) { return new PlanOperation(milliseconds, NETWORK_TIMERS, NETWORK_CLOSERS, ended); }
    static PlanOperation operation(long milliseconds, PlanOperation.Ended ended, Object gate) { return new PlanOperation(milliseconds, NETWORK_TIMERS, NETWORK_CLOSERS, ended, gate); }
    static final String ISSUER = "https://auth.openai.com";
    static final String AUTHORIZE = ISSUER + "/api/accounts/authorize";
    static final String TOKEN = ISSUER + "/api/accounts/oauth/token";
    static final String DISCOVERY = ISSUER + "/.well-known/openid-configuration";
    static final String JWKS = ISSUER + "/.well-known/jwks.json";
    static final String REVOKE = ISSUER + "/api/accounts/oauth/revoke";
    static final String RESOURCE = "https://api.openai.com/v1";
    static final String MODELS = RESOURCE + "/models", RESPONSES = RESOURCE + "/responses";
    static final int BODY_LIMIT = 24 * 1024 * 1024;
    static final class Failure extends Exception {
        final String code;
        Failure(String message, String code) { super(message); this.code = code; }
    }
    static String random() { byte[] bytes = new byte[32]; new SecureRandom().nextBytes(bytes); return b64(bytes); }
    static String b64(byte[] bytes) { return Base64.encodeToString(bytes, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP); }
    static byte[] decode(String text) { return Base64.decode(text, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP); }
    static String challenge(String verifier) throws Exception { return b64(MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII))); }
    static boolean same(String a, String b) { return a != null && b != null && MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8)); }
    static String form(String... pairs) throws Exception {
        StringBuilder body = new StringBuilder();
        for (int i = 0; i < pairs.length; i += 2) {
            if (body.length() > 0) body.append('&');
            body.append(URLEncoder.encode(pairs[i], "UTF-8")).append('=').append(URLEncoder.encode(pairs[i + 1], "UTF-8"));
        }
        return body.toString();
    }
    static HttpsURLConnection connection(String endpoint, String method) throws Exception {
        if (!Arrays.asList(TOKEN, DISCOVERY, JWKS, REVOKE, MODELS, RESPONSES).contains(endpoint)) throw new Failure("不支持的服务地址", "ENDPOINT");
        HttpsURLConnection c = (HttpsURLConnection) new URL(endpoint).openConnection();
        c.setInstanceFollowRedirects(false); c.setConnectTimeout(20000); c.setReadTimeout(45000);
        c.setRequestMethod(method); c.setUseCaches(false);
        c.setRequestProperty("Accept", "application/json");
        return c;
    }
    static String read(InputStream stream, int limit) throws Exception {
        if (stream == null) return "";
        try (InputStream in = stream; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int count;
            while ((count = in.read(buffer)) != -1) {
                if (out.size() + count > limit) throw new Failure("服务响应过大，请稍后重试", "RESPONSE_SIZE");
                out.write(buffer, 0, count);
            }
            return out.toString("UTF-8");
        }
    }
    static JSONObject json(String endpoint, String method, String body, String access) throws Exception {
        try (PlanOperation operation = operation(35000, null)) { return json(endpoint, method, body, access, operation); }
    }
    static JSONObject json(String endpoint, String method, String body, String access, PlanOperation operation) throws Exception {
        operation.check();
        HttpsURLConnection c = connection(endpoint, method);
        Runnable disconnect = c::disconnect;
        operation.attach(disconnect);
        try {
            c.setConnectTimeout(Math.min(20000, operation.remainingMillis()));
            c.setReadTimeout(Math.min(45000, operation.remainingMillis()));
            if (access != null) c.setRequestProperty("Authorization", "Bearer " + access);
            if (body != null) {
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                c.setDoOutput(true); c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
                c.setFixedLengthStreamingMode(bytes.length);
                try (java.io.OutputStream out = c.getOutputStream()) { out.write(bytes); }
            }
            operation.check();
            int status = c.getResponseCode();
            operation.check();
            if (status < 200 || status >= 300) throw httpFailure(status, read(c.getErrorStream(), 65536));
            String text = read(c.getInputStream(), 1048576);
            operation.check();
            return text.trim().isEmpty() ? new JSONObject() : new JSONObject(text);
        } finally { operation.detach(disconnect); c.disconnect(); }
    }
    static Failure httpFailure(int status, String body) {
        String code = "";
        try { JSONObject object = new JSONObject(body); Object error = object.opt("error"); code = error instanceof JSONObject ? ((JSONObject) error).optString("code") : object.optString("error", object.optString("code")); } catch (Exception ignored) {}
        if (status == 429 || code.equals("subscription_sharing_usage_limit_exceeded")) return new Failure("ChatGPT 订阅用量已达上限，请查看用量设置或等待额度恢复", "USAGE_LIMIT");
        if (code.equals("subscription_sharing_usage_unavailable")) return new Failure("此账号暂时无法使用 ChatGPT 订阅推理，请检查订阅与应用用量权限", "PERMISSION");
        if (status == 401 || code.equals("invalid_grant") || code.equals("invalid_token")) return new Failure("ChatGPT 登录已失效，请重新登录", "AUTH");
        if (status == 403 || code.equals("access_denied") || code.equals("insufficient_scope")) return new Failure("尚未获得 ChatGPT 订阅推理权限，请检查授权与工作区设置", "PERMISSION");
        if (status >= 500) return new Failure("OpenAI 服务暂时不可用，请稍后重试", "SERVICE");
        if (status >= 300 && status < 400) return new Failure("服务地址发生变化，请更新应用后重试", "ENDPOINT");
        return new Failure("当前模型或请求格式暂不受支持，请换用可用模型或更新应用", "HTTP_" + status);
    }
    static boolean eligible(JSONObject credential) {
        Set<String> scopes = new HashSet<>(Arrays.asList(credential.optString("scope").split("\\s+")));
        return scopes.contains("chatgpt.tokens.use.direct") && scopes.contains("resource.invoke");
    }
    static JSONObject verifyIdToken(String token, String client, String nonce, String expectedSubject, String access) throws Exception {
        try (PlanOperation operation = operation(35000, null)) { return verifyIdToken(token, client, nonce, expectedSubject, access, operation); }
    }
    static JSONObject verifyIdToken(String token, String client, String nonce, String expectedSubject, String access, PlanOperation operation) throws Exception {
        operation.check();
        if (token.length() > 65536) throw new Failure("登录身份校验失败，请重新登录", "IDENTITY");
        String[] parts = token.split("\\.", -1);
        if (parts.length != 3) throw new Failure("登录身份校验失败，请重新登录", "IDENTITY");
        JSONObject header = new JSONObject(new String(decode(parts[0]), StandardCharsets.UTF_8));
        JSONObject claims = new JSONObject(new String(decode(parts[1]), StandardCharsets.UTF_8));
        if (!"RS256".equals(header.optString("alg")) || header.optString("kid").isEmpty() || (header.optJSONArray("crit") != null && header.optJSONArray("crit").length() > 0)) throw new Failure("不支持的登录签名", "IDENTITY");
        JSONArray keys = json(JWKS, "GET", null, null, operation).getJSONArray("keys");
        boolean verified = false;
        for (int i = 0; i < keys.length(); i++) {
            JSONObject key = keys.getJSONObject(i);
            if (!header.getString("kid").equals(key.optString("kid")) || !"RSA".equals(key.optString("kty")) || !"sig".equals(key.optString("use", "sig")) || !"RS256".equals(key.optString("alg", "RS256"))) continue;
            BigInteger modulus = new BigInteger(1, decode(key.getString("n")));
            if (modulus.bitLength() < 2048) continue;
            Signature signature = Signature.getInstance("SHA256withRSA");
            signature.initVerify(KeyFactory.getInstance("RSA").generatePublic(new RSAPublicKeySpec(modulus, new BigInteger(1, decode(key.getString("e"))))));
            signature.update((parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII));
            verified = signature.verify(decode(parts[2]));
            if (verified) break;
        }
        long now = System.currentTimeMillis() / 1000;
        boolean audience = client.equals(claims.optString("aud"));
        JSONArray audiences = claims.optJSONArray("aud");
        if (audiences != null) {
            for (int i = 0; i < audiences.length(); i++) if (client.equals(audiences.optString(i))) audience = true;
            if (audiences.length() > 1 && !client.equals(claims.optString("azp"))) audience = false;
        }
        String subject = claims.optString("sub");
        if (!verified || !ISSUER.equals(claims.optString("iss")) || !audience || subject.isEmpty()
            || claims.optLong("exp", 0) <= now || claims.optLong("iat", now) > now + 60 || claims.optLong("nbf", 0) > now + 60
            || (claims.has("azp") && !client.equals(claims.optString("azp")))
            || (nonce != null && !same(nonce, claims.optString("nonce")))
            || (expectedSubject != null && !same(expectedSubject, subject))) throw new Failure("登录身份校验失败，请重新登录", "IDENTITY");
        if (claims.has("at_hash")) {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(access.getBytes(StandardCharsets.US_ASCII));
            if (!same(b64(Arrays.copyOf(digest, digest.length / 2)), claims.optString("at_hash"))) throw new Failure("登录令牌校验失败", "IDENTITY");
        }
        operation.check();
        return claims;
    }
    static byte[] requestBody(JSONObject body) throws Exception {
        Set<String> allowed = new HashSet<>(Arrays.asList("model", "store", "stream", "instructions", "input", "text"));
        for (Iterator<String> keys = body.keys(); keys.hasNext();) if (!allowed.contains(keys.next())) throw new Failure("解析请求含不支持的字段", "REQUEST");
        if (!body.optString("model").matches("[A-Za-z0-9._:/-]{1,160}") || body.optBoolean("store", true) || !body.optBoolean("stream", false) || body.optJSONArray("input") == null) throw new Failure("解析请求格式无效", "REQUEST");
        JSONArray input = body.getJSONArray("input");
        int images = 0;
        for (int i = 0; i < input.length(); i++) {
            JSONObject message = input.getJSONObject(i);
            if (!Arrays.asList("user", "developer", "assistant").contains(message.optString("role"))) throw new Failure("不支持的消息类型", "REQUEST");
            JSONArray content = message.optJSONArray("content");
            if (content == null) { if (!(message.opt("content") instanceof String)) throw new Failure("题目内容缺失", "REQUEST"); continue; }
            for (int n = 0; n < content.length(); n++) {
                JSONObject part = content.getJSONObject(n);
                if ("input_text".equals(part.optString("type"))) { if (!(part.opt("text") instanceof String)) throw new Failure("题目文字无效", "REQUEST"); }
                else if ("input_image".equals(part.optString("type"))) {
                    String image = part.optString("image_url");
                    int comma = image.indexOf(',');
                    if (++images > 4 || comma < 0 || !image.substring(0, comma).matches("data:image/(webp|png|jpeg);base64")
                        || image.length() - comma - 1 > ((5 * 1024 * 1024 + 2) / 3) * 4) throw new Failure("最多附带4张、每张不超过5MB的本地题目图片", "REQUEST_SIZE");
                } else throw new Failure("不支持的题目内容类型", "REQUEST");
            }
        }
        byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
        if (bytes.length > BODY_LIMIT) throw new Failure("题目及图片超过24MB，请减少图片", "REQUEST_SIZE");
        return bytes;
    }
    // Bounded readLine avoids an unbounded allocation from an interrupted/malformed stream.
    static String line(BufferedReader reader, int limit) throws Exception {
        StringBuilder value = new StringBuilder();
        int c;
        while ((c = reader.read()) != -1) {
            if (c == '\n') break;
            if (value.length() >= limit) throw new Failure("服务响应过大", "RESPONSE_SIZE");
            value.append((char) c);
        }
        if (c == -1 && value.length() == 0) return null;
        if (value.length() > 0 && value.charAt(value.length() - 1) == '\r') value.setLength(value.length() - 1);
        return value.toString();
    }
    static JSONObject completed(JSONObject event) throws Exception {
        String type = event.optString("type");
        if (type.equals("response.failed") || type.equals("error")) {
            JSONObject response = event.optJSONObject("response");
            throw httpFailure(400, (response == null ? event : response).toString());
        }
        if (type.equals("response.incomplete")) throw new Failure("解析未完整返回，未保存为合格讲解，请重试", "INCOMPLETE");
        if (!type.equals("response.completed")) return null;
        JSONObject response = event.getJSONObject("response");
        if (!"completed".equals(response.optString("status"))) throw new Failure("解析尚未完成", "INCOMPLETE");
        StringBuilder text = new StringBuilder();
        JSONArray output = response.optJSONArray("output");
        if (output != null) for (int i = 0; i < output.length(); i++) {
            JSONObject item = output.getJSONObject(i);
            if (!"message".equals(item.optString("type"))) continue;
            JSONArray content = item.optJSONArray("content");
            if (content != null) for (int n = 0; n < content.length(); n++) {
                JSONObject part = content.getJSONObject(n);
                if ("refusal".equals(part.optString("type"))) throw new Failure("模型未提供这次解析，请检查题目后重试", "REFUSAL");
                if ("output_text".equals(part.optString("type"))) text.append(part.optString("text"));
            }
        }
        if (text.toString().trim().isEmpty()) throw new Failure("模型未返回完整讲解文本", "INCOMPLETE");
        return new JSONObject().put("text", text.toString()).put("model", response.optString("model"));
    }
}
