import { useState } from 'react';
import { exportFile, importFile } from '../data/storage.mjs';
import { Icon, Sheet } from './Primitives';

// The two repositories intentionally have different formats and databases.
// Opening the practice repository here shares the same writer as the practice tab.
async function repository() {
  const { getPracticeRepository } = await import('../practice/repository.mjs');
  return getPracticeRepository();
}

export default function PracticeDataSettings({ active, notify }) {
  const [busy, setBusy] = useState(false), [file, setFile] = useState(null);
  async function backup() {
    if (busy) return;
    setBusy(true);
    try {
      const repo = await repository();
      const content = await repo.backup();
      const name = `gre-practice-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      const result = await exportFile(name, content);
      notify(result?.downloadRequested ? '刷题记录下载已发起，请在下载记录中确认。' : '刷题记录已导出。');
    } catch (error) {
      if (error.code !== 'CANCELLED') notify(`导出失败：${error.message}`, true);
    } finally { setBusy(false); }
  }
  async function choose() {
    if (busy) return;
    setBusy(true);
    try {
      const selected = await importFile();
      if (!selected) return;
      const repo = await repository();
      const preview = await repo.previewImport(selected.content);
      setFile({ ...selected, preview });
    } catch (error) {
      if (error.code !== 'CANCELLED') notify(error.message, true);
    } finally { setBusy(false); }
  }
  async function merge() {
    if (busy || !file?.preview.canMerge) return;
    setBusy(true);
    try {
      const repo = await repository();
      await repo.importBackup(file.content);
      setFile(null);
      notify('刷题记录已合并，已有记录保留。');
    } catch (error) { notify(error.message, true); }
    finally { setBusy(false); }
  }
  return <section className="settings-section">
    <h2>刷题记录</h2>
    <button className="settings-row" disabled={busy} onClick={backup}><Icon name="upload"/><span>导出刷题记录<small>作答、草稿与 AI 解析一并保存</small></span></button>
    <button className="settings-row" disabled={busy} onClick={choose}><Icon name="download"/><span>导入刷题记录<small>合并备份，保留已有记录</small></span></button>
    {file && active && <Sheet title="导入刷题记录" onClose={busy ? () => {} : () => setFile(null)} footer={<>
      <button disabled={busy} onClick={() => setFile(null)}>取消</button>
      <button className="primary" disabled={busy || !file.preview.canMerge} onClick={merge}>{busy ? '处理中…' : '确认合并'}</button>
    </>}>
      <p className="file-name">{file.name}</p>
      <dl className="import-summary">
        <div><dt>作答记录</dt><dd>{file.preview.eventCount}</dd></div>
        <div><dt>新增记录</dt><dd>{file.preview.newEvents}</dd></div>
        <div><dt>新增草稿记录</dt><dd>{file.preview.newDrafts}</dd></div>
        <div><dt>旧训练引用</dt><dd>{file.preview.newLegacy}</dd></div>
        <div><dt>新增 AI 解析</dt><dd>{file.preview.newAiReviews ?? 0}</dd></div>
      </dl>
      {!file.preview.canMerge && <p className="warning" role="alert">发现 {file.preview.conflicts.length} 项冲突，本次不会导入。请保留两份备份以便核对。</p>}
    </Sheet>}
  </section>;
}
