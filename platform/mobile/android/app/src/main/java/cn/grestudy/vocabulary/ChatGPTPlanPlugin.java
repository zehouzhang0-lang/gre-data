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
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
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
    private static final String USAGE = "https://chatgpt.com/settings/usage";
    private final ExecutorService workers = Executors.newCachedThreadPool();
    private final ScheduledExecutorService deadlines = Executors.newSingleThreadScheduledExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    // Activity recreation may briefly overlap old and new plugin instances.
    private static final Object credentialLock = new Object();
    private final AtomicInteger epoch = new AtomicInteger();
    private final AtomicBoolean signingOut = new AtomicBoolean();
    private final AtomicReference<Attempt> login = new AtomicReference<>();
    private final AtomicReference<Attempt> latestLogin = new AtomicReference<>();
    private final AtomicReference<Inference> inference = new AtomicReference<>();
    private PlanCredentials credentials;
    private volatile String appVersion = "unknown";
    // Public fields only. status() never waits for credential I/O, refresh or a lock.
    private volatile String accountJson = "{\"available\":true,\"connected\":false,\"eligible\":false,\"message\":\"正在读取设备连接状态\"}";

    private static final class LoginView {
        final String phase, error, errorCode;
        final long ended;
        LoginView(String phase, String error, String errorCode, long ended) { this.phase = phase; this.error = error; this.errorCode = errorCode; this.ended = ended; }
    }
    private static final class Attempt {
        final String id = UUID.randomUUID().toString();
        final long started = SystemClock.elapsedRealtime();
        final Object gate = new Object();
        final int epoch;
        final PlanLoginSupport.Diagnostics diagnostics = new PlanLoginSupport.Diagnostics();
        volatile LoginView view = new LoginView("starting", null, null, 0);
        volatile PlanOperation operation;
        volatile ServerSocket listener;
        volatile Socket client;
        Attempt(int epoch) { this.epoch = epoch; }
    }
    private static final class Inference {
        final PluginCall call;
        final int epoch;
        volatile boolean cancelled;
        volatile HttpsURLConnection connection;
        volatile PlanOperation operation;
        Inference(PluginCall call, int epoch) { this.call = call; this.epoch = epoch; }
        void close() { cancelled = true; if (operation != null) operation.cancel(); }
    }
    @Override public void load() {
        try {
            String installedVersion = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0).versionName;
            appVersion = installedVersion == null ? "unknown" : installedVersion;
        }
        catch (Exception ignored) { appVersion = "unknown"; }
        credentials = new PlanCredentials(getContext());
        workers.execute(() -> {
            try { synchronized (credentialLock) { cacheAccount(credentials.read()); } }
            catch (Exception e) {
                synchronized (credentialLock) {
                    // A slow startup read must not hide a newer successful login.
                    if (!publicStatus().optBoolean("connected")) accountJson = "{\"available\":true,\"connected\":false,\"eligible\":false,\"message\":\"无法读取设备登录状态，请重新尝试登录\"}";
                }
            }
        });
    }
    private void reject(PluginCall call, Exception error) {
        if (error instanceof PlanProtocol.Failure) call.reject(error.getMessage(), ((PlanProtocol.Failure) error).code);
        else if (error instanceof PlanOperation.Stopped) call.reject("请求已取消或达到网络时限，请重试", ((PlanOperation.Stopped) error).code);
        else if (error instanceof java.net.SocketTimeoutException) call.reject("网络响应超时，请检查网络后重试", "NETWORK");
        else if (error instanceof java.io.IOException) call.reject("网络连接中断，请检查网络后重试", "NETWORK");
        else call.reject("操作未完成；原有学习数据和连接未被替换，请重试", "NATIVE");
    }
    private JSONObject readCredentials() throws Exception { synchronized (credentialLock) { return credentials.read(); } }
    private void cacheAccount(JSONObject saved) {
        boolean connected = !saved.optString("access_token").isEmpty();
        JSObject result = new JSObject();
        result.put("available", true); result.put("connected", connected);
        result.put("eligible", connected && PlanProtocol.eligible(saved));
        if (!saved.optString("email").isEmpty()) result.put("email", saved.optString("email"));
        if (connected && !PlanProtocol.eligible(saved)) result.put("message", "登录成功，但未授予 ChatGPT 订阅推理权限");
        accountJson = result.toString();
    }
    private JSObject publicStatus() {
        JSObject result;
        try { result = new JSObject(accountJson); } catch (Exception ignored) { result = new JSObject(); result.put("available", true); result.put("connected", false); result.put("eligible", false); }
        Attempt attempt = latestLogin.get();
        JSObject status = new JSObject();
        status.put("id", attempt == null ? JSONObject.NULL : attempt.id);
        LoginView view = attempt == null ? null : attempt.view;
        String phase = view == null ? "idle" : view.phase;
        long elapsed = attempt == null ? 0 : Math.max(0, ((view.ended == 0 ? SystemClock.elapsedRealtime() : view.ended) - attempt.started) / 1000);
        status.put("phase", phase);
        status.put("elapsed_seconds", elapsed);
        if (view != null && view.error != null) { status.put("error", view.error); status.put("error_code", view.errorCode); }
        result.put("login", status);
        result.put("authorization_mode", PlanLoginSupport.MODE);
        ServerSocket listener = attempt == null ? null : attempt.listener;
        JSObject diagnostic = new JSObject();
        PlanLoginSupport.Diagnostics counters = attempt == null ? new PlanLoginSupport.Diagnostics() : attempt.diagnostics;
        counters.snapshot(appVersion, phase, elapsed, listener != null && !listener.isClosed())
            .forEach((key, value) -> diagnostic.put(key, value));
        result.put("diagnostics", diagnostic);
        return result;
    }
    @PluginMethod public void status(PluginCall call) {
        call.resolve(publicStatus());
    }
    @PluginMethod public void openUsage(PluginCall call) {
        main.post(() -> {
            try { getActivity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(USAGE)).addCategory(Intent.CATEGORY_BROWSABLE)); call.resolve(); }
            catch (Exception e) { call.reject("无法打开系统浏览器，请在 ChatGPT 设置中查看用量", "BROWSER"); }
        });
    }
    @PluginMethod public void signIn(PluginCall call) {
        if (signingOut.get()) { call.reject("正在退出账号，请稍后登录", "BUSY"); return; }
        Attempt attempt = new Attempt(epoch.get());
        if (!login.compareAndSet(null, attempt)) { call.resolve(publicStatus()); return; }
        latestLogin.set(attempt);
        beginStage(attempt, "starting", 15000);
        call.resolve(publicStatus());
        workers.execute(() -> authorize(attempt));
    }
    @PluginMethod public void cancelSignIn(PluginCall call) {
        Attempt attempt = login.get(); if (attempt != null) cancelAttempt(attempt, "登录已取消，原连接已保留");
        call.resolve(publicStatus());
    }
    private boolean terminal(String phase) {
        return phase.equals("connected") || phase.equals("failed") || phase.equals("cancelled");
    }
    private void endAttempt(Attempt attempt, String phase, String message, String code) {
        synchronized (attempt.gate) {
            if (terminal(attempt.view.phase)) return;
            attempt.view = new LoginView(phase, message, code, SystemClock.elapsedRealtime());
            login.compareAndSet(attempt, null);
        }
    }
    private void cancelAttempt(Attempt attempt, String message) {
        synchronized (attempt.gate) {
            if (terminal(attempt.view.phase)) return;
            endAttempt(attempt, "cancelled", message, "CANCELLED");
            if (attempt.operation != null) attempt.operation.cancel();
        }
    }
    private void beginStage(Attempt attempt, String phase, long milliseconds) {
        synchronized (attempt.gate) {
            if (terminal(attempt.view.phase) || login.get() != attempt) return;
            if (phase.equals("awaiting_browser") && !attempt.view.phase.equals("starting")) return;
            if (phase.equals("exchanging") && !(attempt.view.phase.equals("starting") || attempt.view.phase.equals("awaiting_browser"))) return;
            if (attempt.operation != null) {
                try { attempt.operation.renew(milliseconds); }
                catch (PlanOperation.Stopped ignored) { return; }
                attempt.view = new LoginView(phase, null, null, 0);
                return;
            }
            attempt.view = new LoginView(phase, null, null, 0);
            attempt.operation = PlanProtocol.operation(milliseconds, reason -> {
                String currentPhase = attempt.view.phase;
                String message = currentPhase.equals("starting") ? "准备本机登录超过15秒，请重试"
                    : currentPhase.equals("awaiting_browser") ? "等待浏览器回调超过4分钟，请重新授权"
                    : "交换凭据或校验身份超过60秒，请检查手机网络后重试";
                endAttempt(attempt, reason.equals("TIMEOUT") ? "failed" : "cancelled", reason.equals("TIMEOUT") ? message : "登录已取消，原连接已保留", reason.equals("TIMEOUT") ? "LOGIN_TIMEOUT" : "CANCELLED");
            }, attempt.gate);
        }
    }
    private void check(Attempt attempt) throws Exception {
        if (terminal(attempt.view.phase) || login.get() != attempt || signingOut.get() || attempt.epoch != epoch.get()) throw new PlanProtocol.Failure("登录已取消", "CANCELLED");
        if (attempt.operation != null) attempt.operation.check();
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
            attempt.operation.attach(() -> { try { server.close(); } catch (Exception ignored) {} });
            check(attempt);
            String redirect = "http://127.0.0.1:" + server.getLocalPort() + "/auth/callback";
            String query = PlanLoginSupport.authorizationQuery(requestedClient, redirect, state, nonce,
                PlanProtocol.challenge(verifier), registration, saved.optString("email"));
            final String authorizationUrl = PlanProtocol.AUTHORIZE + "?" + query;
            main.post(() -> {
                try {
                    check(attempt);
                    getActivity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(authorizationUrl)).addCategory(Intent.CATEGORY_BROWSABLE));
                    beginStage(attempt, "awaiting_browser", 240000);
                } catch (Exception e) {
                    endAttempt(attempt, "failed", "打开浏览器失败：请检查手机浏览器设置", "BROWSER");
                    if (attempt.operation != null) attempt.operation.cancel();
                }
            });
            Map<String, String> callback = awaitCallback(attempt, state, server.getLocalPort());
            check(attempt);
            if (callback.containsKey("error")) throw new PlanProtocol.Failure("未完成 ChatGPT 授权，原连接已保留", "PERMISSION");
            check(attempt);
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
                    JSONObject registrationState = credentials.read();
                    registrationState.put("pending_client_id", client);
                    attempt.operation.guard(() -> { check(attempt); credentials.write(registrationState); });
                }
            }
            JSONObject tokens = PlanProtocol.json(PlanProtocol.TOKEN, "POST", PlanProtocol.form("grant_type", "authorization_code", "client_id", client,
                "code", code, "code_verifier", verifier, "redirect_uri", redirect, "resource", PlanProtocol.RESOURCE), null, attempt.operation);
            check(attempt);
            String access = tokens.getString("access_token");
            synchronized (attempt.gate) { check(attempt); attempt.view = new LoginView("verifying", null, null, 0); }
            JSONObject identity = PlanProtocol.verifyIdToken(tokens.getString("id_token"), client, nonce,
                saved.optString("subject").isEmpty() ? null : saved.optString("subject"), access, attempt.operation);
            JSONObject next = new JSONObject(saved.toString());
            next.remove("pending_client_id");
            next.put("client_id", client).put("subject", identity.getString("sub")).put("email", identity.optString("email"))
                .put("nonce", nonce).put("id_token", tokens.getString("id_token"));
            updateTokens(next, tokens, false);
            synchronized (credentialLock) {
                attempt.operation.commit(() -> {
                    check(attempt);
                    credentials.write(next);
                    cacheAccount(next);
                    endAttempt(attempt, "connected", null, null);
                });
            }
        } catch (Exception e) {
            loginFailure(attempt, e);
        } finally { if (attempt.operation != null) attempt.operation.close(); }
    }
    private void loginFailure(Attempt attempt, Exception error) {
        String phase = attempt.view.phase;
        if (terminal(phase)) return;
        String prefix = phase.equals("verifying") ? "校验身份失败" : phase.equals("exchanging") ? "交换凭据失败"
            : phase.equals("awaiting_browser") ? "浏览器授权未完成" : "准备登录失败";
        String code = "NATIVE", detail = "请重试；原连接已保留";
        if (error instanceof PlanProtocol.Failure) {
            code = ((PlanProtocol.Failure) error).code;
            detail = code.startsWith("HTTP_") || code.equals("REQUEST") ? "授权服务未接受请求，请重试或更新应用" : error.getMessage();
        } else if (error instanceof PlanOperation.Stopped) {
            code = ((PlanOperation.Stopped) error).code;
            detail = code.equals("TIMEOUT") ? "已达到本阶段网络时限，请检查手机网络" : "登录已取消";
        } else if (error instanceof java.io.IOException) { code = "NETWORK"; detail = "网络连接失败或超时，请检查手机网络"; }
        else if (error instanceof java.security.GeneralSecurityException || error instanceof org.json.JSONException) { code = "IDENTITY"; detail = "授权服务返回内容未通过校验，请重试"; }
        endAttempt(attempt, code.equals("CANCELLED") ? "cancelled" : "failed", prefix + "：" + detail, code);
    }
    private Map<String, String> awaitCallback(Attempt attempt, String expectedState, int port) throws Exception {
        while (true) {
            check(attempt);
            Runnable closeSocket = null;
            Socket acceptedSocket = null;
            try {
                final Socket socket = attempt.listener.accept();
                acceptedSocket = socket;
                attempt.client = socket; socket.setSoTimeout(2000);
                closeSocket = () -> { try { socket.close(); } catch (Exception ignored) {} };
                attempt.operation.attach(closeSocket);
                BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.US_ASCII));
                String request = PlanProtocol.line(reader, 16384);
                if (request != null) attempt.diagnostics.requestRead();
                String host = ""; int bytes = request == null ? 0 : request.length();
                for (String line; (line = PlanProtocol.line(reader, 16384)) != null && !line.isEmpty();) {
                    bytes += line.length(); if (bytes > 24576) throw new java.io.IOException();
                    if (line.regionMatches(true, 0, "Host:", 0, 5)) host = line.substring(5).trim();
                }
                PlanLoginSupport.Callback parsed = PlanLoginSupport.parseCallback(request, host, "127.0.0.1:" + port, expectedState);
                Map<String, String> params = parsed.params;
                if (parsed.valid()) {
                    attempt.diagnostics.accepted();
                    // The validated callback is already received. A browser write/flush
                    // failure must never put this login back into the accept() loop.
                    if (!params.containsKey("error")) beginStage(attempt, "exchanging", 60000);
                    check(attempt);
                    return PlanCallbackDelivery.accepted(params, () -> browserReply(socket, true, params.containsKey("error")));
                }
                attempt.diagnostics.rejected(parsed.rejection);
                // Feedback delivery must not overwrite the actual rejection classification.
                try { browserReply(socket, false, false); } catch (Exception ignored) {}
            } catch (SocketTimeoutException ignored) {
                if (acceptedSocket != null) attempt.diagnostics.rejected(PlanLoginSupport.Rejection.TIMEOUT);
                // Loopback probes and abandoned sockets cannot terminate an unrelated attempt.
            } catch (java.io.IOException | IllegalArgumentException ignored) {
                if (acceptedSocket != null && !terminal(attempt.view.phase)) attempt.diagnostics.rejected(
                    ignored instanceof IllegalArgumentException ? PlanLoginSupport.Rejection.MALFORMED : PlanLoginSupport.Rejection.IO);
                check(attempt);
            }
            finally {
                if (closeSocket != null) attempt.operation.detach(closeSocket);
                if (acceptedSocket != null) try { acceptedSocket.close(); } catch (Exception ignored) {}
                attempt.client = null;
            }
        }
    }
    private void browserReply(Socket socket, boolean valid, boolean denied) throws Exception {
        String page = valid ? "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'><title>GRE词库</title><h2>" + (denied ? "授权未完成" : "已收到授权回调") + "</h2><p>" + (denied ? "本次授权被拒绝或取消。原连接已保留，请手动返回应用查看详情。" : "这还不代表登录成功。请手动返回应用查看凭据交换和身份校验进度。") + "</p><a href='grevocabulary://chatgpt-return'>返回 GRE词库</a>"
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
    private String accessToken(int expectedEpoch, PlanOperation operation) throws Exception {
        operation.check();
        synchronized (credentialLock) {
            operation.check();
            if (signingOut.get()) throw new PlanProtocol.Failure("正在退出账号", "CANCELLED");
            if (expectedEpoch != epoch.get()) throw new PlanProtocol.Failure("请求已取消", "CANCELLED");
            JSONObject saved = credentials.read();
            if (saved.optString("access_token").isEmpty()) throw new PlanProtocol.Failure("请先使用 ChatGPT 登录", "AUTH");
            if (!PlanProtocol.eligible(saved)) throw new PlanProtocol.Failure("尚未授予 ChatGPT 订阅推理权限", "PERMISSION");
            if (saved.optLong("expires_at") <= System.currentTimeMillis() / 1000 + 60) {
                if (saved.optString("refresh_token").isEmpty()) throw new PlanProtocol.Failure("登录已过期，请重新登录", "AUTH");
                PlanOperation refresh = PlanProtocol.operation(Math.min(35000, operation.remainingMillis()), null);
                Runnable cancelRefresh = refresh::cancel;
                operation.attach(cancelRefresh);
                try {
                    JSONObject tokens = PlanProtocol.json(PlanProtocol.TOKEN, "POST", PlanProtocol.form("grant_type", "refresh_token",
                        "client_id", saved.getString("client_id"), "refresh_token", saved.getString("refresh_token"), "resource", PlanProtocol.RESOURCE), null, refresh);
                    JSONObject next = new JSONObject(saved.toString());
                    updateTokens(next, tokens, true);
                    if (tokens.has("id_token")) {
                        JSONObject identity = PlanProtocol.verifyIdToken(tokens.getString("id_token"), saved.getString("client_id"), null, saved.getString("subject"), tokens.getString("access_token"), refresh);
                        if (identity.has("nonce") && !PlanProtocol.same(saved.optString("nonce"), identity.optString("nonce"))) throw new PlanProtocol.Failure("刷新身份校验失败，请重新登录", "IDENTITY");
                        next.put("id_token", tokens.getString("id_token"));
                    }
                    // Sign-out serializes behind this lock and revokes the latest saved token.
                    operation.guard(() -> refresh.guard(() -> { credentials.write(next); cacheAccount(next); }));
                    saved = next;
                } finally {
                    operation.detach(cancelRefresh);
                    refresh.close();
                }
            }
            if (expectedEpoch != epoch.get()) throw new PlanProtocol.Failure("请求已取消", "CANCELLED");
            if (!PlanProtocol.eligible(saved)) throw new PlanProtocol.Failure("订阅推理授权已改变，请重新授权", "PERMISSION");
            operation.check();
            return saved.getString("access_token");
        }
    }
    @PluginMethod public void models(PluginCall call) {
        int requestEpoch = epoch.get();
        AtomicBoolean settled = new AtomicBoolean();
        PlanOperation operation = PlanProtocol.operation(35000, reason -> { if (settled.compareAndSet(false, true)) call.reject("加载模型列表超过35秒，请检查手机网络后重试", "NETWORK_TIMEOUT"); });
        workers.execute(() -> {
            try {
                JSONObject response = PlanProtocol.json(PlanProtocol.MODELS, "GET", null, accessToken(requestEpoch, operation), operation);
                JSONArray models = response.getJSONArray("models"), visible = new JSONArray();
                for (int i = 0; i < models.length(); i++) {
                    JSONObject model = models.getJSONObject(i);
                    if ("list".equals(model.optString("visibility"))) visible.put(new JSONObject().put("slug", model.getString("slug")).put("display_name", model.optString("display_name", model.getString("slug"))));
                }
                if (requestEpoch != epoch.get()) throw new PlanProtocol.Failure("账号已退出，请重新登录", "CANCELLED");
                operation.check();
                JSObject result = new JSObject(); result.put("models", visible); if (settled.compareAndSet(false, true)) call.resolve(result);
            } catch (Exception e) { if (settled.compareAndSet(false, true)) reject(call, e); }
            finally { operation.close(); }
        });
    }
    @PluginMethod public void respond(PluginCall call) {
        Inference request = new Inference(call, epoch.get());
        if (!inference.compareAndSet(null, request)) { call.reject("已有解析进行中，请等待或取消", "BUSY"); return; }
        workers.execute(() -> runResponse(request));
    }
    private void runResponse(Inference request) {
        ScheduledFuture<?> timeout = deadlines.schedule(request::close, 240, TimeUnit.SECONDS);
        request.operation = PlanProtocol.operation(240000, null);
        try {
            JSONObject body = request.call.getObject("body");
            if (body == null) throw new PlanProtocol.Failure("解析请求缺失", "REQUEST");
            byte[] encoded = PlanProtocol.requestBody(body);
            String access = accessToken(request.epoch, request.operation);
            if (request.cancelled) throw new PlanProtocol.Failure("解析已取消", "CANCELLED");
            HttpsURLConnection c = PlanProtocol.connection(PlanProtocol.RESPONSES, "POST");
            request.operation.attach(c::disconnect);
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
        } finally { timeout.cancel(false); request.close(); request.operation.close(); inference.compareAndSet(request, null); }
    }
    @PluginMethod public void cancel(PluginCall call) { Inference request = inference.get(); if (request != null) request.close(); call.resolve(); }
    @PluginMethod public void signOut(PluginCall call) {
        if (!signingOut.compareAndSet(false, true)) { call.reject("正在退出账号", "BUSY"); return; }
        epoch.incrementAndGet();
        Attempt attempt = login.get(); if (attempt != null) cancelAttempt(attempt, "已退出账号，登录已取消");
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
                    cacheAccount(cleared);
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
        Attempt attempt = login.get(); if (attempt != null) cancelAttempt(attempt, "应用页面已关闭，请重新发起登录");
        Inference request = inference.get(); if (request != null) request.close();
        workers.shutdown(); deadlines.shutdownNow();
        super.handleOnDestroy();
    }
}
