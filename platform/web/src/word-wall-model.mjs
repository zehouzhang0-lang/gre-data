export const ratingLabels = { remembered: '记得很清楚', partial: '有一点印象', forgotten: '完全忘记' };
export const relationshipLabels = { synonym: '近义词', antonym: '反义词', lookalike: '形近词' };
export const wallDefaults = { columns: 12, rows: 10, height: 64, font: 16 };
const limits = { columns: [3, 18], rows: [3, 20], height: [48, 140], font: [14, 24] };
export function wallSettings(value = {}) {
  return Object.fromEntries(Object.entries(limits).map(([key, [min, max]]) => [key,
    Number.isFinite(Number(value?.[key])) ? Math.min(max, Math.max(min, Math.round(Number(value[key])))) : wallDefaults[key]]));
}
export function readPreference(key, fallback) {
  try { return JSON.parse(localStorage.getItem(`gre:${key}:v1`)) ?? fallback; } catch { return fallback; }
}
export function writePreference(key, value) {
  try { localStorage.setItem(`gre:${key}:v1`, JSON.stringify(value)); } catch { /* Preferences are optional. */ }
}
export function wordRating(word) { return word.recalls?.at(-1)?.self_rating || 'unrated'; }
function hash(value) { let h = 2166136261; for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

// Repeat appearances preserve overlapping groups, but selection and marking use the
// unique word identity. All explicit filters remain strict; no out-of-scope mates added.
export function wallEntries(words, groups, relation, groupId, shuffled, seed = 0) {
  if (!relation && !groupId) {
    const list = shuffled ? [...words].sort((a, b) => hash(seed + a.word) - hash(seed + b.word)) : words;
    return list.map(w => ({ key: w.word, word: w.word, group: null }));
  }
  const rank = new Map(words.map((w, i) => [w.word, i]));
  const ordered = groups.filter(g => !g.deleted && (!relation || g.type === relation) && (!groupId || g.id === groupId))
    .map(g => ({ ...g, members: g.members.filter(m => rank.has(m.word)).sort((a, b) => rank.get(a.word) - rank.get(b.word)) }))
    .filter(g => g.members.length)
    .sort((a, b) => shuffled ? hash(seed + a.id) - hash(seed + b.id) : rank.get(a.members[0].word) - rank.get(b.members[0].word));
  return ordered.flatMap((group, i) => group.members.map((m, index) => ({ key: `${group.id}:${m.word}`, word: m.word, group, groupNumber: i + 1, groupStart: index === 0 })));
}
