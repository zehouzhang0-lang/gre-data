package cn.grestudy.vocabulary;

import java.net.URLDecoder;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;

/** Synthetic fixtures only; does not open sockets, fetch endpoints or read app storage. */
public final class PlanLoginSupportTest {
    private static final String STATE = "fixture_state_secret_123";
    private static final String CODE = "fixture_code_secret_456";
    private static final String HOST = "127.0.0.1:41001";
    private static void require(boolean value, String message) { if (!value) throw new AssertionError(message); }
    private static Map<String, String> decode(String query) throws Exception {
        Map<String, String> result = new HashMap<>();
        for (String pair : query.split("&")) {
            String[] fields = pair.split("=", 2);
            result.put(URLDecoder.decode(fields[0], "UTF-8"), URLDecoder.decode(fields[1], "UTF-8"));
        }
        return result;
    }
    private static void authorizationFixture() throws Exception {
        String redirect = "http://" + HOST + "/auth/callback";
        Map<String, String> query = decode(PlanLoginSupport.authorizationQuery("dynamic_agent_client", redirect,
            STATE, "fixture_nonce", "fixture_s256_challenge", true, "fixture@example.test"));
        require(!query.containsKey("ext_agent_host_id") && !query.containsKey("id_token_hint"), "SDK default must omit host/token hints");
        require(query.keySet().equals(new HashSet<>(Arrays.asList("client_id", "response_type", "redirect_uri", "scope", "resource", "state", "nonce", "code_challenge_method", "code_challenge", "agent_name_hint"))), "initial query has unexpected fields");
        require("dynamic_agent_client".equals(query.get("client_id")) && "code".equals(query.get("response_type")), "registration grant changed");
        require(redirect.equals(query.get("redirect_uri")) && STATE.equals(query.get("state")), "callback binding changed");
        require("fixture_nonce".equals(query.get("nonce")) && "S256".equals(query.get("code_challenge_method")) && "fixture_s256_challenge".equals(query.get("code_challenge")), "OIDC/PKCE fields changed");
        require("https://api.openai.com/v1".equals(query.get("resource")) && PlanLoginSupport.SCOPES.equals(query.get("scope")), "resource/scopes changed");
        require("GRE词库".equals(query.get("agent_name_hint")), "registration name encoding changed");
        query = decode(PlanLoginSupport.authorizationQuery("oaiapp_fixture", redirect, STATE, "nonce", "challenge", false, "fixture@example.test"));
        require("oaiapp_fixture".equals(query.get("client_id")) && "fixture@example.test".equals(query.get("login_hint")), "saved registration not retained");
        require(!query.containsKey("agent_name_hint") && !query.containsKey("ext_agent_host_id"), "returning query contains registration/host hint");
    }
    private static String request(String query) { return "GET /auth/callback?" + query + " HTTP/1.1"; }
    private static void rejects(String line, String host, PlanLoginSupport.Rejection expected) {
        require(PlanLoginSupport.parseCallback(line, host, HOST, STATE).rejection == expected, "callback classification: " + expected);
    }
    private static void callbackFixture() {
        PlanLoginSupport.Callback result = PlanLoginSupport.parseCallback(request("state=" + STATE + "&code=" + CODE + "&scope=openid+email&client_id=oaiapp_fixture"), HOST, HOST, STATE);
        require(result.valid() && CODE.equals(result.params.get("code")), "valid callback rejected");
        require(PlanLoginSupport.parseCallback(request("state=" + STATE + "&error=access_denied"), HOST, HOST, STATE).valid(), "OAuth denial must still validate state");
        rejects("OPTIONS /auth/callback HTTP/1.1", HOST, PlanLoginSupport.Rejection.METHOD);
        rejects(request("state=" + STATE), "localhost:41001", PlanLoginSupport.Rejection.HOST);
        rejects("GET /favicon.ico HTTP/1.1", HOST, PlanLoginSupport.Rejection.PATH);
        rejects(request("state=wrong"), HOST, PlanLoginSupport.Rejection.STATE);
        rejects(request("state=" + STATE + "&state=" + STATE), HOST, PlanLoginSupport.Rejection.DUPLICATE);
        rejects(request("state=" + STATE + "&code=a&code=b"), HOST, PlanLoginSupport.Rejection.DUPLICATE);
        rejects(request("state=%xx"), HOST, PlanLoginSupport.Rejection.MALFORMED);
        rejects(null, HOST, PlanLoginSupport.Rejection.MALFORMED);
        rejects("junk", HOST, PlanLoginSupport.Rejection.MALFORMED);
    }
    private static void diagnosticFixture() {
        PlanLoginSupport.Diagnostics diagnostics = new PlanLoginSupport.Diagnostics();
        Map<String, Object> initial = diagnostics.snapshot("0.3.2", "awaiting_browser", 12, true);
        require(initial.get("callback_requests_seen").equals(0) && initial.get("last_callback_rejection").equals("none"), "initial diagnostics must be empty");
        diagnostics.requestRead();
        diagnostics.rejected(PlanLoginSupport.parseCallback(request("state=bad&code=" + CODE), HOST, HOST, STATE).rejection);
        diagnostics.requestRead(); diagnostics.accepted();
        Map<String, Object> snapshot = diagnostics.snapshot("0.3.2", "exchanging", 14, true);
        require(snapshot.get("callback_requests_seen").equals(2) && snapshot.get("valid_callback_received").equals(true), "callback counters incorrect");
        require(snapshot.get("last_callback_rejection").equals("state"), "latest prior rejection must remain visible");
        require(snapshot.keySet().equals(new HashSet<>(Arrays.asList("app_version", "phase", "elapsed_seconds", "listener_open", "callback_requests_seen", "valid_callback_received", "last_callback_rejection"))), "diagnostic field allowlist changed");
        require(!snapshot.toString().contains(STATE) && !snapshot.toString().contains(CODE) && !snapshot.toString().contains(HOST), "diagnostics leaked callback values");
        diagnostics.rejected(PlanLoginSupport.Rejection.TIMEOUT);
        require(diagnostics.snapshot("0.3.2", "awaiting_browser", 20, true).get("last_callback_rejection").equals("timeout"), "timeout classification missing");
        diagnostics.rejected(PlanLoginSupport.Rejection.IO);
        require(diagnostics.snapshot("0.3.2", "failed", 21, false).get("last_callback_rejection").equals("io"), "I/O classification missing");
        require(new PlanLoginSupport.Diagnostics().snapshot("0.3.2", "starting", 0, false).get("callback_requests_seen").equals(0), "new attempt must reset counters");
    }
    public static void main(String[] args) throws Exception {
        authorizationFixture(); callbackFixture(); diagnosticFixture();
        System.out.println("PASS 3/3 SDK-default authorization/callback/diagnostic regressions (offline)");
    }
}
