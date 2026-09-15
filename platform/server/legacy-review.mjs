import YAML from 'yaml';
// Only explicit individual answers, or a fully answered range, count as attempts.
export async function readLegacyQuestions(store) {
  const records=[];
  for(const dir of ['verbal/submissions','quant/submissions'])for(const file of await store.list(dir)) {
    if(!file.endsWith('.md'))continue;
    const record=`${dir}/${file}`,raw=await store.read(record);
    const r=YAML.parse(raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/)?.[1]||'{}');
    const type={text_completion:'tc',sentence_equivalence:'se',reading_comprehension:'rc',quant:'quant'}[r.mode];
    if(!type || !r.source?.material_id || !r.source.unit || !r.answered)continue;
    const range=String(r.source.question_range).match(/^(\d+)(?:-(\d+))?$/);
    const numbers=new Set((r.errors||[]).filter(e=>e.user_answer!==null&&e.user_answer!==undefined&&String(e.user_answer).trim()).map(e=>String(e.question_id)));
    if(range && +r.answered === +(range[2] || range[1]) - +range[1] + 1) {
      for(let n=+range[1];n<=+(range[2]||range[1]);n++)numbers.add(String(n));
    }
    const recorded_at=r.started_at || (r.date ? `${r.date}T12:00:00+08:00`:null);
    if(!recorded_at || !Number.isFinite(Date.parse(recorded_at)))continue;
    for(const question of numbers)records.push({material:r.source.material_id,unit:r.source.unit,question,type,record,recorded_at});
  }
  return records;
}
