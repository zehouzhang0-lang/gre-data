// Validate existing local sources; do not copy full books or generate images.
import { readPracticeSnapshot, questionDetail } from '../preview/practice-data.mjs';
const snapshot = await readPracticeSnapshot();
const counts = Object.fromEntries(Object.entries(snapshot.catalog).map(([type, bank]) => {
  if (!bank.questions.length) throw new Error(`缺少本地题目：${type}；不自编替代题。`);
  for (const q of bank.questions) {
    const detail = questionDetail(snapshot, q.key);
    if (!detail.prompt && !detail.images.length) throw new Error(`缺少可展示的题干：${q.key}`);
  }
  return [type, { questions: bank.questions.length, submitted: bank.questions.filter(q => q.submitted).length }];
}));
console.log('Read-only practice preview is ready:', counts);
