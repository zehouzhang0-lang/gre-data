// Keep a failed save's ID and payload stable so retrying cannot count it twice.
export function createCardReadingDraft(makeId = () => crypto.randomUUID()) {
  const pending = new Map();
  let batch = null;
  return {
    record(word, viewedAt) {
      const previous = pending.get(word);
      pending.set(word, { word, count: (previous?.count || 0) + 1, viewed_at: viewedAt });
    },
    prepare(getImpression, isAvailable = () => true) {
      if (batch) return batch;
      const items = [...pending.values()].filter(item => isAvailable(item.word))
        .map(item => ({ ...item, impression: getImpression(item.word) || null }));
      if (!items.length) return null;
      batch = { id: makeId(), payload: { items } };
      return batch;
    },
    commit() {
      if (!batch) return;
      for (const item of batch.payload.items) {
        const current = pending.get(item.word);
        const remaining = current.count - item.count;
        if (remaining) pending.set(item.word, { ...current, count: remaining });
        else pending.delete(item.word);
      }
      batch = null;
    },
  };
}
