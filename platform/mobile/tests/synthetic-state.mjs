// A synthetic vocabulary state for measuring and testing wall search.
// Everything is generated from a seed: invented words, a small pool of hand-written
// glosses and notes. It has the fields filterEntries and buildIndexes read, and nothing
// from the real library, database, backups or records.

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SYLLABLES = 'ab ac ad al am an ar as at be bi ca ce ci co cu de di du e en er es ex fa fi fu ge gra ic il im in ion is it la le li lo lu ma me mi mo na ne ni no ob oc or ous pa pe per pla po pre pro qui ra re ri ro sa se si so su ta te ti to tra tu ul un ur us va ve vi vo'.split(' ');
const GLOSSES = '清晰易懂的 坦诚的 微妙的 温和无害的 热切的 新颖的 简朴的 严厉的 平静的 敏捷的 生动的 精明的 谨慎警惕的 充足的 节俭的 安宁的 熟练灵巧的 难以捉摸的 审慎的 和蔼的 能迅速恢复的 强健的 有节制的 不言明的 显著的 简洁的 友善的 柔韧的 减弱 遵守 容忍 删节 吸收 给予 敏锐的判断力 遵循 粘附 喜爱 缓解 冷淡疏远的 心态矛盾的 异常事物 天真质朴的 增加 避免 与表象不符 支持 加强 反复无常的 连贯的 同意 显眼的 仔细考虑 汇聚 削减 使畏惧 揭穿 得体的举止 推迟 顺从 深思熟虑的'.split(' ');
const NOTES = ['常和 with 连用', '注意与形近词区分', '阅读里见过两次', 'SE 高频，常作反义', '容易拼错，结尾是 -ous', '带贬义', '正式语体', '和上一词是近义'];
const RATINGS = ['remembered', 'partial', 'forgotten'];
const RECORDS = ['vocab/20260110-handwritten.json', 'vocab/20260204-captured.json', 'vocab/homework-0312.json', 'vocab/20260501-手写.md', 'lists/core-a.yaml', 'lists/core-b.yaml'];
// A few awkward spellings, so ordering is checked on more than plain lower-case words.
const AWKWARD = ['Polish', 'polish', 'ad hoc', 'laissez-faire', "o'clock", 'résumé', 'resume', 'naïve', 'naive', 'co-op', 'coop', 'Zeal', 'zeal', 'A-list'];

export function makeState(count, seed = 1) {
  const rand = mulberry32(seed);
  const pick = list => list[Math.floor(rand() * list.length)];
  const seen = new Set();
  const vocabulary = [];
  const invent = () => {
    for (;;) {
      let word = '';
      const parts = 2 + Math.floor(rand() * 4);
      for (let i = 0; i < parts; i++) word += pick(SYLLABLES);
      if (!seen.has(word)) { seen.add(word); return word; }
    }
  };
  for (let i = 0; i < count; i++) {
    const word = i < AWKWARD.length && count > AWKWARD.length * 2 ? AWKWARD[i] : invent();
    seen.add(word);
    const glosses = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => pick(GLOSSES));
    const entry = { word, pos: pick(['adj.', 'v.', 'n.']), meaning: rand() < 0.03 ? undefined : glosses.join('；') };
    if (rand() < 0.02) entry.meaning = '  ';
    if (rand() < 0.2) entry.note = pick(NOTES);
    if (rand() < 0.01) entry.deleted = true;
    if (rand() < 0.7) entry.recalls = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => ({ self_rating: pick(RATINGS) }));
    if (rand() < 0.9) entry.sources = Array.from({ length: 1 + Math.floor(rand() * 2) }, () => ({ record: pick(RECORDS), kind: pick(['list', 'handwritten', 'captured']) }));
    if (rand() < 0.08) entry.captures = [{ id: `c${i}` }];
    vocabulary.push(entry);
  }
  // Shuffle so vocabulary order is not already alphabetical.
  for (let i = vocabulary.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [vocabulary[i], vocabulary[j]] = [vocabulary[j], vocabulary[i]];
  }
  const topics = Array.from({ length: 12 }, (_, i) => ({ id: `t${i}`, name: `主题 ${i}`, deleted: i === 11 }));
  const assignments = vocabulary.filter(() => rand() < 0.6).map(w => ({ word: w.word, topics: Array.from({ length: Math.floor(rand() * 3) }, () => `t${Math.floor(rand() * 11)}`) }));
  const groups = Array.from({ length: Math.floor(count / 40) }, (_, i) => ({
    id: `g${i}`, title: `组 ${i}`, type: pick(['synonym', 'antonym', 'lookalike', 'custom']), deleted: rand() < 0.05,
    members: Array.from({ length: 3 + Math.floor(rand() * 3) }, () => ({ word: pick(vocabulary).word })),
  }));
  const items = vocabulary.filter(() => rand() < 0.5).map(w => ({ kind: 'word', word: w.word, due_today: rand() < 0.15, has_history: rand() < 0.7 }));
  const curationRequests = vocabulary.filter(() => rand() < 0.02).map(w => ({ word: w.word }));
  return { vocabulary, relations: { topics, assignments, groups }, spacedReview: { items }, curationRequests };
}

// The same library after one more rating was saved: new array, new objects for the
// changed words, the same words in the same order. This is what a refresh looks like.
export function afterRating(state, seed = 7) {
  const rand = mulberry32(seed);
  const vocabulary = state.vocabulary.map(w => (rand() < 0.02 ? { ...w, recalls: [...(w.recalls || []), { self_rating: RATINGS[Math.floor(rand() * 3)] }] } : w));
  return { ...state, vocabulary };
}
