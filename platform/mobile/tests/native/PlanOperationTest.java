package cn.grestudy.vocabulary;

import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

/** No network, Android runtime, token files, or learning data. */
public final class PlanOperationTest {
    private static final ScheduledExecutorService timers = Executors.newScheduledThreadPool(2);
    private static final ExecutorService closers = Executors.newCachedThreadPool();
    private static int passed;
    private static void require(boolean value, String message) { if (!value) throw new AssertionError(message); }
    private static void stopped(PlanOperation operation, String code) throws Exception {
        try { operation.check(); throw new AssertionError("operation was still live"); }
        catch (PlanOperation.Stopped error) { require(error.code.equals(code), "wrong terminal reason"); }
    }
    private static void lateWrite(PlanOperation operation, AtomicInteger writes) throws Exception {
        try { operation.commit(writes::incrementAndGet); throw new AssertionError("late write accepted"); }
        catch (PlanOperation.Stopped expected) {}
    }
    private static void timeoutDisconnectsWithoutWaiting() throws Exception {
        CountDownLatch ended = new CountDownLatch(1), closing = new CountDownLatch(1), unblock = new CountDownLatch(1);
        PlanOperation operation = new PlanOperation(100, timers, closers, reason -> ended.countDown());
        operation.attach(() -> { closing.countDown(); try { unblock.await(2, TimeUnit.SECONDS); } catch (InterruptedException ignored) {} });
        require(ended.await(1, TimeUnit.SECONDS), "hard deadline did not publish terminal state");
        require(closing.await(1, TimeUnit.SECONDS), "stalled transport was not disconnected");
        AtomicInteger writes = new AtomicInteger();
        lateWrite(operation, writes);
        require(writes.get() == 0, "timeout allowed a credential write");
        stopped(operation, "TIMEOUT"); unblock.countDown(); operation.close(); passed++;
    }
    private static void cancelReleasesAttemptAndRejectsOldCompletion() throws Exception {
        Object old = new Object(), fresh = new Object();
        AtomicReference<Object> flight = new AtomicReference<>(old);
        AtomicReference<String> phase = new AtomicReference<>("exchanging");
        PlanOperation operation = new PlanOperation(2000, timers, closers, reason -> { phase.set("cancelled"); flight.compareAndSet(old, null); });
        operation.cancel();
        require(phase.get().equals("cancelled") && flight.get() == null, "cancel did not immediately release flight");
        require(flight.compareAndSet(null, fresh), "new attempt could not start");
        AtomicInteger writes = new AtomicInteger();
        lateWrite(operation, writes);
        require(flight.get() == fresh && writes.get() == 0, "old completion overwrote new attempt");
        CountDownLatch disconnected = new CountDownLatch(1);
        try { operation.attach(disconnected::countDown); } catch (PlanOperation.Stopped expected) {}
        require(disconnected.await(1, TimeUnit.SECONDS), "late attached socket leaked");
        operation.close(); passed++;
    }
    private static void exchangeAndVerificationShareDeadline() throws Exception {
        CountDownLatch ended = new CountDownLatch(1);
        PlanOperation operation = new PlanOperation(150, timers, closers, reason -> ended.countDown());
        Thread.sleep(80); operation.check(); // token exchange finished; verification has no fresh budget
        require(ended.await(1, TimeUnit.SECONDS), "verification extended the shared deadline");
        AtomicInteger writes = new AtomicInteger(); lateWrite(operation, writes);
        require(writes.get() == 0, "late JWKS success was accepted");
        operation.close(); passed++;
    }
    private static void stageRenewalPreservesCancellationResource() throws Exception {
        CountDownLatch ended = new CountDownLatch(1), closed = new CountDownLatch(1);
        PlanOperation operation = new PlanOperation(100, timers, closers, reason -> ended.countDown());
        operation.attach(closed::countDown);
        operation.renew(400);
        require(!ended.await(180, TimeUnit.MILLISECONDS), "old callback timer cancelled a renewed stage");
        require(closed.getCount() == 1, "stage change closed the callback listener");
        operation.cancel();
        require(closed.await(1, TimeUnit.SECONDS), "renewed operation lost its listener");
        operation.close(); passed++;
    }
    private static void commitAndTerminalStateAreAtomic() throws Exception {
        Object gate = new Object(); AtomicInteger writes = new AtomicInteger(), errors = new AtomicInteger();
        AtomicReference<String> phase = new AtomicReference<>("verifying");
        PlanOperation operation = new PlanOperation(120, timers, closers, reason -> { errors.incrementAndGet(); phase.set("failed"); }, gate);
        operation.commit(() -> { writes.incrementAndGet(); phase.set("connected"); });
        operation.cancel(); Thread.sleep(170);
        require(writes.get() == 1 && errors.get() == 0 && phase.get().equals("connected"), "late timer overwrote a committed login");
        operation.close(); passed++;
    }
    private static void validatedCallbackSurvivesBrowserDisconnect() {
        Object validated = new Object();
        Object received = PlanCallbackDelivery.accepted(validated, () -> { throw new java.io.IOException("simulated closed browser socket"); });
        require(received == validated, "browser flush failure discarded the validated callback");
        passed++;
    }
    public static void main(String[] args) throws Exception {
        try {
            timeoutDisconnectsWithoutWaiting();
            cancelReleasesAttemptAndRejectsOldCompletion();
            exchangeAndVerificationShareDeadline();
            stageRenewalPreservesCancellationResource();
            commitAndTerminalStateAreAtomic();
            validatedCallbackSurvivesBrowserDisconnect();
            System.out.println("PASS " + passed + "/6 native login cancellation/deadline/callback regressions (offline)");
        } finally { timers.shutdownNow(); closers.shutdownNow(); }
    }
}
