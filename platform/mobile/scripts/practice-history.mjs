import fs from 'node:fs/promises';
import { clone, mergeRecords, validateDocument } from '../src/practice/model.mjs';
import { readPracticeBackup, practiceHistoryDocument } from '../src/practice/packages.mjs';

export async function loadPracticeHistoryBackup(backupPath) {
  return backupPath ? readPracticeBackup(await fs.readFile(backupPath, 'utf8')) : null;
}

export function mergePracticeHistory(history, backup = null) {
  const desktop = practiceHistoryDocument(history);
  let document = desktop;
  if (backup) {
    const plan = mergeRecords(desktop, validateDocument(backup));
    if (plan.preview.conflicts.length) throw Error(`刷题历史存在 ${plan.preview.conflicts.length} 条同 ID 不同内容的记录，未发布新题库；双方原记录保留`);
    document = validateDocument(plan.next);
  }
  // Device preferences, dataset identity and prior installed revisions do not
  // belong in shared content. Raw submissions and all original drafts do.
  const { events, legacy, drafts, draft_heads } = document;
  const result = clone({ events, legacy, drafts, draft_heads });
  practiceHistoryDocument(result);
  return result;
}
