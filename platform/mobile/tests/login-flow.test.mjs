import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedCall, createLoginFlow, loginPhaseText } from '../src/ai/login-flow.mjs';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
function fakeClock() {
  let time = 0, sequence = 0;
  const timers = new Map();
  return {
    now: () => time,
    setTimer(fn, delay) { const id = ++sequence; timers.set(id, { fn, at: time + delay }); return id; },
    clearTimer(id) { timers.delete(id); },
    async advance(ms) {
      const target = time + ms;
      while (true) {
        const next = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        time = next[1].at; timers.delete(next[0]); next[1].fn(); await flush();
      }
      time = target; await flush();
    },
    pending: () => timers.size,
  };
}
const status = (phase = 'idle', connected = false, id = null) => ({ available: true, connected, eligible: connected, ...(connected ? { email: 'fixture@example.test' } : {}), login: { id, phase, elapsed_seconds: 2 } });
function setup(overrides = {}) {
  const clock = fakeClock(), native = { value: status(), calls: 0 }, notices = [];
  const api = {
    connectionStatus: async () => { native.calls++; return native.value; },
    signIn: async () => { native.value = status('awaiting_browser', false, 'login-1'); return native.value; },
    cancelSignIn: async () => { native.value = { ...native.value, login: { ...native.value.login, phase: 'cancelled' } }; return native.value; },
    signOut: async () => { native.value = status(); return { revoked: true }; },
    listModels: async () => [{ slug: 'fixture-model' }], ...overrides,
  };
  const flow = createLoginFlow({ api, ...clock, onConnectionChanged: value => notices.push(value), timeouts: { status: 60, signIn: 60, cancelSignIn: 60, models: 400, signOut: 100 }, pollMs: 20, idlePollMs: 100, pollWindowMs: 500 });
  return { clock, native, api, flow, notices };
}

test('foreground callback recovery follows native phases even when signIn promise is lost', async () => {
  const lost = deferred(), f = setup();
  f.api.signIn = () => { f.native.value = status('awaiting_browser', false, 'login-1'); return lost.promise; };
  f.flow.setActive(true); await flush(); f.flow.start(); await flush();
  assert.equal(f.flow.getState().login.phase, 'awaiting_browser');
  f.flow.setActive(false);
  f.native.value = status('exchanging', false, 'login-1');
  f.flow.setActive(true); await flush();
  assert.equal(f.flow.getState().login.phase, 'exchanging');
  assert(!loginPhaseText.exchanging.includes('浏览器'));
  f.native.value = status('verifying', false, 'login-1');
  await f.clock.advance(20);
  assert.equal(f.flow.getState().login.phase, 'verifying');
  f.native.value = status('connected', true, 'login-1');
  await f.clock.advance(20);
  assert.equal(f.flow.getState().connection.connected, true);
  assert.equal(f.flow.getState().models[0].slug, 'fixture-model');
  await f.clock.advance(80);
  assert.equal(f.flow.getState().loginError, '');
  assert.equal(f.flow.getState().login.phase, 'connected');
  f.flow.dispose();
});

test('models failure and timeout never erase account; reload works and ignores late model response', async () => {
  const f = setup({ listModels: async () => { throw Error('fixture model outage'); } });
  f.native.value = status('connected', true, 'account');
  f.flow.setActive(true); await flush();
  assert.equal(f.flow.getState().connection.email, 'fixture@example.test');
  assert.match(f.flow.getState().modelsError, /outage/);
  assert.equal(f.flow.getState().modelsBusy, false);
  const late = deferred(); f.api.listModels = () => late.promise;
  void f.flow.loadModels(); await flush(); await f.clock.advance(400);
  assert.equal(f.flow.getState().connection.connected, true);
  assert.equal(f.flow.getState().modelsBusy, false);
  assert.match(f.flow.getState().modelsError, /超时/);
  f.api.listModels = async () => [{ slug: 'reloaded' }];
  await f.flow.loadModels();
  late.resolve([{ slug: 'stale' }]); await flush();
  assert.deepEqual(f.flow.getState().models, [{ slug: 'reloaded' }]);
  assert.equal(f.flow.getState().modelsError, '');
  f.flow.dispose();
});

test('cancel releases login immediately, preserves existing connection and discards old async status/signIn', async () => {
  const launch = deferred(), oldStatus = deferred(), f = setup();
  f.native.value = status('connected', true, 'original-account');
  await f.flow.refresh(); await flush();
  f.api.signIn = () => { f.native.value = status('awaiting_browser', true, 'old-login'); return launch.promise; };
  f.flow.start(); await flush();
  f.api.connectionStatus = () => oldStatus.promise;
  const oldRead = f.flow.refresh(); await flush();
  const cancelling = f.flow.cancel();
  assert.equal(f.flow.getState().login.phase, 'cancelled');
  assert.equal(f.flow.getState().statusBusy, false);
  assert.equal(f.flow.getState().connection.connected, true);
  await cancelling;
  oldStatus.resolve(status('connected', true, 'old-login'));
  launch.resolve(status('connected', true, 'old-login'));
  await oldRead; await flush();
  assert.equal(f.flow.getState().login.phase, 'cancelled');
  assert.equal(f.flow.getState().connection.connected, true);
  f.api.connectionStatus = async () => f.native.value;
  f.api.signIn = async () => { f.native.value = status('exchanging', true, 'new-login'); return f.native.value; };
  f.flow.start(); await flush();
  assert.equal(f.flow.getState().login.id, 'new-login');
  assert.equal(f.flow.getState().login.phase, 'exchanging');
  f.flow.dispose();
});

test('status timeout releases busy, keeps connection and supports foreground retry', async () => {
  const f = setup(); f.native.value = status('connected', true, 'account');
  f.flow.setActive(true); await flush();
  const hung = deferred(); f.api.connectionStatus = () => hung.promise;
  f.flow.wake(); await flush(); await f.clock.advance(60);
  assert.equal(f.flow.getState().statusBusy, false);
  assert.equal(f.flow.getState().connection.connected, true);
  assert.match(f.flow.getState().statusError, /超时/);
  f.api.connectionStatus = async () => f.native.value;
  f.flow.wake(); await flush();
  assert.equal(f.flow.getState().statusError, '');
  hung.resolve(status('failed', false, 'stale')); await flush();
  assert.equal(f.flow.getState().connection.connected, true);
  f.flow.dispose();
});

test('polling is bounded per visible period and terminal failure permits retry', async () => {
  const f = setup(); f.flow.setActive(true); await flush(); f.flow.start(); await flush();
  await f.clock.advance(500);
  assert.equal(f.flow.getState().pollingPaused, true);
  assert.match(f.flow.getState().loginError, /超时/);
  const calls = f.native.calls; await f.clock.advance(1000); assert.equal(f.native.calls, calls);
  f.flow.wake(); await flush(); assert.equal(f.flow.getState().pollingPaused, false);
  f.native.value = { ...status('failed', false, 'login-1'), login: { id: 'login-1', phase: 'failed', elapsed_seconds: 30, error: 'fixture authorization denied', error_code: 'denied' } };
  await f.clock.advance(20);
  assert.equal(f.flow.getState().login.phase, 'failed');
  assert.match(f.flow.getState().loginError, /denied/);
  f.api.signIn = async () => { f.native.value = status('awaiting_browser', false, 'retry-2'); return f.native.value; };
  f.flow.start(); await flush();
  assert.equal(f.flow.getState().login.id, 'retry-2');
  assert.equal(f.flow.getState().loginError, '');
  f.flow.setActive(false); const stopped = f.native.calls; await f.clock.advance(1000); assert.equal(f.native.calls, stopped);
  f.flow.dispose();
});

test('cancel after native completion retains connected account and loads models', async () => {
  const f = setup(); f.flow.start(); await flush();
  f.api.cancelSignIn = async () => status('connected', true, 'login-1');
  await f.flow.cancel(); await flush();
  assert.equal(f.flow.getState().connection.connected, true);
  assert.equal(f.flow.getState().login.phase, 'connected');
  assert.equal(f.flow.getState().models[0].slug, 'fixture-model');
  f.flow.dispose();
});

test('explicit launch failure stays visible and browser preview never starts authentication', async () => {
  const f = setup({ signIn: async () => { throw Error('fixture browser cannot open'); } });
  f.flow.start(); await flush();
  assert.match(f.flow.getState().loginError, /browser cannot open/);
  assert(['idle', 'failed'].includes(f.flow.getState().login.phase));
  f.native.value = { ...status(), available: false };
  await f.flow.refresh();
  let called = false; f.api.signIn = async () => { called = true; };
  f.flow.start(); await flush(); assert.equal(called, false);
  f.flow.dispose();
});

test('bounded bridge operation settles once; late rejection/resolution cannot revive it', async () => {
  const clock = fakeClock(), late = deferred();
  const operation = boundedCall(() => late.promise, 20, 'fixture timeout', clock);
  const rejected = assert.rejects(operation, /fixture timeout/);
  await clock.advance(20); await rejected;
  late.resolve('late'); await flush();
  assert.equal(clock.pending(), 0);
});
