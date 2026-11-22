import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWallAppearance, saveWallAppearance } from '../src/wall-display.mjs';

function memoryStorage(initial) {
  let value = initial == null ? null : JSON.stringify(initial);
  return {
    getItem: () => value,
    setItem: (_key, next) => { value = next; },
  };
}

test('new and legacy default appearance follows the system, while a legacy dark selection is preserved', () => {
  assert.equal(loadWallAppearance(memoryStorage()).theme, 'system');
  assert.equal(loadWallAppearance(memoryStorage({ scheme: 'light' })).theme, 'system');
  assert.equal(loadWallAppearance(memoryStorage({ theme: 'invalid' })).theme, 'system');
  const migrated = loadWallAppearance(memoryStorage({ scheme: 'dark', look: 'fill', axis: 'y', hinted: true, pageTone: 'musicbox' }));
  assert.equal(migrated.theme, 'dark');
  assert.equal(migrated.look, 'fill');
  assert.equal(migrated.axis, 'y');
  assert.equal(migrated.hinted, true);
  assert.equal(migrated.pageTone, 'musicbox');
});

test('explicit theme selections persist without overwriting other preferences', () => {
  const storage = memoryStorage({ scheme: 'dark', sound: false });
  for (const theme of ['light', 'dark', 'system']) {
    saveWallAppearance({ ...loadWallAppearance(storage), theme }, storage);
    assert.equal(loadWallAppearance(storage).theme, theme);
    assert.equal(loadWallAppearance(storage).sound, false);
  }
});
