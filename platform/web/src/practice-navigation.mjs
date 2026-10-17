const sourceKey = q => q.key || JSON.stringify([q.material, q.unit, q.question]);
export const contentId = q => q.content_id || sourceKey(q);

// Completion is derived from real records (including legacy) and successful saves,
// never from localStorage drafts. Aliases remain distinct source positions.
export function practiceProgress(questions, { completed = [], attempts = [], confirmedAttempts = [] } = {}) {
  const byKey = new Map(questions.map(q => [q.key, q]));
  const matchingAttempts = [...attempts, ...confirmedAttempts].filter(attempt => byKey.has(sourceKey(attempt)) && byKey.get(sourceKey(attempt)).type === attempt.type);
  const completedKeys = new Set([...completed, ...matchingAttempts.map(sourceKey)]);
  const completedContentIds = new Set();
  const groups = new Map();
  for (const q of questions) {
    const id = contentId(q);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(q);
    if (completedKeys.has(q.key)) completedContentIds.add(id);
  }
  const skippedKeys = new Set(questions.filter(q => !completedKeys.has(q.key) && completedContentIds.has(contentId(q))).map(q => q.key));
  return { completedKeys, completedContentIds, groups, skippedKeys,
    totalContent: groups.size, completedContentCount: completedContentIds.size };
}

export const isFreshQuestion = (q, progress) => !!q && !progress.completedContentIds.has(contentId(q));

export function nextFreshQuestion(questions, progress, current, direction = 1, wrap = false) {
  const index = questions.findIndex(q => q.key === current);
  const start = index < 0 ? (direction > 0 ? -1 : questions.length) : index;
  for (let i = start + direction; i >= 0 && i < questions.length; i += direction) {
    if (isFreshQuestion(questions[i], progress)) return questions[i];
  }
  if (wrap && index >= 0) {
    for (let i = direction > 0 ? 0 : questions.length - 1; direction > 0 ? i < index : i > index; i += direction) {
      if (isFreshQuestion(questions[i], progress)) return questions[i];
    }
  }
  return undefined;
}

export function resumeQuestion(questions, progress, activeKey, recommendedKey) {
  const active = questions.find(q => q.key === activeKey);
  if (isFreshQuestion(active, progress)) return active;
  const recommended = questions.find(q => q.key === recommendedKey);
  if (isFreshQuestion(recommended, progress)) return recommended;
  return nextFreshQuestion(questions, progress, activeKey, 1, true);
}

export function firstFreshIn(questions, progress, material, unit) {
  return questions.find(q => q.material === material && (!unit || q.unit === unit) && isFreshQuestion(q, progress));
}
