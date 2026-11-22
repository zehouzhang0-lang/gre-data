// Stress cases for the word wall: long headwords, a phrase, a hyphenated word and long
// meanings. Public dictionary words with glosses written for this prototype; nothing here
// comes from the project's vocabulary or from anyone's records. Used only by the
// "长词与长释义" review scenario of candidate C and by c-qa.mjs.
const rows = `incontrovertible|无可辩驳的；不容置疑的
obstreperous|吵闹的；难以控制的
pusillanimous|胆小怯懦的
perspicacious|敏锐的；有洞察力的
magnanimous|宽宏大量的
recalcitrant|桀骜不驯的；顽抗的
sycophantic|阿谀奉承的
indefatigable|不知疲倦的
circumlocution|迂回累赘的说法；说话绕弯子
disingenuous|不真诚的；假装天真的
idiosyncratic|特异的；个人特有的
surreptitious|秘密的；偷偷摸摸的
grandiloquent|夸张的；言辞浮夸的
antediluvian|古老的；极其过时的
quintessential|典型的；最具代表性的
lackadaisical|无精打采的；懒散的
inconsequential|不重要的；无关紧要的
vituperative|辱骂的；言辞尖刻的
perfunctory|敷衍的；例行公事般的
mellifluous|声音甜美流畅的
verisimilitude|逼真；貌似真实
ad hominem|针对个人而非论点的
laissez-faire|放任自由的；不干涉的
prevaricate|支吾其词；搪塞；说谎
obsequious|谄媚的；过分顺从的
equivocate|含糊其辞；模棱两可地说
irreconcilable|不可调和的；势不两立的
overcautious|因过于谨慎而在行动上犹豫不决的；畏首畏尾的`;

const pattern = ['forgot', 'partial', 'clear', 'none', 'clear', 'partial', 'forgot'];

export const stressEntries = rows.split('\n').map((line, i) => {
  const [word, meaning] = line.split('|');
  return { id: `stress-${i + 1}`, word, meaning, status: pattern[i % pattern.length] };
});
export const stressById = Object.fromEntries(stressEntries.map(w => [w.id, w]));
export const stressPage = stressEntries.map(w => w.id);
