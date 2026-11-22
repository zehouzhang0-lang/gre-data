// Hand-authored demonstration vocabulary. No project records or personal data.
const pairs = `lucid|清晰易懂的
candid|坦诚的
subtle|微妙的
benign|温和无害的
avid|热切的
novel|新颖的
austere|简朴的；严厉的
placid|平静的
nimble|敏捷的
vivid|生动的
astute|精明的
wary|谨慎警惕的
ample|充足的
frugal|节俭的
serene|安宁的
deft|熟练灵巧的
elusive|难以捉摸的
prudent|审慎的
affable|和蔼的
resilient|能迅速恢复的
robust|强健的
temperate|温和的；有节制的
tacit|不言明的
salient|显著的
succinct|简洁的
genial|友善的
pliant|柔韧的；易受影响的
tranquil|宁静的
abate|减弱
abide|遵守；容忍
abridge|删节
absorb|吸收
accord|一致；给予
acumen|敏锐的判断力
adept|熟练的
adhere|遵循；粘附
adroit|灵巧的
affinity|喜爱；亲近感
alleviate|缓解
aloof|冷淡疏远的
ambivalent|心态矛盾的
amiable|亲切友好的
anomaly|异常事物
ardent|热情的
artless|天真质朴的
assuage|缓和
augment|增加
avert|避免；移开
belie|与表象不符
bolster|支持；加强
brevity|简洁
buoyant|有浮力的；乐观的
calm|平静的
capricious|反复无常的
coherent|连贯的
concise|简明的
concur|同意
conspicuous|显眼的
contemplate|仔细考虑
converge|汇聚
cordial|热诚的
credible|可信的
curtail|削减
daunt|使畏惧
debunk|揭穿
decorum|得体的举止
defer|推迟；顺从
deliberate|深思熟虑的
diligent|勤勉的
discern|辨别
discrete|分离的
dispel|驱散
diverse|多样的
docile|温顺的
dormant|休眠的
durable|耐用的
earnest|认真的
eclectic|兼收并蓄的
eloquent|有说服力的
elucidate|阐明
emulate|努力赶上
endure|忍受；持续
enhance|增强
equitable|公平的
erudite|博学的
evanescent|转瞬即逝的
exacting|要求严格的
exemplary|堪作典范的
explicit|明确的
fervent|热诚的
fluent|流畅的
fortitude|坚毅
frank|直率的
futile|徒劳的
garrulous|喋喋不休的
genuine|真实的
gregarious|爱交际的
hamper|阻碍
heed|留意
humble|谦逊的
impartial|公正的
impede|妨碍
implicit|含蓄的
inadvertent|无意的
incisive|深刻敏锐的
indolent|懒惰的
ingenious|巧妙的
innate|天生的
intrepid|勇敢的
judicious|明智的
keen|敏锐的；热衷的
laconic|言简意赅的
languid|无精打采的
latent|潜在的
laud|赞美
lenient|宽容的
lucidity|清晰明了
malleable|可塑的
meager|匮乏的
meticulous|一丝不苟的
mitigate|减轻
modest|谦虚的；适度的
mundane|平凡的
nebulous|模糊的
nuance|细微差别
obscure|晦涩的
obsolete|过时的
onerous|繁重的
ornate|装饰华丽的
overt|公开的
pacify|使平静
paragon|典范
perceptive|有洞察力的
perennial|长期存在的
pervasive|普遍存在的
plausible|看似合理的
poignant|令人感伤的
pragmatic|务实的
profound|深刻的
prolific|多产的
prosaic|平淡无奇的
qualify|使具备资格；限制
quell|平息
reconcile|调和
refine|改进；提纯
refute|驳斥
reticent|沉默寡言的
rigorous|严谨的
sagacious|睿智的
scrutinize|仔细检查
sporadic|零星发生的
steadfast|坚定的
stolid|不动声色的
superficial|表面的
tenacious|坚持不懈的
tentative|试探性的
thorough|彻底的
timid|胆怯的
tractable|易处理的
transient|短暂的
unequivocal|明确无疑的
urbane|彬彬有礼的
validate|证实
versatile|多才多艺的
vigilant|警觉的
vindicate|证明无辜或正确
whimsical|异想天开的
zealous|热忱的`;
const pattern = ['clear', 'partial', 'forgot', 'none', 'none', 'clear', 'partial', 'clear', 'partial', 'forgot', 'none', 'clear'];
export const labels = { none: '未标记', forgot: '完全忘记', partial: '有一点印象', clear: '记得很清楚' };
export const words = pairs.split('\n').map((line, i) => {
  const [word, meaning] = line.split('|');
  return { id: `demo-${i + 1}`, word, meaning, status: pattern[i % pattern.length], searchText: `${word} ${meaning}`.toLocaleLowerCase() };
});
export const byId = Object.fromEntries(words.map(w => [w.id, w]));
export function createPages(query = '', filter = 'all', sort = 'demo') {
  let items = words.filter(w => (filter === 'all' || w.status === filter) && w.searchText.includes(query.trim().toLocaleLowerCase()));
  if (sort === 'az') items = [...items].sort((a, b) => a.word.localeCompare(b.word, 'en'));
  const pages = [];
  for (let i = 0; i < items.length; i += 28) pages.push(items.slice(i, i + 28).map(w => w.id));
  return pages;
}
export function freshPages(pages, index) {
  if (index >= pages.length - 1) return null;
  const distance = Math.min(3, pages.length - index - 1);
  const next = pages.map(p => [...p]);
  const [batch] = next.splice(index, 1);
  next.splice(index + distance, 0, batch);
  return { pages: next, distance };
}
export const storageKey = 'gre-ui-synthetic-prototype-v1';
