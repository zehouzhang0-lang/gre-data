// A content maintenance request is not learning evidence or a completed AI task.
export function cleanCurationPayload(payload, normalizeWord) {
  if (Object.getPrototypeOf(payload) !== Object.prototype || Object.keys(payload).length !== 1 || !Object.hasOwn(payload, 'words') || !Array.isArray(payload.words) || !payload.words.length || payload.words.length > 50000) throw Error('请选择需要补充整理的单词');
  const words = Array.from(payload.words, normalizeWord);
  if (new Set(words).size !== words.length) throw Error('补充整理包含重复单词');
  return { words };
}

export function projectCurationRequests(events) {
  const requests = new Map();
  for (const event of events) if (event.kind === 'vocab_curation_request') {
    for (const word of event.payload.words) if (!requests.has(word)) requests.set(word, { word, requested_at: event.recorded_at });
  }
  return [...requests.values()];
}
