// Polls never overlap. A refresh after a write queues a new read rather than
// accepting an in-flight response whose snapshot may predate that write.
export function createRefreshQueue(load) {
  let tail = Promise.resolve();
  let pending = 0;
  function refresh() {
    pending++;
    const result = tail.then(load).finally(() => { pending--; });
    tail = result.catch(() => {});
    return result;
  }
  return { refresh, poll: () => pending ? Promise.resolve() : refresh() };
}
