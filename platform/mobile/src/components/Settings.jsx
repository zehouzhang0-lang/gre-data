import { useState } from 'react';
import { exportFile, importFile } from '../data/storage.mjs';
import { Confirm, Icon, Sheet } from './Primitives';

export default function Settings({ state, repo, active, busy, mutate, notify, onRestored }) {
  const [file, setFile] = useState(null), [reading, setReading] = useState(false), [recovery, setRecovery] = useState(false), [lastExport, setLastExport] = useState('');
  async function choose(mode) {
    if (reading || busy) return;
    setReading(true);
    try {
      const selected = await importFile();
      if (!selected) return;
      const preview = await repo.previewImport(selected.content);
      if (mode === 'restore' && !preview.canRestore) throw new Error('这不是完整备份。词库更新包请通过“导入词库”合并。');
      setFile({ ...selected, preview, mode });
    } catch (e) { if (e.code !== 'CANCELLED') notify(e.message, true); }
    finally { setReading(false); }
  }
  async function backup(recover = false) {
    if (reading || busy) return;
    setReading(true);
    try {
      const content = await (recover === 'catalog' ? repo.backupCatalogRecovery() : recover ? repo.backupRecovery() : repo.backup());
      const name = `gre-vocabulary-${recover ? 'before-restore-' : ''}${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      const result = await exportFile(name, content);
      setLastExport(`${result?.downloadRequested ? '已发起下载' : '已导出'}：${result?.name || name}`);
      notify(result?.downloadRequested ? '备份下载已发起，请在浏览器下载记录中确认文件。' : '备份已导出，请妥善保留到应用之外。');
    } catch (e) { if (e.code !== 'CANCELLED') notify(`导出失败：${e.message}`, true); }
    finally { setReading(false); }
  }
  async function importSelected() {
    const current = file;
    const success = await mutate(() => current.mode === 'restore' ? repo.restore(current.content) : repo.importVocabulary(current.content), current.mode === 'restore' ? '完整备份已恢复' : '词库已合并，原有进度保留');
    if (success) { setFile(null); onRestored(); }
  }
  return <section className="screen" hidden={!active} aria-label="设置与备份"><header className="screen-header"><h1>设置</h1></header><main className="screen-scroll settings-content">
    <section className="settings-section"><h2>词库与数据</h2><p className="muted">{state.vocabulary.filter(w => !w.deleted).length} 个单词 · 数据保存在此设备</p>
      {state.settings.catalogUpdate && <p role="status">新版词义与分类已更新，学习进度已保留。{state.settings.catalogUpdate.preserved > 0 ? `另有 ${state.settings.catalogUpdate.preserved} 个词保留手机原有释义。` : ''}</p>}
      <button className="settings-row" disabled={reading || busy} onClick={() => choose('import')}><Icon name="download"/><span>导入词库<small>合并新词与新分类，不覆盖已有复习进度</small></span></button>
      <button className="settings-row" disabled={reading || busy} onClick={() => backup()}><Icon name="upload"/><span>导出完整备份<small>词库、关系、历史、轮次与显示设置</small></span></button>
      {state.hasCatalogRecovery && <button className="settings-row" disabled={reading || busy} onClick={() => backup('catalog')}><Icon name="upload"/><span>导出词库更新前备份<small>保留本次升级前的词库和学习记录</small></span></button>}
      <button className="settings-row" disabled={reading || busy} onClick={() => choose('restore')}><Icon name="history"/><span>恢复完整备份<small>预览后替换当前数据，并保留恢复前快照</small></span></button>
      {state.hasRecovery && <><button className="settings-row" disabled={reading || busy} onClick={() => setRecovery(true)}><Icon name="history"/><span>撤回上次完整恢复<small>回到上一次恢复操作之前的数据</small></span></button><button className="settings-row" disabled={reading || busy} onClick={() => backup(true)}><Icon name="upload"/><span>导出恢复前备份<small>将安全快照另存到应用之外</small></span></button></>}
      {reading && <p role="status">正在处理文件…</p>}{lastExport && <p className="export-path">{lastExport}</p>}
    </section>
    <section className="settings-section"><h2>离线使用</h2><p>不需要登录或启动电脑。手机与电脑的进度不会自动同步；导出备份不等于合并两端进度。</p><p>卸载应用可能移除本地数据。换机、卸载或恢复旧备份前，请先导出完整备份。</p><p className="muted">学习日时区：{state.spacedReview?.time_zone || 'Asia/Shanghai'}</p></section>
    <section className="settings-section"><h2>操作提示</h2><p>轻触卡片翻面，长按或点“多选”进入选择模式；多选时轻触只选中／取消。绿色边框表示选中，底色表示记忆自评。</p><p>列数、卡片高度和英文字号在词库右上角调整。同轮改标不重复计次；“开始新一轮”才产生新的回忆轮次。</p></section>
  </main>
    {file && active && <Sheet title={file.mode === 'restore' ? '恢复前确认' : '导入预览'} onClose={busy ? () => {} : () => setFile(null)} footer={<><button disabled={busy} onClick={() => setFile(null)}>取消</button><button disabled={busy} className={file.mode === 'restore' ? 'danger' : 'primary'} onClick={importSelected}>{busy ? '处理中…' : file.mode === 'restore' ? '确认替换并恢复' : '确认导入'}</button></>}>
      <p className="file-name">{file.name}</p><dl className="import-summary"><div><dt>单词</dt><dd>{file.preview.wordCount}</dd></div><div><dt>新词</dt><dd>{file.preview.newWords}</dd></div><div><dt>已有词</dt><dd>{file.preview.existingWords}</dd></div><div><dt>复习事件</dt><dd>{file.preview.eventCount}</dd></div></dl>
      {file.mode === 'restore' ? <p className="warning">将用此备份完整替换手机当前数据；备份之后的变化不会合并。恢复前快照会自动保留，可在设置中撤回。</p> : <p>仅合并新增词条与新分类关系。已有词、复习历史和进度保持不变，不导入另一端的复习次数。</p>}
      {file.mode === 'import' && !!file.preview.conflicts?.length && <details><summary>{file.preview.conflicts.length} 项差异，保留手机现有内容</summary><ul>{file.preview.conflicts.slice(0, 30).map((conflict, i) => <li key={i}>{typeof conflict === 'string' ? conflict : conflict.word || conflict.id || JSON.stringify(conflict)}</li>)}</ul></details>}
    </Sheet>}
    {recovery && active && <Confirm title="撤回上次完整恢复" action="恢复到之前" danger busy={busy} onClose={() => setRecovery(false)} onConfirm={async () => { if (await mutate(() => repo.restorePrevious(), '已恢复到上次恢复操作之前')) { setRecovery(false); onRestored(); } }}>当前数据会被恢复前的快照替换。上次恢复之后新产生的学习记录不会合并；建议先导出当前完整备份。</Confirm>}
  </section>;
}
