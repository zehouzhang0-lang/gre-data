package cn.grestudy.vocabulary;

import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONArray;
import org.json.JSONObject;

/** Public-client OAuth + Responses SSE. There is deliberately no arbitrary URL/token bridge. */
@CapacitorPlugin(name = "ChatGPTPlan")
public class ChatGPTPlanPlugin extends Plugin {
    private static final String SCOPES = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
    private static final String USAGE = "https://chatgpt.com/settings/usage";
    private final ExecutorService workers = Executors.newCachedThreadPool();
    private final ScheduledExecutorService deadlines = Executors.newSingleThreadScheduledExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    // Activity recreation may briefly overlap old and new plugin instances.
    private static final Object credentialLock = new Object();
    private final AtomicInteger epoch = new AtomicInteger();
    private final AtomicBoolean signingOut = new AtomicBoolean();
    private final AtomicReference<Attempt> login = new AtomicReference<>();
    private final AtomicReference<Inference> inference = new AtomicReference<>();
    private PlanCredentials credentials;

    private static final class Attempt {
        final PluginCall call;
        final int epoch;
        volatile boolean cancelled;
        volatile ServerSocket listener;
        volatile Socket client;
        volatile PlanProtocol.Failure failure;
        Attempt(PluginCall call, int epoch) { this.call = call; this.epoch = epoch; }
        void close() {
            cancelled = true;
            try { if (client != null) client.close(); } catch (Exception ignored) {}
            try { if (listener != null) listener.close(); } catch (Exception ignored) {}
        }
    }
    private static final class Inference {
        final PluginCall call;
        final int epoch;
        volatile boolean cancelled;
        volatile HttpsURLConnection connection;
        Inference(PluginCall call, int epoch) { this.call = call; this.epoch = epoch; }
        void close() { cancelled = true; if (connection != null) connection.disconnect(); }
    }
    @Override public void load() { credentials = new PlanCredentials(getContext()); }
    private void reject(PluginCall call, Exception error) {
        if (error instanceof PlanProtocol.Failure) call.reject(error.getMessage(), ((PlanProtocol.Failure) error).code);
        else if (error instanceof java.net.SocketTimeoutException) call.reject("网络响应超时，请检查网络后重试", "NETWORK");
        else if (error instanceof java.io.IOException) call.reject("网络连接中断，请检查网络后重试", "NETWORK");
        else call.reject("操作未完成；原有学习数据和连接未被替换，请重试", "NATIVE");
    }
    private JSONObject readCredentials() throws Exception { synchronized (credentialLock) { return credentials.read(); } }
    private JSObject publicStatus(JSONObject saved) {
        boolean connected = !saved.optString("access_token").isEmpty();
        JSObject result = new JSObject();
        result.put("available", true); result.put("connected", connected);
        result.put("eligible", connected && PlanProtocol.eligible(saved));
        if (!saved.optString("email").isEmpty()) result.put("email", saved.optString("email"));
        if (connected && !PlanProtocol.eligible(saved)) result.put("message", "登录成功，但未授予 ChatGPT 订阅推理权限");
        return result;
    }
    @PluginMethod public void status(PluginCall call) {
        workers.execute(() -> { try { call.resolve(publicStatus(readCredentials())); } catch (Exception e) { reject(call, e); } });
    }
    @PluginMethod public void openUsage(PluginCall call) {
        main.post(() -> {
            try { getActivity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(USAGE)).addCategory(Intent.CATEGORY_BROWSABLE)); call.resolve(); }
            catch (Exception e) { call.reject("无法打开系统浏览器，请在 ChatGPT 设置中查看用量", "BROWSER"); }
        });
    }
    @PluginMethod public void signIn(PluginCall call) {
        if (signingOut.get()) { call.reject("正在退出账号，请稍后登录", "BUSY"); return; }
        Attempt attempt = new Attempt(call, epoch.get());
        if (!login.compareAndSet(null, attempt)) { call.reject("已有登录正在进行，请完成或取消它", "BUSY"); return; }
        workers.execute(() -> authorize(attempt));
    }
    @PluginMethod public void cancelSignIn(PluginCall call) {
        Attempt attempt = login.get(); if (attempt != null) attempt.close();
        call.resolve();
    }
    private void check(Attempt attempt) throws Exception {
        if (attempt.cancelled || signingOut.get() || attempt.epoch != epoch.get()) throw new PlanProtocol.Failure("登录已取消", "CANCELLED");
    }
    private void authorize(Attempt attempt) {
        try {
            JSONObject saved = readCredentials();
            check(attempt);
            String state = PlanProtocol.random(), nonce = PlanProtocol.random(), verifier = PlanProtocol.random();
            String previousClient = saved.optString("client_id", saved.optString("pending_client_id"));
            boolean registration = previousClient.isEmpty();
            String requestedClient = registration ? "dynamic_agent_client" : previousClient;
            ServerSocket server = new ServerSocket(0, 4, InetAddress.getByName("127.0.0.1"));
            attempt.listener = server; server.setSoTimeout(1000);
            check(attempt);
            String redirect = "http://127.0.0.1:" + server.getLocalPort() + "/auth/callback";
            String query = PlanProtocol.form("client_id", requestedClient, "ext_agent_host_id", saved.getString("host_id"),
                "response_type", "code", "redirect_uri", redirect, "scope", SCOPES, "resource", PlanProtocol.RESOURCE,
                "state", state, "nonce", nonce, "code_challenge_method", "S256", "code_challenge", PlanProtocol.challenge(verifier));
            if (registration) query += "&" + PlanProtocol.form("agent_name_hint", "GRE词库");
            else {
                // The optional ID-token hint is omitted so Android/browser URL diagnostics
                // cannot contain a credential. The registered client and email suffice.
                if (!saved.optString("email").isEmpty()) query += "&" + PlanProtocol.form("login_hint", saved.getString("email"));
            }
            final String authorizationUrl = PlanProtocol.AUTHORIZE + "?" + query;
            main.post(() -> {
                try {
                    if (attempt.cancelled || attempt.epoch != epoch.get()) return;
                    getActivity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(authorizationUrl)).addCategory(Intent.CATEGORY_BROWSABLE));
                } catch (Exception e) { attempt.failure = new PlanProtocol.Failure("无法打开系统浏览器，请检查手机浏览器设置", "BROWSER"); attempt.close(); }
            });
            Map<String, String> callback = awaitCallback(attempt, state, server.getLocalPort());
            check(attempt);
            if (callback.containsKey("error")) throw new PlanProtocol.Failure("未完成 ChatGPT 授权，原连接已保留", "PERMISSION");
            String client = callback.get("client_id");
            if (registration) {
                if (client == null || client.isEmpty() || client.equals("dynamic_agent_client") || client.length() > 256) throw new PlanProtocol.Failure("注册未返回有效客户端标识，请重新登录", "AUTH");
            } else {
                if (client != null && !previousClient.equals(client)) throw new PlanProtocol.Failure("返回的账号注册标识不匹配，原连接已保留", "IDENTITY");
                client = previousClient;
            }
            String code = callback.get("code");
            if (code == null || code.isEmpty()) throw new PlanProtocol.Failure("授权码缺失，请重新登录", "AUTH");
            if (registration) {
                // Retain only the issued registration on invalid_grant. No unverified identity
                // or new tokens become active until signature/claims validation completes.
                synchronized (credentialLock) {
                    check(attempt);
                    JSONObject registrationState = credentials.read();
                    registrationState.put("pending_client_id", client);
                    credentials.write(registrationState);
                }
            }
            JSONObject tokens = PlanProtocol.json(PlanProtocol.TOKEN, "POST", PlanProtocol.form("grant_type", "authorization_code", "client_id", client,
                "code", code, "code_verifier", verifier, "redirect_uri", redirect, "resource", PlanProtocol.RESOURCE), null);
            check(attempt);
            String access = tokens.getString("access_token");
            JSONObject identity = PlanProtocol.verifyIdToken(tokens.getString("id_token"), client, nonce,
                saved.optString("subject").isEmpty() ? null : saved.optString("subject"), access);
            JSONObject next = new JSONObject(saved.toString());
            next.remove("pending_client_id");
            next.put("client_id", client).put("subject", identity.getString("sub")).put("email", identity.optString("email"))
                .put("nonce", nonce).put("id_token", tokens.getString("id_token"));
            updateTokens(next, tokens, false);
            synchronized (credentialLock) { check(attempt); credentials.write(next); }
            attempt.call.resolve(publicStatus(next));
        } catch (Exception e) {
            if (attempt.failure != null) reject(attempt.call, attempt.failure);
            else if (attempt.cancelled || attempt.epoch != epoch.get()) attempt.call.reject("登录已取消，原连接已保留", "CANCELLED");
            else reject(attempt.call, e);
        } finally { attempt.close(); login.compareAndSet(attempt, null); }
    }
    private Map<String, String> awaitCallback(Attempt attempt, String expectedState, int port) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + 240000;
        while (SystemClock.elapsedRealtime() < deadline) {
            check(attempt);
            try (Socket socket = attempt.listener.accept()) {
                attempt.client = socket; socket.setSoTimeout(2000);
                BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.US_ASCII));
                String request = PlanProtocol.line(reader, 16384);
                String[] start = request == null ? new String[0] : request.split(" ");
                String host = ""; int bytes = request == null ? 0 : request.length();
                for (String line; (line = PlanProtocol.line(reader, 16384)) != null && !line.isEmpty();) {
                    bytes += line.length(); if (bytes > 24576) throw new java.io.IOException();
                    if (line.regionMatches(true, 0, "Host:", 0, 5)) host = line.substring(5).trim();
                }
                Map<String, String> params = new HashMap<>();
                boolean valid = start.length == 3 && "GET".equals(start[0]) && ("127.0.0.1:" + port).equals(host);
                if (valid) {
                    int question = start[1].indexOf('?');
                    valid = question > 0 && "/auth/callback".equals(start[1].substring(0, question));
                    if (valid) for (String pair : start[1].substring(question + 1).split("&")) {
                        String[] pieces = pair.split("=", 2);
                        String key = URLDecoder.decode(pieces[0], "UTF-8"), value = URLDecoder.decode(pieces.length > 1 ? pieces[1] : "", "UTF-8");
                        if (params.put(key, value) != null) valid = false;
                    }
                    valid = valid && PlanProtocol.same(expectedState, params.get("state"));
                }
                browserReply(socket, valid);
                if (valid) return params;
            } catch (SocketTimeoutException ignored) {
                // Loopback probes and abandoned sockets cannot terminate an unrelated attempt.
            } catch (java.io.IOException | IllegalArgumentException ignored) { check(attempt); }
            finally { attempt.client = null; }
        }
        throw new PlanProtocol.Failure("等待浏览器授权超时，请回到应用重新登录", "AUTH_TIMEOUT");
    }
    private void browserReply(Socket socket, boolean valid) throws Exception {
        String page = valid ? "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'><title>GRE词库</title><h2>已收到授权回调</h2><p>请返回应用查看身份校验结果。</p><a href='grevocabulary://chatgpt-return'>返回 GRE词库</a>"
            : "<!doctype html><meta charset=utf-8><title>GRE词库</title><p>此回调无效，请使用刚才打开的授权页面。</p>";
        byte[] bytes = page.getBytes(StandardCharsets.UTF_8);
        String headers = "HTTP/1.1 " + (valid ? "200 OK" : "400 Bad Request") + "\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nContent-Security-Policy: default-src 'none'; base-uri 'none'; frame-ancestors 'none'\r\nConnection: close\r\nContent-Length: " + bytes.length + "\r\n\r\n";
        OutputStream output = socket.getOutputStream(); output.write(headers.getBytes(StandardCharsets.US_ASCII)); output.write(bytes); output.flush();
    }
    private void updateTokens(JSONObject next, JSONObject tokens, boolean refresh) throws Exception {
        String access = tokens.optString("access_token"), type = tokens.optString("token_type");
        long duration = tokens.optLong("expires_in", 0);
        if (access.isEmpty() || access.length() > 65536 || !access.matches("[A-Za-z0-9._~+/-]+=*") || !"Bearer".equalsIgnoreCase(type) || duration <= 0 || duration > 2592000)
            throw new PlanProtocol.Failure("登录令牌格式无效，请重新登录", "AUTH");
        next.put("access_token", access).put("expires_at", System.currentTimeMillis() / 1000 + duration);
        if (tokens.has("refresh_token")) next.put("refresh_token", tokens.getString("refresh_token"));
        else if (!refresh) next.remove("refresh_token");
        if (tokens.has("scope")) next.put("scope", tokens.getString("scope"));
        else if (!refresh) next.put("scope", "");
    }
    // Held across refresh and the atomic replacement: rotating refresh tokens never race.
    private String accessToken(int expectedEpoch) throws Exception {
        synchronized (credentialLock) {
            if (signingOut.get()) throw new PlanProtocol.Failure("正在退出账号", "CANCELLED");
            if (expectedEpoch != epoch.get()) throw new PlanProtocol.Failure("请求已取消", "CANCELLED");
            JSONObject saved = credentials.read();
            if (saved.optString("access_token").isEmpty()) throw new PlanProtocol.Failure("请先使用 ChatGPT 登录", "AUTH");
            if (!PlanProtocol.eligible(saved)) throw new PlanProtocol.Failure("尚未授予 ChatGPT 订阅推理权限", "PERMISSION");
            if (saved.optLong("expires_at") <= System.currentTimeMillis() / 1000 + 60) {
                if (saved.optString("refresh_token").isEmpty()) throw new PlanProtocol.Failure("登录已过期，请重新登录", "AUTH");
                JSONObject tokens = PlanProtocol.json(PlanProtocol.TOKEN, "POST", PlanProtocol.form("grant_type", "refresh_token",
                    "client_id", saved.getString("client_id"), "refresh_token", saved.getString("refresh_token"), "resource", PlanProtocol.RESOURCE), null);
                JSONObject next = new JSONObject(saved.toString());
                updateTokens(next, tokens, true);
                if (tokens.has("id_token")) {
                    JSONObject identity = PlanProtocol.verifyIdToken(tokens.getString("id_token"), saved.getString("client_id"), null, saved.getString("subject"), tokens.getString("access_token"));
                    if (identity.has("nonce") && !PlanProtocol.same(saved.optString("nonce"), identity.optString("nonce"))) throw new PlanProtocol.Failure("刷新身份校验失败，请重新登录", "IDENTITY");
                    next.put("id_token", tokens.getString("id_token"));
                }
                // Persist rotation even if the user just cancelled; sign-out clears it afterwards.
                credentials.write(next); saved = next;
            }
            if (expectedEpoch != epoch.get()) throw new PlanProtocol.Failure("请求已取消", "CANCELLED");
            if (!PlanProtocol.eligible(saved)) throw new PlanProtocol.Failure("订阅推理授权已改变，请重新授权", "PERMISSION");
            return saved.getString("access_token");
        }
    }
    @PluginMethod public void models(PluginCall call) {
        int requestEpoch = epoch.get();
        workers.execute(() -> {
            try {
                JSONObject response = PlanProtocol.json(PlanProtocol.MODELS, "GET", null, accessToken(requestEpoch));
                JSONArray models = response.getJSONArray("models"), visible = new JSONArray();
                for (int i = 0; i < models.length(); i++) {
                    JSONObject model = models.getJSONObject(i);
                    if ("list".equals(model.optString("visibility"))) visible.put(new JSONObject().put("slug", model.getString("slug")).put("display_name", model.optString("display_name", model.getString("slug"))));
                }
                if (requestEpoch != epoch.get()) throw new PlanProtocol.Failure("账号已退出，请重新登录", "CANCELLED");
                JSObject result = new JSObject(); result.put("models", visible); call.resolve(result);
            } catch (Exception e) { reject(call, e); }
        });
    }
    @PluginMethod public void respond(PluginCall call) {
        Inference request = new Inference(call, epoch.get());
        if (!inference.compareAndSet(null, request)) { call.reject("已有解析进行中，请等待或取消", "BUSY"); return; }
        workers.execute(() -> runResponse(request));
    }
    private void runResponse(Inference request) {
        ScheduledFuture<?> timeout = deadlines.schedule(request::close, 240, TimeUnit.SECONDS);
        try {
            JSONObject body = request.call.getObject("body");
            if (body == null) throw new PlanProtocol.Failure("解析请求缺失", "REQUEST");
            byte[] encoded = PlanProtocol.requestBody(body);
            String access = accessToken(request.epoch);
            if (request.cancelled) throw new PlanProtocol.Failure("解析已取消", "CANCELLED");
            HttpsURLConnection c = PlanProtocol.connection(PlanProtocol.RESPONSES, "POST");
            request.connection = c; c.setDoOutput(true); c.setReadTimeout(60000);
            c.setRequestProperty("Authorization", "Bearer " + access); c.setRequestProperty("Content-Type", "application/json");
            c.setRequestProperty("Accept", "text/event-stream"); c.setFixedLengthStreamingMode(encoded.length);
            if (request.cancelled || request.epoch != epoch.get()) throw new PlanProtocol.Failure("解析已取消", "CANCELLED");
            try (OutputStream out = c.getOutputStream()) { out.write(encoded); }
            int status = c.getResponseCode();
            if (status != 200) throw PlanProtocol.httpFailure(status, PlanProtocol.read(c.getErrorStream(), 65536));
            String contentType = c.getContentType();
            if (contentType == null || !contentType.toLowerCase(java.util.Locale.ROOT).startsWith("text/event-stream")) throw new PlanProtocol.Failure("服务未返回可验证的流式解析", "INCOMPLETE");
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8))) {
                StringBuilder data = new StringBuilder(); int total = 0;
                for (String line; (line = PlanProtocol.line(reader, 2 * 1024 * 1024)) != null;) {
                    if (request.cancelled || request.epoch != epoch.get()) throw new PlanProtocol.Failure("解析已取消", "CANCELLED");
                    total += line.length();
                    if (total > 8 * 1024 * 1024) throw new PlanProtocol.Failure("解析响应过大，未保存", "RESPONSE_SIZE");
                    if (line.isEmpty()) {
                        if (data.length() == 0) continue;
                        String value = data.toString(); data.setLength(0);
                        if ("[DONE]".equals(value)) break;
                        JSONObject completed = PlanProtocol.completed(new JSONObject(value));
                        if (completed != null) {
                            if (request.cancelled || request.epoch != epoch.get()) throw new PlanProtocol.Failure("解析已取消", "CANCELLED");
                            JSObject result = new JSObject(); result.put("text", completed.getString("text")); result.put("model", completed.optString("model", body.getString("model")));
                            request.call.resolve(result); return;
                        }
                    } else if (line.startsWith("data:")) {
                        if (data.length() > 0) data.append('\n');
                        data.append(line.substring(5).replaceFirst("^ ", ""));
                        if (data.length() > 2 * 1024 * 1024) throw new PlanProtocol.Failure("解析响应过大，未保存", "RESPONSE_SIZE");
                    }
                }
            }
            throw new PlanProtocol.Failure("解析连接提前结束，未收到完成确认，请重试", "INCOMPLETE");
        } catch (Exception e) {
            if (request.cancelled || request.epoch != epoch.get()) request.call.reject("解析已取消或超时；未保存为合格讲解", "CANCELLED");
            else reject(request.call, e);
        } finally { timeout.cancel(false); request.close(); inference.compareAndSet(request, null); }
    }
    @PluginMethod public void cancel(PluginCall call) { Inference request = inference.get(); if (request != null) request.close(); call.resolve(); }
    @PluginMethod public void signOut(PluginCall call) {
        if (!signingOut.compareAndSet(false, true)) { call.reject("正在退出账号", "BUSY"); return; }
        epoch.incrementAndGet();
        Attempt attempt = login.get(); if (attempt != null) attempt.close();
        Inference request = inference.get(); if (request != null) request.close();
        workers.execute(() -> {
            boolean revoked = false;
            try {
                JSONObject saved;
                synchronized (credentialLock) {
                    saved = credentials.read();
                    JSONObject cleared = new JSONObject(saved.toString());
                    for (String field : new String[]{"access_token", "refresh_token", "id_token", "scope", "expires_at", "nonce"}) cleared.remove(field);
                    credentials.write(cleared);
                }
                String refresh = saved.optString("refresh_token");
                if (!refresh.isEmpty()) {
                    for (int retry = 0; retry < 2 && !revoked; retry++) {
                        try {
                            JSONObject discovery = PlanProtocol.json(PlanProtocol.DISCOVERY, "GET", null, null);
                            if (!PlanProtocol.ISSUER.equals(discovery.optString("issuer")) || !PlanProtocol.REVOKE.equals(discovery.optString("revocation_endpoint"))) break;
                            PlanProtocol.json(PlanProtocol.REVOKE, "POST", PlanProtocol.form("token", refresh, "token_type_hint", "refresh_token", "client_id", saved.getString("client_id")), null);
                            revoked = true;
                        } catch (Exception ignored) { if (retry == 0) Thread.sleep(1000); }
                    }
                }
                JSObject result = new JSObject(); result.put("revoked", revoked); call.resolve(result);
            } catch (Exception e) { reject(call, e); }
            finally { signingOut.set(false); }
        });
    }
    @Override protected void handleOnDestroy() {
        epoch.incrementAndGet();
        Attempt attempt = login.get(); if (attempt != null) attempt.close();
        Inference request = inference.get(); if (request != null) request.close();
        workers.shutdown(); deadlines.shutdownNow();
        super.handleOnDestroy();
    }
}
