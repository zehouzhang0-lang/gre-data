import test from 'node:test';
import assert from 'node:assert/strict';
import { STARTUP_SLOW_MS, watchStartup } from '../src/useRepository.js';

function pending() {
  let resolve, reject;
  const operation = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { operation, resolve, reject };
}
function observer(operation) {
  const calls = [], timers = new Map();
  let delay;
  const stop = watchStartup(operation, {
    onSlow: () => calls.push(['slow']), onReady: value => calls.push(['ready', value]), onError: error => calls.push(['error', error.message]),
    setTimer: (callback, ms) => { delay = ms; timers.set(1, callback); return 1; }, clearTimer: id => timers.delete(id),
  });
  return { calls, timers, stop, fire: () => timers.get(1)?.(), delay };
}

test('startup warns after 15 seconds without cancelling a late successful read', async () => {
  const read = pending(), view = observer(read.operation);
  assert.equal(view.delay, STARTUP_SLOW_MS);
  assert.equal(view.delay, 15_000);
  view.fire();
  assert.deepEqual(view.calls, [['slow']]);
  read.resolve({ words: 12 }); await read.operation; await Promise.resolve();
  assert.deepEqual(view.calls, [['slow'], ['ready', { words: 12 }]]);
  assert.equal(view.timers.size, 0);
});

test('successful or failed startup cancels the pending slow warning', async () => {
  for (const outcome of ['success', 'failure']) {
    const read = pending(), view = observer(read.operation);
    if (outcome === 'success') read.resolve('data'); else read.reject(Error('read failed'));
    await read.operation.catch(() => {}); await Promise.resolve();
    view.fire();
    assert.deepEqual(view.calls, outcome === 'success' ? [['ready', 'data']] : [['error', 'read failed']]);
    assert.equal(view.timers.size, 0);
  }
});

test('a real error still arrives after the slow warning', async () => {
  const read = pending(), view = observer(read.operation);
  view.fire(); read.reject(Error('corrupt storage'));
  await read.operation.catch(() => {}); await Promise.resolve();
  assert.deepEqual(view.calls, [['slow'], ['error', 'corrupt storage']]);
});

test('cleanup silences timeout and late completion without cancelling the operation', async () => {
  const read = pending(), view = observer(read.operation);
  view.stop(); view.fire(); read.resolve('preserved');
  assert.equal(await read.operation, 'preserved'); await Promise.resolve();
  assert.deepEqual(view.calls, []); assert.equal(view.timers.size, 0);
});
