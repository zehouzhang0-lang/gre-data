// Keep a failed save's ID and payload stable so retrying cannot count it twice.
export function createCardReadingDraft(makeId = () => crypto.randomUUID()) {
  const pending = new Map();
  const batches = [];
  function freezeRemaining(getImpression, isAvailable) {
    const frozenCounts = new Map();
    for (const batch of batches) for (const item of batch.payload.items) frozenCounts.set(item.word, (frozenCounts.get(item.word) || 0) + item.count);
    const items = [...pending.values()].filter(item => isAvailable(item.word))
      .map(item => ({ ...item, count: item.count - (frozenCounts.get(item.word) || 0), impression: getImpression(item.word) || null })).filter(item => item.count > 0);
    if (items.length) batches.push({ id: makeId(), payload: { items } });
  }
  const draft = {
    record(word, viewedAt) {
      const previous = pending.get(word);
      pending.set(word, { word, count: (previous?.count || 0) + 1, viewed_at: viewedAt });
    },
    prepare(getImpression, isAvailable = () => true) {
      if (!batches.length) freezeRemaining(getImpression, isAvailable);
      return batches[0] || null;
    },
    prepareAll(getImpression, isAvailable = () => true) {
      freezeRemaining(getImpression, isAvailable);
      return [...batches];
    },
    commit() {
      const batch = batches.shift();
      if (!batch) return;
      for (const item of batch.payload.items) {
        const current = pending.get(item.word);
        const remaining = current.count - item.count;
        if (remaining) pending.set(item.word, { ...current, count: remaining });
        else pending.delete(item.word);
      }
    },
    commitAll() { while (batches.length) draft.commit(); },
  };
  return draft;
}
