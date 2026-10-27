package cn.grestudy.vocabulary;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/**
 * One absolute deadline shared by every HTTP request in an operation.
 * No Android or credential dependency, so cancellation races are testable offline.
 */
final class PlanOperation implements AutoCloseable {
    static final class Stopped extends Exception {
        final String code;
        Stopped(String code) { super(code); this.code = code; }
    }
    interface Commit { void run() throws Exception; }
    interface Ended { void accept(String reason); }
    private volatile long expiresAt;
    private final Executor closer;
    private final Ended ended;
    private final Set<Runnable> resources = ConcurrentHashMap.newKeySet();
    private volatile ScheduledFuture<?> timeout;
    private final ScheduledExecutorService timers;
    private volatile String reason = "";
    private final Object commitGate;

    PlanOperation(long timeoutMillis, ScheduledExecutorService timers, Executor closer, Ended ended) {
        this(timeoutMillis, timers, closer, ended, new Object());
    }
    PlanOperation(long timeoutMillis, ScheduledExecutorService timers, Executor closer, Ended ended, Object gate) {
        this.commitGate = gate;
        this.timers = timers;
        this.expiresAt = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMillis);
        this.closer = closer;
        this.ended = ended;
        this.timeout = timers.schedule(this::expire, timeoutMillis, TimeUnit.MILLISECONDS);
    }
    private void expire() { synchronized (commitGate) { if (System.nanoTime() >= expiresAt) stop("TIMEOUT"); } }
    void renew(long milliseconds) throws Stopped {
        synchronized (commitGate) {
            check();
            timeout.cancel(false);
            expiresAt = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(milliseconds);
            timeout = timers.schedule(this::expire, milliseconds, TimeUnit.MILLISECONDS);
        }
    }
    boolean active() { return reason.isEmpty() && System.nanoTime() < expiresAt; }
    int remainingMillis() throws Stopped {
        check();
        return (int) Math.max(1, Math.min(Integer.MAX_VALUE, TimeUnit.NANOSECONDS.toMillis(expiresAt - System.nanoTime())));
    }
    void check() throws Stopped {
        if (reason.isEmpty() && System.nanoTime() >= expiresAt) stop("TIMEOUT");
        if (!reason.isEmpty()) throw new Stopped(reason);
    }
    void attach(Runnable close) throws Stopped {
        try { check(); } catch (Stopped stopped) { closeAsync(close); throw stopped; }
        resources.add(close);
        if (!active()) { resources.remove(close); closeAsync(close); check(); }
    }
    void detach(Runnable close) { resources.remove(close); }
    private void closeAsync(Runnable close) {
        try { closer.execute(() -> { try { close.run(); } catch (RuntimeException ignored) {} }); }
        catch (RuntimeException ignored) { /* Executor is only stopped after operations are cancelled. */ }
    }
    void cancel() { stop("CANCELLED"); }
    private void stop(String why) {
        // Only the final local atomic persistence is protected here, never a network call.
        synchronized (commitGate) {
            if (!reason.isEmpty()) return;
            reason = why;
            if (ended != null) ended.accept(why);
        }
        timeout.cancel(false);
        for (Runnable resource : resources) closeAsync(resource);
        resources.clear();
    }
    boolean commit(Commit action) throws Exception {
        synchronized (commitGate) {
            check();
            action.run();
            reason = "FINISHED";
            timeout.cancel(false);
        }
        for (Runnable resource : resources) closeAsync(resource);
        resources.clear();
        return true;
    }
    void guard(Commit action) throws Exception {
        synchronized (commitGate) { check(); action.run(); }
    }
    @Override public void close() {
        synchronized (commitGate) {
            if (reason.isEmpty()) reason = "FINISHED";
            timeout.cancel(false);
        }
        for (Runnable resource : resources) closeAsync(resource);
        resources.clear();
    }
}
