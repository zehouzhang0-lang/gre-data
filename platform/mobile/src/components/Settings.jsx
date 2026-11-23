import { useLayoutEffect, useRef, useState } from 'react';
import { exportFile, importFile } from '../data/storage.mjs';
import { wallAppearanceDefaults } from '../wall-display.mjs';
import { PAGE_TONES, configureSound, copySoundDiagnostic, play, soundDiagnostics } from '../sound.mjs';
import { useBackAction } from '../useBack';
import { Confirm, Icon, Sheet } from './Primitives';
import { WallFontField, WallGestureHelp } from './WallSheets';
import PracticeDataSettings from './PracticeDataSettings';
import ChatGPTSettings from './ChatGPTSettings';
import '../settings.css';

const appearanceChoices = [
  { key: 'theme', label: '外观', options: [['light', '浅色'], ['dark', '深色'], ['system', '跟随系统']] },
  { key: 'look', label: '记忆状态', options: [['pip', '圆点'], ['fill', '填色']] },
  { key: 'axis', label: '词墙方向', options: [['x', '左右'], ['y', '上下']] },
];
const subpageTitles = { ai: 'AI 解析', gestures: '手势', data: '离线使用与数据说明' };

function SettingsToggle({ label, checked, onChange }) {
  return <label className="settings-line settings-toggle">
    <span>{label}</span><input type="checkbox" role="switch" checked={checked} onChange={event => onChange(event.target.checked)}/>
  </label>;
}

export default function Settings({ state, repo, active, busy, mutate, notify, onRestored,
  wallAppearance = wallAppearanceDefaults, onWallAppearanceChange, wallFont, onWallFontChange }) {
  const [file, setFile] = useState(null), [reading, setReading] = useState(false);
  const [recovery, setRecovery] = useState(null), [subpage, setSubpage] = useState(null);
  const [audioDiagnostic, setAudioDiagnostic] = useState('');
  const title = useRef(null), scroller = useRef(null), returnTo = useRef(null);
  const catalogUpdate = state.settings.catalogUpdate;
  const hasRecoveryTools = state.hasCatalogRecovery || state.hasRecovery;
  const closeSubpage = () => { play('leave'); setSubpage(null); };
  useBackAction(closeSubpage, active && !!subpage, 40);
  useLayoutEffect(() => {
    if (!active) return;
    if (subpage) {
      scroller.current.scrollTop = 0;
      title.current.focus({ preventScroll: true });
    } else if (returnTo.current) {
      const { control, scrollTop } = returnTo.current;
      scroller.current.scrollTop = scrollTop;
      control.focus({ preventScroll: true });
      returnTo.current = null;
    }
  }, [active, subpage]);
  function openSubpage(page, event) {
    returnTo.current = { control: event.currentTarget, scrollTop: scroller.current.scrollTop };
    setSubpage(page);
  }
  function changePageTone(event) {
    const pageTone = event.target.value;
    if (pageTone === wallAppearance.pageTone) return;
    onWallAppearanceChange({ pageTone });
    configureSound({ pageTone, sound: wallAppearance.sound, engine: wallAppearance.audioEngine });
    play('pageNext', 3);
  }
  function changeSound(sound, engine = wallAppearance.audioEngine) {
    configureSound({ sound, pageTone: wallAppearance.pageTone, engine });
    onWallAppearanceChange({ sound, audioEngine: engine });
    if (sound) play('tap');
  }
  async function copyAudioDiagnostic() {
    const { engine, sampleRate, baseLatency, outputLatency, sounds } = soundDiagnostics();
    const value = JSON.stringify({ engine, sampleRate, baseLatency, outputLatency, sounds }, null, 2);
    try {
      await copySoundDiagnostic(value);
      setAudioDiagnostic('');
      notify('已复制音效诊断');
    } catch {
      setAudioDiagnostic(value);
      notify('可选中下方的音效诊断手动复制');
    }
  }
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
      notify(result?.downloadRequested ? '备份下载已发起，请查看下载记录。' : '备份已导出。');
    } catch (e) { if (e.code !== 'CANCELLED') notify(`导出失败：${e.message}`, true); }
    finally { setReading(false); }
  }
  async function importSelected() {
    const current = file;
    const success = await mutate(() => current.mode === 'restore' ? repo.restore(current.content) : repo.importVocabulary(current.content), current.mode === 'restore' ? '完整备份已恢复' : '词库已合并，原有进度保留');
    if (success) { setFile(null); onRestored(); }
  }
  return <section className="screen settings-screen" data-ui-sounds="" hidden={!active} aria-label="设置与备份">
    <header className="screen-header settings-header">
      {subpage && <button type="button" className="icon-button" data-sound="none" aria-label="返回设置" onClick={closeSubpage}><Icon name="back"/></button>}
      <h1 ref={title} tabIndex={-1}>{subpageTitles[subpage] || '设置'}</h1>
    </header>
    <main ref={scroller} className="screen-scroll settings-content">
      {onWallAppearanceChange && <section className="settings-group" hidden={!!subpage}><h2>外观与声音</h2>
        {appearanceChoices.map(({ key, label, options }) => <div key={key} className="settings-line settings-choice" role="group" aria-label={label}>
          <span>{label}</span>
          <div className="settings-choice-buttons">
            {options.map(([value, text]) => <button key={value} type="button" aria-pressed={wallAppearance[key] === value}
              onClick={() => onWallAppearanceChange({ [key]: value })}>{text}</button>)}
          </div>
        </div>)}
        {onWallFontChange && <WallFontField value={wallFont ?? wallAppearance.font ?? 15} onChange={onWallFontChange}/>}
        <SettingsToggle label="音效" checked={wallAppearance.sound} onChange={sound => changeSound(sound)}/>
        <label className="settings-line">翻页音色<select className="settings-select" value={wallAppearance.pageTone} onChange={changePageTone}>
          {Object.entries(PAGE_TONES).map(([id, tone]) => <option key={id} value={id}>{tone.label}</option>)}
        </select></label>
        <SettingsToggle label="触感" checked={wallAppearance.haptics} onChange={haptics => { play('tap'); onWallAppearanceChange({ haptics }); }}/>
      </section>}
      <section className="settings-group" hidden={!!subpage}><h2>数据与备份</h2>
        {onWallAppearanceChange && <label className="settings-line">搜索加词<select className="settings-select" value={wallAppearance.addMode}
          onChange={event => { play('tap'); onWallAppearanceChange({ addMode: event.target.value }); }}>
          <option value="direct">直接加入</option><option value="meaning">先填释义</option>
        </select></label>}
        <button type="button" className="settings-line settings-action" disabled={reading || busy} onClick={() => backup()}>导出词汇备份</button>
        <button type="button" className="settings-line settings-action" disabled={reading || busy} onClick={() => choose('restore')}>恢复词汇备份</button>
        <button type="button" className="settings-line settings-action" disabled={reading || busy} onClick={() => choose('import')}>导入词库</button>
        <PracticeDataSettings active={active && !subpage} notify={notify}/>
        {hasRecoveryTools && <button type="button" className="settings-line settings-action settings-link" aria-haspopup="dialog" disabled={reading || busy}
          onClick={() => setRecovery('tools')}>恢复工具<Icon name="back" size={16}/></button>}
        {reading && !recovery && <p role="status" className="settings-progress">正在处理文件…</p>}
      </section>
      <ChatGPTSettings active={active} subpage={subpage} onOpen={event => openSubpage('ai', event)} state={state} repo={repo} mutate={mutate} notify={notify}/>
      <section className="settings-group" hidden={!!subpage}><h2>帮助</h2>
        <button type="button" className="settings-line settings-action settings-link" onClick={event => openSubpage('gestures', event)}>手势<Icon name="back" size={16}/></button>
        <button type="button" className="settings-line settings-action settings-link" onClick={event => openSubpage('data', event)}>离线使用与数据说明<Icon name="back" size={16}/></button>
        {onWallAppearanceChange && <>
          <div className="settings-line settings-audio-engine">
            <label htmlFor="audio-engine">音效引擎</label>
            <select id="audio-engine" className="settings-select" value={wallAppearance.audioEngine}
              onChange={event => { setAudioDiagnostic(''); changeSound(wallAppearance.sound, event.target.value); }}>
              <option value="native">低延迟</option><option value="web">网页</option>
            </select>
            <button type="button" className="text-button" onClick={copyAudioDiagnostic}>复制诊断</button>
          </div>
          {audioDiagnostic && <textarea className="settings-audio-diagnostic" readOnly rows={6} aria-label="音效诊断" value={audioDiagnostic}
            onFocus={event => event.currentTarget.select()}/>}
        </>}
        <div className="settings-line"><span>学习日时区</span><span className="settings-value">{state.spacedReview?.time_zone || state.timeZone || 'Asia/Shanghai'}</span></div>
      </section>
      {subpage === 'gestures' && <div className="settings-help">
        <WallGestureHelp axis={wallAppearance.axis}/><p>刷题除数学外可左右滑动切题。</p>
      </div>}
      {subpage === 'data' && <div className="settings-help">
        <p>词库和题目可离线使用。AI 解析需要联网并连接 ChatGPT。</p>
        <p>词汇与刷题数据保存在本机。换机或卸载前，请分别导出备份。恢复词汇备份会替换当前词汇数据，导入刷题记录会与已有记录合并。</p>
        <p>词汇备份包含词条、关系、复习记录和显示设置。导入词库只合并新词和分类，保留复习进度。</p>
        <p>刷题备份包含作答、草稿和 AI 解析，可交给电脑 Codex 核对导入和同步 GitHub。</p>
        {catalogUpdate && <p>词库已更新，进度已保留。{catalogUpdate.added > 0 ? `新增 ${catalogUpdate.added} 个词。` : ''}{catalogUpdate.preserved > 0 ? `${catalogUpdate.preserved} 个词保留手机原有释义。` : ''}</p>}
      </div>}
  </main>
    {file && active && <Sheet title={file.mode === 'restore' ? '恢复前确认' : '导入预览'} onClose={busy ? () => {} : () => setFile(null)} footer={<><button disabled={busy} onClick={() => setFile(null)}>取消</button><button disabled={busy} className={file.mode === 'restore' ? 'danger' : 'primary'} onClick={importSelected}>{busy ? '处理中…' : file.mode === 'restore' ? '确认替换并恢复' : '确认导入'}</button></>}>
      <p className="file-name">{file.name}</p><dl className="import-summary"><div><dt>单词</dt><dd>{file.preview.wordCount}</dd></div><div><dt>新词</dt><dd>{file.preview.newWords}</dd></div><div><dt>已有词</dt><dd>{file.preview.existingWords}</dd></div><div><dt>复习事件</dt><dd>{file.preview.eventCount}</dd></div></dl>
      {file.mode === 'restore' ? <p className="warning">将用此备份完整替换手机当前数据；备份之后的变化不会合并。恢复前快照会自动保留，可在设置中撤回。</p> : <p>仅合并新增词条与新分类关系。已有词、复习历史和进度保持不变，不导入另一端的复习次数。</p>}
      {file.mode === 'import' && !!file.preview.conflicts?.length && <details><summary>{file.preview.conflicts.length} 项差异，保留手机现有内容</summary><ul>{file.preview.conflicts.slice(0, 30).map((conflict, i) => <li key={i}>{typeof conflict === 'string' ? conflict : conflict.word || conflict.id || JSON.stringify(conflict)}</li>)}</ul></details>}
    </Sheet>}
    {recovery === 'tools' && active && <Sheet title="恢复工具" onClose={() => setRecovery(null)}>
      <div className="settings-sheet-list">
        {state.hasCatalogRecovery && <button type="button" className="settings-line settings-action" disabled={reading || busy} onClick={() => backup('catalog')}>导出词库更新前备份</button>}
        {state.hasRecovery && <>
          <button type="button" className="settings-line settings-action" disabled={reading || busy} onClick={() => backup(true)}>导出恢复前备份</button>
          <button type="button" className="settings-line settings-action" disabled={reading || busy} onClick={() => setRecovery('confirm')}>撤回上次恢复</button>
        </>}
      </div>
      {reading && <p role="status" className="settings-progress">正在处理文件…</p>}
    </Sheet>}
    {recovery === 'confirm' && active && <Confirm title="撤回上次恢复" action="恢复到之前" danger busy={busy} onClose={() => setRecovery('tools')} onConfirm={async () => { if (await mutate(() => repo.restorePrevious(), '已恢复到上次恢复操作之前')) { setRecovery(null); onRestored(); } }}>当前数据会被恢复前的快照替换。上次恢复之后的学习记录不会合并，可先导出当前备份。</Confirm>}
  </section>;
}
