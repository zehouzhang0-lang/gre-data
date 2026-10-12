import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// Run the real Capacitor Proxy in a fresh native-platform JS context. Mock only
// Android's transport; a plain-object plugin mock would miss thenable adoption.
const storageUrl = new URL('../src/data/storage.mjs', import.meta.url).href;
const repositoryUrl = new URL('../src/data/repository.mjs', import.meta.url).href;
function nativeCase(body) {
  const script = `
    import assert from 'node:assert/strict';
    const calls = [], unhandled = [];
    let persisted = null, failRead = false, failWrite = false;
    process.on('unhandledRejection', error => unhandled.push(String(error)));
    globalThis.androidBridge = { postMessage() {} };
    globalThis.Capacitor = {
      PluginHeaders: [{ name: 'VocabStorage', methods: ['read','write','exportFile','importFile'].map(name => ({ name, rtype: 'promise' })) }],
      nativePromise: async (plugin, method, args) => {
        calls.push({ plugin, method, args });
        if (method === 'read') { if (failRead) throw Error('native read failed'); return { value: persisted }; }
        if (method === 'write') { if (failWrite) throw Error('native write failed'); persisted = args.value; return {}; }
        if (method === 'exportFile') return { name: args.name, uri: 'content://test/backup.json' };
        if (method === 'importFile') return { name: 'backup.json', content: persisted };
        throw Error('unexpected native method: ' + method);
      }
    };
    const deadline = setTimeout(() => { console.error('Native bridge did not settle; ' + unhandled.join('; ')); process.exit(1); }, 2000);
    try {
      const { createStorage, exportFile, importFile } = await import(${JSON.stringify(storageUrl)});
      ${body}
      await new Promise(resolve => setTimeout(resolve, 0));
      assert.deepEqual(unhandled, []);
      assert.ok(calls.every(call => call.method !== 'then'));
    } finally { clearTimeout(deadline); }
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test('actual native Capacitor proxy resolves storage and file calls without thenable deadlock', () => nativeCase(`
  const storage = await createStorage();
  assert.equal(storage.kind, 'sqlite');
  assert.equal(await storage.read(), null);
  await storage.write('中文词库');
  assert.equal(await storage.read(), '中文词库');
  assert.deepEqual(await exportFile('backup.json', persisted), { name: 'backup.json', uri: 'content://test/backup.json' });
  assert.deepEqual(await importFile(), { name: 'backup.json', content: '中文词库' });
  assert.deepEqual(calls.map(call => call.method), ['read', 'write', 'read', 'exportFile', 'importFile']);
`));

test('native first open persists once and reopening keeps existing dataset', () => nativeCase(`
  const { openRepository, emptyData } = await import(${JSON.stringify(repositoryUrl)});
  const firstSeed = emptyData();
  const repo = await openRepository({ seed: firstSeed });
  assert.equal((await repo.getState()).storageKind, 'sqlite');
  assert.equal(JSON.parse(persisted).current.dataset_id, firstSeed.dataset_id);
  const saved = persisted;
  const reopened = await openRepository({ seed: emptyData() });
  assert.equal((await reopened.getState()).storageKind, 'sqlite');
  assert.equal(persisted, saved);
  assert.deepEqual(calls.map(call => call.method), ['read', 'write', 'read']);
`));

test('native storage failures reject instead of hanging or overwriting saved data', () => nativeCase(`
  const { openRepository, emptyData } = await import(${JSON.stringify(repositoryUrl)});
  persisted = 'original data';
  failRead = true;
  await assert.rejects(openRepository({ seed: emptyData() }), /native read failed/);
  assert.equal(persisted, 'original data');
  assert.deepEqual(calls.map(call => call.method), ['read']);
  const storage = await createStorage();
  failWrite = true;
  await assert.rejects(storage.write('replacement'), /native write failed/);
  assert.equal(persisted, 'original data');
`));
