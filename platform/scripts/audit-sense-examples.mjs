import fs from 'node:fs/promises';
import {validateQuotationBudget} from '../shared/sense-examples.mjs';
const data=JSON.parse(await fs.readFile('vocab/standardized.json','utf8'));
const entries=[];
for(const name of await fs.readdir('vocab/examples'))if(/^verified-.*\.json$/.test(name))entries.push(...JSON.parse(await fs.readFile('vocab/examples/'+name,'utf8')).items);
const index=new Map(data.items.map(w=>[w.word,w]));
if(new Set(entries.map(w=>w.word)).size!==entries.length)throw Error('重复例句词条');
const reviewed=new Map(entries.map(w=>[w.word,w]));
for(const d of data.items)if(d.senses.length&&!reviewed.has(d.word))throw Error('词条例句尚未审阅 '+d.word);
for(const e of entries){const d=index.get(e.word);if(!d||e.senses.length!==d.senses.length)throw Error('例句词条不匹配 '+e.word);for(let i=0;i<d.senses.length;i++){const g=e.senses[i],s=d.senses[i];if(g.pos!==s.pos||JSON.stringify(g.meanings)!==JSON.stringify(s.meanings)||g.examples.length!==s.meanings.length)throw Error('义项位置不匹配 '+e.word);}}
for(const d of data.items)if(d.senses.length&&JSON.stringify(d.senses.map(s=>s.examples))!==JSON.stringify(reviewed.get(d.word).senses.map(s=>s.examples)))throw Error('生成词库的例句尚未同步 '+d.word);
const pages=validateQuotationBudget(entries);
const report={date:'2026-10-16',words:data.items.filter(w=>w.senses.length).length,senses:0,words_with_examples:0,examples:0,pending:0,source_pages:pages.size,publishers:{ETS:0,Oxford:0},source_policy:'ETS original sentences take priority when the part of speech and specific meaning match; Oxford original examples supplement them. No authored examples; unmatched or unavailable sentences remain null.'};
for(const w of data.items){let has=false;for(const s of w.senses){report.senses+=s.meanings.length;for(let i=0;i<s.meanings.length;i++)if(s.examples?.[i]){report.examples++;has=true;report.publishers[s.examples[i].source.publisher==='ETS'?'ETS':'Oxford']++;}else report.pending++;}if(has)report.words_with_examples++;}
await fs.writeFile('vocab/examples/coverage.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
