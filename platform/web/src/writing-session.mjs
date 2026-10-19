export const WRITING_NAMESPACE = 'gre-writing:v1:';
export const WRITING_MODES = { outline: '提纲训练', paragraph: '单段训练', full_essay: '整篇写作' };
export const TIMED_SECONDS = 1800;
const volatileRecords = new Map();

export function readWritingValue(storage, key) {
  const name = WRITING_NAMESPACE + key;
  try {
    const raw = storage.getItem(name);
    if (!raw) return { value: volatileRecords.has(name) ? volatileRecords.get(name) : null, error: '' };
    const value = JSON.parse(raw);
    if (value?.version !== 1) throw new Error('草稿版本无法识别，请先导出原始内容。');
    return { value: volatileRecords.has(name) ? volatileRecords.get(name) : value, error: '' };
  } catch (error) {
    return { value: volatileRecords.get(name) ?? null, error: `无法读取本机草稿：${error.message}` };
  }
}

export function writeWritingValue(storage, key, value) {
  const name = WRITING_NAMESPACE + key;
  // The in-memory copy also survives navigation inside the SPA when storage is unavailable.
  volatileRecords.set(name, value);
  try {
    if (value === null) storage.removeItem(name);
    else storage.setItem(name, JSON.stringify({ ...value, version: 1 }));
    return { ok: true, error: '' };
  } catch (error) {
    return { ok: false, error: `本机草稿保存失败：${error.message}。当前内容仅在本页内存中，请导出文本，勿刷新或关闭页面。` };
  }
}

export function sessionFromEvent(event) {
  const value = event.payload ? { ...event.payload, id: event.id, recorded_at: event.recorded_at } : event;
  const started_at = value.started_at || value.recorded_at;
  return {
    ...value, started_at,
    deadline_at: value.condition === 'timed'
      ? value.deadline_at || new Date(Date.parse(started_at) + TIMED_SECONDS * 1000).toISOString()
      : null,
  };
}

export function remainingSeconds(session, now = Date.now()) {
  if (session.condition !== 'timed') return null;
  return Math.max(0, Math.ceil((Date.parse(session.deadline_at) - Number(now)) / 1000));
}

export function expiredWritingSession(session, now = Date.now()) {
  return session.condition === 'timed' && Number(now) >= Date.parse(session.deadline_at);
}

export function newWritingDraft(session, initial = {}, now = Date.now(), id = crypto.randomUUID()) {
  return {
    version: 1, session_id: session.id, session,
    text: initial.text || '', outline: initial.outline || '',
    assistance_used: Boolean(initial.assistance_used), completed: false,
    updated_at: new Date(now).toISOString(), save_id: id, frozen: null,
  };
}

export function editWritingDraft(session, draft, patch, now = Date.now()) {
  if (draft.frozen || expiredWritingSession(session, now)) return draft;
  const next = { ...draft, ...patch, updated_at: new Date(now).toISOString() };
  if (session.mode !== 'full_essay') next.completed = false;
  return next;
}

export function freezeWritingDraft(session, draft, now = Date.now(), reason = 'manual') {
  if (draft.frozen) return draft;
  const timestamp = new Date(now).toISOString();
  // A deadline snapshot references already-written content and its true timestamp,
  // never a fabricated deadline timestamp or text received after the deadline.
  const snapshot_at = reason === 'deadline' && draft.updated_at ? draft.updated_at : timestamp;
  return {
    ...draft,
    frozen: {
      text: draft.text || '', outline: draft.outline || '',
      assistance_used: Boolean(draft.assistance_used),
      completed: session.mode === 'full_essay' && Boolean(draft.completed),
      snapshot_at, frozen_at: timestamp, reason,
    },
  };
}

export function submissionPayload(session, draft) {
  if (!draft.frozen) throw new Error('请先确认并冻结要提交的原稿。');
  const { text, outline, assistance_used, completed, snapshot_at } = draft.frozen;
  return { session_id: session.id, text, outline, assistance_used, completed: session.mode === 'full_essay' && completed, snapshot_at };
}

export function hasWritingContent(session, draft) {
  const source = draft.frozen || draft;
  return session.mode === 'outline'
    ? Boolean((source.text || '').trim() || (source.outline || '').trim())
    : Boolean((source.text || '').trim());
}

export function writingWordCount(text = '') {
  return (text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || []).length;
}

export function validWritingExcerpt(original, excerpt) {
  return typeof excerpt === 'string' && Boolean(excerpt.trim()) && String(original || '').includes(excerpt.trim());
}

export function writingTextExport(session, draft) {
  const content = draft.frozen || draft;
  return [session.topic?.title || 'GRE Issue 写作', '', 'PROMPT', session.topic?.prompt || '', '',
    'INSTRUCTIONS', session.topic?.instructions || '', '', `训练：${WRITING_MODES[session.mode] || session.mode}`,
    `开始时间：${session.started_at || ''}`, `截止时间：${session.deadline_at || '未计时练习'}`,
    `辅助使用：${content.assistance_used ? '是' : '否'}`, `全文完成声明：${content.completed ? '已完成' : '未完成 / 非全文'}`,
    '', 'OUTLINE', content.outline || '', '', 'DRAFT', content.text || '', '',
    `快照时间：${content.snapshot_at || draft.updated_at || ''}`].join('\n');
}

export function downloadWritingText(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
