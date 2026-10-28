import fs from 'node:fs/promises';
import {validateQuotationBudget,mergeSenseExampleEntries} from '../shared/sense-examples.mjs';
const data=JSON.parse(await fs.readFile('vocab/standardized.json','utf8'));
const rawEntries=[];
for(const name of await fs.readdir('vocab/examples'))if(/^verified-.*\.json$/.test(name))rawEntries.push(...JSON.parse(await fs.readFile('vocab/examples/'+name,'utf8')).items);
const entries=mergeSenseExampleEntries(rawEntries);
const index=new Map(data.items.map(w=>[w.word,w]));
const reviewed=new Map(entries.map(w=>[w.word,w]));
for(const d of data.items)if(d.senses.length&&!reviewed.has(d.word))throw Error('词条例句尚未审阅 '+d.word);
for(const e of entries){const d=index.get(e.word);if(!d||e.senses.length!==d.senses.length)throw Error('例句词条不匹配 '+e.word);for(let i=0;i<d.senses.length;i++){const g=e.senses[i],s=d.senses[i];if(g.pos!==s.pos||JSON.stringify(g.meanings)!==JSON.stringify(s.meanings)||g.examples.length!==s.meanings.length)throw Error('义项位置不匹配 '+e.word);}}
for(const d of data.items)if(d.senses.length&&JSON.stringify(d.senses.map(s=>s.examples))!==JSON.stringify(reviewed.get(d.word).senses.map(s=>s.examples)))throw Error('生成词库的例句尚未同步 '+d.word);
const pages=validateQuotationBudget(entries);
const report={date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),words:data.items.filter(w=>w.senses.length).length,senses:0,words_with_examples:0,examples:0,quotations:0,coach_original:0,pending:0,source_pages:pages.size,publishers:{ETS:0,Oxford:0,'Merriam-Webster':0,Cambridge:0},source_policy:'Preserve verified source quotations. User-authorized coach-authored bilingual examples fill gaps and are explicitly labelled; a word-level example does not imply every sense has an example.'};
for(const w of data.items){let has=false;for(const s of w.senses){report.senses+=s.meanings.length;for(let i=0;i<s.meanings.length;i++)if(s.examples?.[i]){const e=s.examples[i];report.examples++;has=true;if(e.kind==='coach_original'){report.coach_original++;continue;}report.quotations++;const host=new URL(e.source.url).hostname;const publisher=host==='ets.org'||host.endsWith('.ets.org')?'ETS':host.endsWith('merriam-webster.com')?'Merriam-Webster':host==='dictionary.cambridge.org'?'Cambridge':'Oxford';report.publishers[publisher]++;}else report.pending++;}if(has)report.words_with_examples++;}
report.words_without_examples=report.words-report.words_with_examples;
await fs.writeFile('vocab/examples/coverage.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
