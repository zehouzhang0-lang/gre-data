import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('real Capacitor practice proxy persists separately and rejects failures without touching vocabulary', () => {
  const script = `
    import assert from 'node:assert/strict';
    const documents = { VocabStorage: 'original vocabulary and learning records', PracticeStorage: null };
    const calls = [];
    let fail = false;
    globalThis.androidBridge = { postMessage() {} };
    globalThis.Capacitor = {
      PluginHeaders: ['VocabStorage', 'PracticeStorage'].map(name => ({
        name, methods: ['read', 'write'].map(name => ({ name, rtype: 'promise' }))
      })),
      nativePromise: async (plugin, method, args) => {
        calls.push({ plugin, method });
        assert.ok(Object.hasOwn(documents, plugin));
        if (method === 'read') return { value: documents[plugin] };
        if (method === 'write') {
          if (fail) throw Error('disk full');
          documents[plugin] = args.value; return {};
        }
        throw Error('Unexpected native method: ' + method);
      }
    };
    const { createPracticeStorage } = await import(${JSON.stringify(new URL('../src/practice/storage.mjs', import.meta.url).href)});
    const practice = await createPracticeStorage();
    assert.equal(await practice.read(), null);
    await practice.write('saved practice answer');
    const reopened = await createPracticeStorage();
    assert.equal(await reopened.read(), 'saved practice answer');
    fail = true;
    await assert.rejects(reopened.write('bad replacement'), /disk full/);
    assert.equal(await reopened.read(), 'saved practice answer');
    assert.equal(documents.VocabStorage, 'original vocabulary and learning records');
    assert.ok(calls.every(call => call.plugin === 'PracticeStorage' && call.method !== 'then'));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
