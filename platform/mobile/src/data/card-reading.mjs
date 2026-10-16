import { QUICK_RATINGS } from '../../../shared/quick-review.mjs';

function fields(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Reflect.ownKeys(value).some(key => typeof key !== 'string' || !keys.includes(key))
    || keys.some(key => !Object.hasOwn(value, key))) throw Error('翻阅记录字段无效');
}

function viewedAt(value, timestamp) {
  const match = typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(Z|([+-])(\d{2}):(\d{2}))$/);
  if (!match) throw Error('翻阅时间须为含时区的有效时间');
  const normalized = timestamp(value);
  const offset = match[1] === 'Z' ? 0 : (match[2] === '+' ? 1 : -1) * (Number(match[3]) * 60 + Number(match[4])) * 60000;
  if (new Date(Date.parse(normalized) + offset).toISOString().slice(0, 19) !== value.slice(0, 19)) throw Error('翻阅时间无效');
  return normalized;
}

export function cleanCardReadingPayload(value, normalizeWord, timestamp) {
  fields(value, ['items']);
  if (!Array.isArray(value.items) || !value.items.length || value.items.length > 5000) throw Error('翻阅记录须包含 1–5000 个词');
  const items = Array.from(value.items, item => {
    fields(item, ['word', 'count', 'viewed_at', 'impression']);
    if (!Number.isSafeInteger(item.count) || item.count < 1 || item.count > 10000000) throw Error('翻阅次数须为有效正整数');
    if (item.impression !== null && !QUICK_RATINGS.includes(item.impression)) throw Error('单词印象无效');
    return { word: normalizeWord(item.word), count: item.count, viewed_at: viewedAt(item.viewed_at, timestamp), impression: item.impression };
  });
  if (new Set(items.map(item => item.word)).size !== items.length) throw Error('翻阅记录包含重复单词');
  return { items };
}

// Reading is exposure, not recall evidence. Ratings are projected from the live
// effective recalls so an undo also updates the impression shown in this list.
export function projectCardReadings(events, vocabulary) {
  const readings = new Map(), hasRatingHistory = new Set();
  for (const event of events) {
    if (event.kind === 'vocab_recall') hasRatingHistory.add(event.payload.word);
    if (event.kind === 'vocab_quick_review') for (const item of event.payload.items) hasRatingHistory.add(item.word);
    if (event.kind !== 'vocab_card_reading') continue;
    for (const item of event.payload.items) {
      const old = readings.get(item.word), latest = !old || item.viewed_at >= old.last_viewed_at;
      readings.set(item.word, {
        word: item.word, view_count: (old?.view_count || 0) + item.count,
        last_viewed_at: latest ? item.viewed_at : old.last_viewed_at,
        impression: latest ? item.impression : old.impression,
      });
    }
  }
  const words = new Map(vocabulary.map(word => [word.word, word]));
  for (const reading of readings.values()) {
    const latestRating = words.get(reading.word)?.recalls?.at(-1)?.self_rating;
    if (latestRating || hasRatingHistory.has(reading.word)) reading.impression = latestRating || null;
  }
  return [...readings.values()].sort((a, b) => b.last_viewed_at.localeCompare(a.last_viewed_at) || a.word.localeCompare(b.word));
}
