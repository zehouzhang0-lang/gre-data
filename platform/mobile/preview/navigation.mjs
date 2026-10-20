export const unitKey = question => JSON.stringify([question.material, question.unit]);
export function unitsFor(questions, search = '') {
  const units = new Map();
  for (const q of questions) {
    const key = unitKey(q);
    if (!units.has(key)) units.set(key, { key, label: q.unitLabel, materialLabel: q.materialLabel, count: 0 });
    units.get(key).count++;
  }
  const query = search.trim().toLowerCase().replace(/\s+/g, ' ');
  return [...units.values()].filter(unit => `${unit.materialLabel} ${unit.label}`.toLowerCase().includes(query));
}
export function navigationStatus(question, answers, confirmed) {
  // History always remains independent of the current preview response.
  if (answers[question.key]?.length) return confirmed[question.key] ? 'preview' : 'draft';
  if (question.submitted) return 'submitted';
  if (question.sameContentDone) return 'duplicate';
  return 'unseen';
}
export function answerReady(question, selected = []) {
  if (!question) return false;
  if (question.mode === 'pair') return selected.length === 2;
  if (question.groups?.length) return question.groups.every(group => group.some(letter => selected.includes(letter)));
  if (question.mode === 'multiple') return selected.length > 0 && selected.some(value => value.trim());
  return selected.length === 1 && !!selected[0]?.trim();
}
export function selectAnswer(question, old, value) {
  if (['pair', 'multiple'].includes(question.mode)) {
    return old.includes(value) ? old.filter(x => x !== value)
      : question.mode === 'pair' && old.length >= 2 ? old : [...old, value];
  }
  if (question.groups?.length) {
    const group = question.groups.find(g => g.includes(value));
    if (!group) return old;
    return [...old.filter(x => !group.includes(x)), value];
  }
  return [value];
}
