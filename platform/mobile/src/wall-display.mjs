import { DEFAULT_PAGE_TONE, PAGE_TONES } from './sound.mjs';

const appearanceKey = 'gre-wall-appearance:v1';

export const wallAppearanceDefaults = Object.freeze({
  look: 'pip',
  axis: 'x',
  theme: 'system',
  haptics: false,
  sound: true,
  pageTone: DEFAULT_PAGE_TONE,
  font: null,
  hinted: false,
});

export function normalizeWallAppearance(value) {
  const font = value?.font;
  // Older installs stored "light" even when it was never selected. The legacy
  // value "dark" does represent a choice, so carry it forward once.
  const theme = value?.theme ?? (value?.scheme === 'dark' ? 'dark' : 'system');
  return {
    look: value?.look === 'fill' ? 'fill' : 'pip',
    axis: value?.axis === 'y' ? 'y' : 'x',
    theme: theme === 'dark' || theme === 'light' ? theme : 'system',
    haptics: value?.haptics === true,
    sound: value?.sound !== false,
    pageTone: typeof value?.pageTone === 'string' && Object.prototype.hasOwnProperty.call(PAGE_TONES, value.pageTone) ? value.pageTone : DEFAULT_PAGE_TONE,
    font: Number.isFinite(font) && font >= 12 && font <= 22 ? font : null,
    hinted: value?.hinted === true,
  };
}

export function loadWallAppearance(storage) {
  try {
    const value = (storage ?? globalThis.localStorage)?.getItem(appearanceKey);
    return normalizeWallAppearance(JSON.parse(value ?? 'null'));
  } catch {
    return { ...wallAppearanceDefaults };
  }
}

export function saveWallAppearance(value, storage) {
  const appearance = normalizeWallAppearance(value);
  try {
    (storage ?? globalThis.localStorage)?.setItem(appearanceKey, JSON.stringify(appearance));
  } catch {
    // Appearance still takes effect for this session when storage is unavailable.
  }
  return appearance;
}

export function wallHaptic(enabled) {
  if (enabled && typeof globalThis.navigator?.vibrate === 'function') globalThis.navigator.vibrate(8);
}
