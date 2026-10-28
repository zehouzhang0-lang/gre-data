package cn.grestudy.vocabulary;

import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

/** Pure protocol helpers. Diagnostic snapshots deliberately have no request or credential fields. */
final class PlanLoginSupport {
    static final String MODE = "official_sdk_default";
    static final String SCOPES = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";

    static String authorizationQuery(String client, String redirect, String state, String nonce,
                                     String challenge, boolean registration, String email) throws Exception {
        Map<String, String> query = new LinkedHashMap<>();
        query.put("client_id", client);
        query.put("response_type", "code");
        query.put("redirect_uri", redirect);
        query.put("scope", SCOPES);
        query.put("resource", "https://api.openai.com/v1");
        query.put("state", state);
        query.put("nonce", nonce);
        query.put("code_challenge_method", "S256");
        query.put("code_challenge", challenge);
        if (registration) query.put("agent_name_hint", "GRE词库");
        else if (email != null && !email.isEmpty()) query.put("login_hint", email);
        // Official DevKit oauth.ts sends ext_agent_host_id only if sendHostId is true;
        // types.ts defaults it to false, although the prose sign-in guide says required.
        // Follow that SDK default without deleting the protected stable host/registration.
        // Verified SDK revision 0a36fefeb913055c8c7a1a29b63d82b96b2e841a (2026-10-07).
        // https://github.com/openai/sign-in-with-chatgpt-devkit/blob/0a36fefeb913055c8c7a1a29b63d82b96b2e841a/packages/local/src/oauth.ts
        // https://developers.openai.com/siwc/token-sharing-open-source/sign-in
        StringBuilder encoded = new StringBuilder();
        for (Map.Entry<String, String> entry : query.entrySet()) {
            if (encoded.length() > 0) encoded.append('&');
            encoded.append(URLEncoder.encode(entry.getKey(), "UTF-8")).append('=')
                .append(URLEncoder.encode(entry.getValue(), "UTF-8"));
        }
        return encoded.toString();
    }

    enum Rejection { NONE, METHOD, HOST, PATH, STATE, DUPLICATE, MALFORMED, TIMEOUT, IO }

    static final class Callback {
        final Map<String, String> params;
        final Rejection rejection;
        Callback(Map<String, String> params, Rejection rejection) { this.params = params; this.rejection = rejection; }
        boolean valid() { return rejection == Rejection.NONE; }
    }

    static Callback parseCallback(String request, String host, String expectedHost, String expectedState) {
        Map<String, String> params = new HashMap<>();
        Rejection rejection = Rejection.NONE;
        try {
            String[] start = request == null ? new String[0] : request.split(" ");
            if (start.length != 3) rejection = Rejection.MALFORMED;
            else if (!"GET".equals(start[0])) rejection = Rejection.METHOD;
            else if (!expectedHost.equals(host)) rejection = Rejection.HOST;
            else {
                int question = start[1].indexOf('?');
                if (question <= 0 || !"/auth/callback".equals(start[1].substring(0, question))) rejection = Rejection.PATH;
                else {
                    for (String pair : start[1].substring(question + 1).split("&")) {
                        String[] pieces = pair.split("=", 2);
                        String key = URLDecoder.decode(pieces[0], "UTF-8");
                        String value = URLDecoder.decode(pieces.length > 1 ? pieces[1] : "", "UTF-8");
                        if (params.put(key, value) != null) rejection = Rejection.DUPLICATE;
                    }
                    if (rejection == Rejection.NONE && (params.get("state") == null || !MessageDigest.isEqual(
                        expectedState.getBytes(StandardCharsets.UTF_8), params.get("state").getBytes(StandardCharsets.UTF_8)))) rejection = Rejection.STATE;
                }
            }
        } catch (Exception ignored) { rejection = Rejection.MALFORMED; }
        return new Callback(params, rejection);
    }

    static final class Diagnostics {
        private final AtomicInteger requests = new AtomicInteger();
        private final AtomicBoolean validCallback = new AtomicBoolean();
        private volatile Rejection lastRejection = Rejection.NONE;
        // Count all loopback request lines, including favicon and unrelated probes.
        void requestRead() { requests.incrementAndGet(); }
        void accepted() { validCallback.set(true); }
        void rejected(Rejection reason) { if (reason != Rejection.NONE) lastRejection = reason; }
        Map<String, Object> snapshot(String version, String phase, long elapsed, boolean listenerOpen) {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("app_version", version);
            result.put("phase", phase);
            result.put("elapsed_seconds", elapsed);
            result.put("listener_open", listenerOpen);
            result.put("callback_requests_seen", requests.get());
            result.put("valid_callback_received", validCallback.get());
            result.put("last_callback_rejection", lastRejection.name().toLowerCase(java.util.Locale.ROOT));
            return result;
        }
    }
}
