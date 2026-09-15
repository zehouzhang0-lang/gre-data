export const stageLabels = { meaning_1: "英选中 · 第一遍", meaning_2: "英选中 · 第二遍", cloze: "字母填空", spelling: "中文拼英文" };
export const eventLabels = {
  topic_upsert: "编辑词汇主题", topic_delete: "移除词汇主题", topic_restore: "恢复词汇主题",
  word_topics: "调整单词分类", relation_upsert: "编辑词汇关系", relation_delete: "移除词汇关系", relation_restore: "恢复词汇关系",
  ai_review: "AI 讲解与复盘", vocab_recall: "词汇回忆", vocab_session: "开始复习轮次", vocab_drill: "轮内词汇练习",
  vocab_upsert: "编辑生词", vocab_capture: "题中摘词", vocab_delete: "移除生词", vocab_restore: "恢复生词",
  questions_import: "导入题目", keys_import: "导入答案与解析", attempts_import: "上传作答", attempt: "答题", material_upload: "上传 PDF",
};
export const learningEventKinds = new Set(["attempt", "attempts_import", "vocab_recall", "vocab_drill", "vocab_session"]);
export function attemptLabel(result) { return result === true ? "答案一致" : result === false ? "答案不一致" : "待核对"; }
export function recallLabel(recall) {
  if (recall.mode === "multistage") return { remembered: "本轮通过", partial: "本轮有提示或错答", forgotten: "本轮需再练" }[recall.self_rating] || "本轮已记录";
  return { remembered: "自评记得", partial: "自评模糊", forgotten: "自评忘记" }[recall.self_rating] || "未记录结果";
}
export function legacySubject(record) {
  if (record.path.startsWith("vocab/")) return "vocab";
  if (record.path.startsWith("quant/")) return "quant";
  if (record.path.startsWith("analytical-writing/")) return "writing";
  return "verbal";
}
export function legacyDate(record) {
  const match = record.name.match(/^(\d{4})(\d{2})(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}
export function groupBy(items, key) {
  const map = new Map();
  for (const item of items) { const id = key(item); if (!map.has(id)) map.set(id, []); map.get(id).push(item); }
  return [...map].map(([id, records]) => ({ id, records: records.sort((a, b) => b.recorded_at.localeCompare(a.recorded_at)) }));
}
