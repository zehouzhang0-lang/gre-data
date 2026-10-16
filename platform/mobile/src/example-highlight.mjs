// Display-only matching: retain the quoted text verbatim and match whole words.
const irregularVerbs = {
  be: 'am is are was were been being', have: 'has had having', do: 'does did done doing',
  go: 'goes went gone going', come: 'came coming', become: 'became becoming',
  get: 'gets got gotten getting', give: 'gave given giving', take: 'took taken taking',
  make: 'made making', say: 'said saying', see: 'saw seen seeing', know: 'knew known knowing',
  think: 'thought thinking', find: 'found finding', leave: 'left leaving', feel: 'felt feeling',
  bring: 'brought bringing', buy: 'bought buying', catch: 'caught catching', teach: 'taught teaching',
  seek: 'sought seeking', fight: 'fought fighting', lose: 'lost losing', win: 'won winning',
  run: 'ran running', begin: 'began begun beginning', swim: 'swam swum swimming',
  write: 'wrote written writing', read: 'read reading', speak: 'spoke spoken speaking',
  break: 'broke broken breaking', choose: 'chose chosen choosing', freeze: 'froze frozen freezing',
  rise: 'rose risen rising', arise: 'arose arisen arising', drive: 'drove driven driving',
  draw: 'drew drawn drawing', grow: 'grew grown growing', throw: 'threw thrown throwing',
  fall: 'fell fallen falling', fly: 'flew flown flying', forget: 'forgot forgotten forgetting',
  forgive: 'forgave forgiven forgiving', forsake: 'forsook forsaken forsaking',
  bear: 'bore born borne bearing', bind: 'bound binding', grind: 'ground grinding',
  hide: 'hid hidden hiding', hold: 'held holding', lead: 'led leading', meet: 'met meeting',
  keep: 'kept keeping', sleep: 'slept sleeping', sweep: 'swept sweeping',
  sell: 'sold selling', tell: 'told telling', send: 'sent sending', spend: 'spent spending',
  build: 'built building', lend: 'lent lending', bend: 'bent bending',
  stand: 'stood standing', understand: 'understood understanding', withstand: 'withstood withstanding',
  sit: 'sat sitting', set: 'set setting', put: 'put putting', cut: 'cut cutting',
  hit: 'hit hitting', let: 'let letting', quit: 'quit quitting', split: 'split splitting',
  lie: 'lay lain lying', lay: 'laid laying', die: 'died dying', tie: 'tied tying',
  eat: 'ate eaten eating', drink: 'drank drunk drinking', bite: 'bit bitten biting',
  shake: 'shook shaken shaking', shrink: 'shrank shrunk shrinking', sink: 'sank sunk sinking',
  wear: 'wore worn wearing', tear: 'tore torn tearing', swear: 'swore sworn swearing',
  withdraw: 'withdrew withdrawn withdrawing', undergo: 'underwent undergone undergoing',
};
const irregularNouns = {
  man:'men', woman:'women', child:'children', person:'people persons', foot:'feet', tooth:'teeth',
  mouse:'mice', goose:'geese', ox:'oxen', analysis:'analyses', crisis:'crises', thesis:'theses',
  hypothesis:'hypotheses', basis:'bases', diagnosis:'diagnoses', phenomenon:'phenomena',
  criterion:'criteria', datum:'data', medium:'media mediums', index:'indices indexes',
  matrix:'matrices matrixes', appendix:'appendices appendixes', axis:'axes',
};
const doubled = new Set('admit commit permit submit omit emit remit prefer refer infer confer deter occur recur transfer control compel propel repel expel dispel excel regret equip acquit upset'.split(' '));
const splitForms = value => value ? value.split(' ') : [];
function plural(word) {
  if (/[^aeiou]y$/.test(word)) return word.slice(0,-1)+'ies';
  if (/(s|x|z|ch|sh)$/.test(word)) return word+'es';
  return word+'s';
}
function doubleFinal(word) {
  return doubled.has(word) || (/^[^aeiou]*[aeiou][^aeiouwxy]$/.test(word) && word.length > 2);
}
function forms(word, pos) {
  const result = new Set([word]);
  if (/^v\./.test(pos)) {
    result.add(plural(word));
    if (irregularVerbs[word]) splitForms(irregularVerbs[word]).forEach(form=>result.add(form));
    else {
      const stem = doubleFinal(word) ? word+word.at(-1) : word;
      result.add(/[^aeiou]y$/.test(word) ? word.slice(0,-1)+'ied' : word.endsWith('e') ? word+'d' : stem+'ed');
      result.add(word.endsWith('ie') ? word.slice(0,-2)+'ying' : /[^e]e$/.test(word) ? word.slice(0,-1)+'ing' : stem+'ing');
      if (word.endsWith('c')) { result.add(word+'ked'); result.add(word+'king'); }
      if (word.endsWith('l')) { result.add(word+'led'); result.add(word+'ling'); }
    }
  }
  if (/^n\./.test(pos)) {
    (irregularNouns[word] ? splitForms(irregularNouns[word]) : [plural(word)]).forEach(form=>result.add(form));
    if (/^(leaf|life|wife|knife|wolf|shelf|self|half|calf|loaf|thief)$/.test(word)) result.add(word.replace(/fe?$/,'ves'));
  }
  if (/^adj\./.test(pos)) {
    const irregular = {good:'better best', bad:'worse worst', far:'farther farthest further furthest', little:'less least', many:'more most'};
    if (irregular[word]) splitForms(irregular[word]).forEach(form=>result.add(form));
    else for (const suffix of ['er','est']) result.add(/[^aeiou]y$/.test(word) ? word.slice(0,-1)+'i'+suffix : word.endsWith('e') ? word+suffix.slice(1) : word+(doubleFinal(word)?word.at(-1):'')+suffix);
  }
  return [...result];
}
export function highlightExample(text, headword, pos = '') {
  const word = String(headword || '').trim().toLowerCase();
  if (!word) return [{text, highlight:false}];
  const tokens = word.split(/\s+/), index = /^v\./.test(pos) ? 0 : tokens.length-1;
  const variants = forms(tokens[index],pos).map(form=>tokens.map((token,i)=>i===index?form:token).join(' '));
  const escape = value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/ /g,'\\s+');
  const regex = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${variants.sort((a,b)=>b.length-a.length).map(escape).join('|')})(?![\\p{L}\\p{N}_])`,'giu');
  const parts=[]; let offset=0;
  for(const match of text.matchAll(regex)) {
    if(match.index>offset) parts.push({text:text.slice(offset,match.index),highlight:false});
    parts.push({text:match[0],highlight:true});offset=match.index+match[0].length;
  }
  if(offset<text.length)parts.push({text:text.slice(offset),highlight:false});
  return parts;
}
