package cn.grestudy.vocabulary;

/** Call only after all callback validation has passed. Browser UI is not the OAuth receipt. */
final class PlanCallbackDelivery {
    interface Feedback { void send() throws Exception; }
    static <T> T accepted(T callback, Feedback feedback) {
        try { feedback.send(); } catch (Exception ignored) { /* Browser may already have returned to the app. */ }
        return callback;
    }
}
