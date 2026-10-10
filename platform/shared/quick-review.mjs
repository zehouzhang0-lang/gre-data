export const QUICK_RATINGS = ['remembered', 'partial', 'forgotten'];

// Raw operations stay append-only. A correction in one round replaces the effective
// result, not the original evidence or its timestamp. Undo restores the prior version.
export function quickReviewEvents(events) {
  const undone = new Set(events.filter(e => e.kind === 'vocab_quick_undo').map(e => e.payload.target_id));
  const rounds = new Map();
  for (const event of events) {
    if (event.kind !== 'vocab_quick_review' || undone.has(event.id)) continue;
    for (const item of event.payload.items) {
      const key = JSON.stringify([event.payload.session_id, item.word]);
      const first = rounds.get(key);
      rounds.set(key, {
        id: first?.id || `${event.id}:${item.word}`,
        recorded_at: first?.recorded_at || event.recorded_at,
        kind: 'vocab_recall',
        payload: { word: item.word, self_rating: item.self_rating, answer: '',
          assessment: 'self_reported', mode: 'quick_grid', session_id: event.payload.session_id,
          operation_id: event.id, updated_at: event.recorded_at },
      });
    }
  }
  return [...rounds.values()];
}

export function withQuickReviews(events) {
  return [...events.filter(e => !['vocab_quick_review', 'vocab_quick_undo'].includes(e.kind)), ...quickReviewEvents(events)]
    .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at) || a.id.localeCompare(b.id));
}
