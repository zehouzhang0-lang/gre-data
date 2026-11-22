// Words picked on the wall are studied ten at a time. Each group is an ordinary review round;
// the words still waiting for a group are remembered here (a device preference, not learning data).
export const BATCH = 10;
const KEY = 'gre-review-queue-v1';

export function loadQueue(datasetId, storage = globalThis.localStorage) {
  try {
    const queue = JSON.parse(storage?.getItem(KEY) || 'null');
    const valid = queue && queue.datasetId === datasetId && typeof queue.base === 'string' && Array.isArray(queue.words) && queue.words.length
      && queue.words.every(word => typeof word === 'string') && Number.isInteger(queue.total) && Number.isInteger(queue.started);
    return valid ? queue : null;
  } catch { return null; }
}

export function saveQueue(queue, storage = globalThis.localStorage) {
  try { if (queue) storage?.setItem(KEY, JSON.stringify(queue)); else storage?.removeItem(KEY); } catch { /* the queue is a convenience; a full or blocked store only loses it */ }
}

// The next group to study, and what is left after it. `usable` drops words deleted or left without a meaning since they were picked.
export function nextBatch(queue, usable) {
  const words = queue.words.filter(word => usable.has(word));
  if (!words.length) return null;
  const batch = words.slice(0, BATCH), rest = words.slice(BATCH);
  const name = queue.total > BATCH ? `${queue.base} · ${Math.floor(queue.started / BATCH) + 1}` : queue.base;
  return { words: batch, name, rest: rest.length ? { ...queue, started: queue.started + batch.length, words: rest } : null };
}
