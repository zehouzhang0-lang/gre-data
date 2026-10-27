import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReviewRequest, parseReview, reviewContext, reviewIdentity } from '../src/ai/review.mjs';
import { validateExplanation } from '../../shared/ai-explanation.mjs';

const question = {
  key:'["fixture","unit","1"]', material:'fixture',unit:'unit',question:'1',type:'se',mode:'pair',
  prompt:'A synthetic test sentence.',options:['calm','quiet'],letters:['A','B'],paragraphs:[],images:[],passageImages:[],
  answerKey:{answer:'A/B',answer_source:'user_provided'},
  history:{event_id:'31000000-0000-4000-8000-000000000001',answer:'A/B',recorded_at:'2026-10-27T10:00:00Z',answerKey:null},
};
const result = {
  question_translation:'仅用于契约测试的完整题干译文。',option_explanations:['A','B'].map(label=>({label,meaning:'核心义与语境义',translation:'完整翻译',reasoning:'选择或排除依据'})),
  summary:'合成测试摘要',evidence:'合成测试证据',reasoning_gap:'未提供推理',next_action:'核对选项',technique_ids:[],assessment:'supported',
};
test('desktop and mobile reject missing or reordered options, including known image labels',()=>{
  assert.doesNotThrow(()=>validateExplanation(result,question));
  assert.throws(()=>validateExplanation({...result,option_explanations:result.option_explanations.slice(0,1)},question));
  assert.throws(()=>validateExplanation({...result,option_explanations:[...result.option_explanations].reverse()},question));
  assert.throws(()=>validateExplanation({...result,option_explanations:[]},{letters:['A','B'],options:[]}));
});
test('plan request retains unknown submitted reference, uses exact schema, and omits unsupported billing fields',async()=>{
  assert.equal(reviewContext(question).reference,null);
  const body=await buildReviewRequest(question,'account-available-model');
  assert.equal(body.store,false);assert.equal(body.stream,true);
  assert.equal(body.text.format.schema.properties.option_explanations.minItems,2);
  assert.equal(body.text.format.schema.properties.option_explanations.maxItems,2);
  assert.deepEqual(Object.keys(body).sort(),['input','instructions','model','store','stream','text']);
  assert.match(await reviewIdentity(question),/^[a-f0-9]{64}$/);
  await assert.rejects(buildReviewRequest({...question,history:null},'account-available-model'),/保存/);
});
test('incomplete or missing prose cannot be saved as qualified AI analysis',()=>{
  assert.deepEqual(parseReview(JSON.stringify(result),question),result);
  assert.throws(()=>parseReview('{"incomplete":',question));
  assert.throws(()=>parseReview(JSON.stringify({...result,evidence:' '}),question));
  assert.throws(()=>parseReview(JSON.stringify({...result,question_translation:''}),question));
});
