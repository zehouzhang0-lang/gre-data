import { quickReviewEvents } from '../../shared/quick-review.mjs';

// Both marks and draft flushes enter this queue before reading or writing the
// store, so the flush sees every mark that preceded it, even before it painted.
export function createWallWriteQueue() {
  let tail = Promise.resolve(), pending = 0;
  return {
    get pending() { return pending > 0; },
    enqueue(operation) {
      pending++;
      const result = tail.then(operation).finally(() => { pending--; });
      tail = result.catch(() => {});
      return result;
    },
  };
}

export function optimisticWallRatings(state, live, operations) {
  const ratings = new Map();
  if (!operations.length) return { ratings, canUndo: !!state.undoId };
  if (!operations.some(operation => operation.kind === 'undo')) {
    for (const { words, rating } of operations) {
      for (const word of words) ratings.set(word, rating);
    }
    return { ratings, canUndo: true };
  }

  const saved = state.events || [];
  const undone = new Set(saved.filter(event => event.kind === 'vocab_quick_undo').map(event => event.payload.target_id));
  const stack = saved.filter(event => event.kind === 'vocab_quick_review' && !undone.has(event.id)).reverse();
  const savedIds = new Set(saved.map(event => event.id));
  const words = new Set();
  for (const operation of operations) {
    if (savedIds.has(operation.event?.id)) continue;
    if (operation.kind === 'rate') {
      const event = operation.event || { id: operation.id, kind: 'vocab_quick_review', recorded_at: operation.time,
        payload: { session_id: state.quickRound?.id || 'pending', items: operation.words.map(word => ({ word, self_rating: operation.rating })) } };
      stack.push(event);
      for (const word of operation.words) words.add(word);
    } else {
      for (const item of stack.pop()?.payload.items || []) words.add(item.word);
    }
  }
  const quick = new Map();
  for (const event of quickReviewEvents(stack)) {
    const { word, self_rating } = event.payload;
    if (!words.has(word)) continue;
    const previous = quick.get(word);
    if (!previous || previous.time <= event.recorded_at) quick.set(word, { time: event.recorded_at, rating: self_rating });
  }
  for (const word of words) {
    const other = live.get(word)?.recalls?.findLast(recall => recall.mode !== 'quick_grid' || !recall.operation_id);
    const pending = quick.get(word);
    ratings.set(word, pending && (!other || pending.time >= other.recorded_at) ? pending.rating : other?.self_rating || 'unrated');
  }
  return { ratings, canUndo: stack.length > 0 };
}
