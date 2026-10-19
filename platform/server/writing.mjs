import { validateWritingReviewResult, writingReviewInputHash } from "./writing-review.mjs";

export const WRITING_KINDS = new Set(["writing_session", "writing_submission", "writing_review"]);
export const WRITING_TIME_LIMIT_SECONDS = 1800;
export const WRITING_TRANSPORT_GRACE_SECONDS = 5;
const MODES = ["outline", "paragraph", "full_essay"];
const SOURCES = ["official", "user_provided", "coach_original"];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const submissionFields = ["session_id", "text", "outline", "assistance_used", "completed", "snapshot_at"];

function object(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name}格式不正确`);
  return value;
}
function fields(value, allowed, name) {
  object(value, name);
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error(`${name}含不允许的字段；评分与计时只能由服务端生成`);
}
function string(value, name, max, optional = false, preserve = false) {
  if (optional && (value === undefined || value === null)) return "";
  if (typeof value !== "string" || value.length > max || (!optional && !value.trim())) throw new Error(`${name}不能为空，且不得超过${max}字`);
  return preserve ? value : value.trim();
}
function uuid(value, name) {
  if (typeof value !== "string" || !uuidPattern.test(value)) throw new Error(`${name}无效`);
  return value;
}
function iso(value, name) {
  const match = typeof value === "string" && value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/);
  const parsed = match && Date.parse(value);
  const local = match && Date.parse(`${match[1]}Z`);
  if (!match || !Number.isFinite(parsed) || !Number.isFinite(local)
    || new Date(local).toISOString().slice(0, 19) !== match[1]) throw new Error(`${name}须为有效、含时区的 ISO 时间`);
  return new Date(parsed).toISOString();
}
function topic(value) {
  fields(value, ["id", "title", "prompt", "instructions", "translation", "source_url", "source_kind", "theme"], "写作题目");
  const id = string(value.id, "题目编号", 120);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("题目编号格式不正确");
  if (!SOURCES.includes(value.source_kind)) throw new Error("题目来源类型无效");
  let source_url = string(value.source_url, "题目来源链接", 2048, true) || null;
  if (source_url) {
    let url;
    try { url = new URL(source_url); } catch { throw new Error("题目来源链接无效"); }
    if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error("题目来源链接须为不含账号和自定义端口的 HTTPS 链接");
    if (value.source_kind === "official" && !["ets.org", "www.ets.org"].includes(url.hostname)) throw new Error("ETS 官方题目须附 ETS 官网来源");
    source_url = url.href;
  } else if (value.source_kind === "official") throw new Error("ETS 官方题目须附来源链接");
  return {
    id, title: string(value.title, "题目标题", 300),
    prompt: string(value.prompt, "写作题干", 12000),
    instructions: string(value.instructions, "写作任务要求", 8000),
    translation: string(value.translation, "题目翻译", 12000, true),
    source_url, source_kind: value.source_kind, theme: string(value.theme, "题目主题", 120, true),
  };
}

/** Validate request fields only; derived facts are never accepted from a client. */
export function validateWriting(kind, payload) {
  if (!WRITING_KINDS.has(kind)) return null;
  if (kind === "writing_session") {
    fields(payload, ["topic", "mode", "condition", "parent_id"], "写作会话");
    if (!MODES.includes(payload.mode) || !["practice", "timed"].includes(payload.condition)) throw new Error("写作模式或训练条件无效");
    if (payload.condition === "timed" && payload.mode !== "full_essay") throw new Error("限时训练只能用于完整作文");
    const parent_id = payload.parent_id == null ? null : uuid(payload.parent_id, "原稿编号");
    if (parent_id && payload.condition !== "practice") throw new Error("修订稿只能以非限时练习开始");
    return { topic: parent_id && payload.topic == null ? null : topic(payload.topic), mode: payload.mode, condition: payload.condition, parent_id };
  }
  if (kind === "writing_submission") {
    fields(payload, submissionFields, "写作提交");
    if (typeof payload.assistance_used !== "boolean" || typeof payload.completed !== "boolean") throw new Error("请明确是否使用辅助、是否完成本稿");
    const text = string(payload.text, "写作原文", 60000, true, true);
    const outline = string(payload.outline, "提纲原文", 20000, true, true);
    if (!text.trim() && !outline.trim()) throw new Error("空白稿件不能提交；草稿仍保留在本机");
    return { session_id: uuid(payload.session_id, "写作会话编号"), text, outline,
      assistance_used: payload.assistance_used, completed: payload.completed,
      snapshot_at: iso(payload.snapshot_at, "草稿快照时间") };
  }
  fields(payload, ["submission_id", "result", "model", "input_hash", "provider", "provisional"], "写作点评");
  if (payload.provider !== undefined && payload.provider !== "codex_cli"
    || payload.provisional !== undefined && payload.provisional !== true) throw new Error("写作点评必须标记 Codex 暂定分析");
  if (typeof payload.input_hash !== "string" || !/^[a-f0-9]{64}$/.test(payload.input_hash)) throw new Error("写作点评缺少原稿指纹");
  return { submission_id: uuid(payload.submission_id, "写作稿件编号"),
    result: structuredClone(object(payload.result, "写作点评结果")), model: string(payload.model, "点评模型", 100),
    input_hash: payload.input_hash, provider: "codex_cli", provisional: true };
}

function submissionRequest(payload) {
  return validateWriting("writing_submission", Object.fromEntries(submissionFields.map(key => [key, payload[key]])));
}
function resolveSession(payload, submissions) {
  const result = validateWriting("writing_session", payload);
  if (!result.parent_id) return result;
  const parent = submissions.find(item => item.id === result.parent_id);
  if (!parent) throw new Error("找不到修订所依据的原稿");
  if (result.topic && JSON.stringify(result.topic) !== JSON.stringify(parent.topic)) throw new Error("修订稿必须沿用原稿题目");
  return { ...result, topic: structuredClone(parent.topic) };
}
function sessionProjection(event, payload) {
  return { ...structuredClone(payload), id: event.id, started_at: event.recorded_at,
    deadline_at: payload.condition === "timed" ? new Date(Date.parse(event.recorded_at) + WRITING_TIME_LIMIT_SECONDS * 1000).toISOString() : null,
    submission_id: null, submitted_at: null, submitted: false };
}
function submissionSnapshot(payload, session, recorded_at) {
  if (session.mode !== "outline" && !payload.text.trim()) throw new Error("段落或完整作文须填写正文；仅提纲可先留作草稿");
  const start = Date.parse(session.started_at), received = Date.parse(recorded_at), snapshot = Date.parse(payload.snapshot_at);
  const grace = WRITING_TRANSPORT_GRACE_SECONDS * 1000;
  if (received < start || snapshot < start - grace || snapshot > received + grace) throw new Error("草稿快照时间与写作会话不符，请检查设备时钟");
  const deadline = session.deadline_at && Date.parse(session.deadline_at);
  const timing_status = session.condition !== "timed" ? "untimed"
    : received <= deadline + grace && snapshot <= deadline ? "within_limit" : "recovered_after_deadline";
  return { ...structuredClone(payload), topic: structuredClone(session.topic), mode: session.mode,
    condition: session.condition, parent_id: session.parent_id, started_at: session.started_at, deadline_at: session.deadline_at,
    duration_seconds: (received - start) / 1000, timing_status,
    word_count: (payload.text.match(/[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*/g) || []).length };
}
function reviewSnapshot(payload, submissions) {
  const p = validateWriting("writing_review", payload);
  const submission = submissions.find(item => item.id === p.submission_id);
  if (!submission) throw new Error("找不到需要点评的写作稿件");
  if (p.input_hash !== writingReviewInputHash(submission)) throw new Error("写作点评与原稿指纹不符，未保存分析");
  return { ...p, result: validateWritingReviewResult(p.result, submission) };
}

function orderedWritingEvents(events) {
  const byId = new Map();
  for (const event of events.filter(item => WRITING_KINDS.has(item.kind))) {
    if (event.schema_version !== 1) throw new Error("写作记录版本暂不支持，原始数据未修改");
    const id = uuid(event.id, "写作事件编号");
    if (byId.has(id)) throw new Error("写作事件编号重复");
    byId.set(id, { ...event, recorded_at: iso(event.recorded_at, "写作记录时间") });
  }
  const base = [...byId.values()].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at) || a.id.localeCompare(b.id));
  const ordered = [], done = new Set(), visiting = new Set();
  function visit(event) {
    if (done.has(event.id)) return;
    if (visiting.has(event.id)) throw new Error("写作记录存在循环依赖，原始数据未修改");
    visiting.add(event.id);
    const reference = event.kind === "writing_session" ? event.payload?.parent_id
      : event.kind === "writing_submission" ? event.payload?.session_id : event.payload?.submission_id;
    if (reference != null) {
      const dependency = byId.get(reference);
      const expectedKind = event.kind === "writing_submission" ? "writing_session" : "writing_submission";
      if (!dependency || dependency.kind !== expectedKind) throw new Error("写作记录找不到其依赖的会话或原稿");
      if (Date.parse(dependency.recorded_at) > Date.parse(event.recorded_at)) throw new Error("写作记录时间早于所依赖的会话或原稿");
      visit(dependency);
    }
    visiting.delete(event.id);
    done.add(event.id);
    ordered.push(event);
  }
  // UUID order is only a stable tie-breaker, never proof of causal order.
  // Walk dependencies first when synced records share the same millisecond.
  for (const event of base) visit(event);
  return ordered;
}

/** Pure replay. Unrelated legacy events do not become writing evidence. */
export function projectWriting(events = [], target = null) {
  const sessions = [], submissions = [], reviews = [];
  for (const event of orderedWritingEvents(events)) {
    const recorded_at = event.recorded_at;
    if (event.kind === "writing_session") {
      sessions.push(sessionProjection({ ...event, recorded_at }, resolveSession(event.payload, submissions)));
    } else if (event.kind === "writing_submission") {
      const request = submissionRequest(event.payload);
      const session = sessions.find(item => item.id === request.session_id);
      if (!session) throw new Error("写作提交找不到先前的会话");
      if (session.submission_id) throw new Error("同一写作会话存在重复提交，原始记录已保留，请核查");
      const snapshot = submissionSnapshot(request, session, recorded_at);
      fields(event.payload, Object.keys(snapshot), "已保存写作提交");
      for (const key of Object.keys(snapshot)) {
        if (JSON.stringify(event.payload[key]) !== JSON.stringify(snapshot[key])) throw new Error("写作提交快照与原会话不符，原始数据未修改");
      }
      submissions.push({ ...snapshot, id: event.id, recorded_at });
      Object.assign(session, { submission_id: event.id, submitted_at: recorded_at, submitted: true });
    } else {
      reviews.push({ ...reviewSnapshot(event.payload, submissions), id: event.id, recorded_at });
    }
  }
  const validTarget = typeof target === "number" && target >= 0 && target <= 6 && Number.isInteger(target * 2) ? target : null;
  return { sessions: sessions.reverse(), submissions: submissions.reverse(), reviews: reviews.reverse(), target: validTarget };
}

/** Resolve references and derive immutable facts before an atomic event write. */
export function prepareWritingEvent({ kind, payload, id, recorded_at, events = [] }) {
  uuid(id, "写作操作编号");
  const timestamp = iso(recorded_at, "写作记录时间");
  const writing = projectWriting(events);
  let request = kind === "writing_session" ? resolveSession(payload, writing.submissions) : validateWriting(kind, payload);
  if (!request) throw new Error("不支持的写作操作");
  const prior = events.find(event => event.id === id);
  if (prior) {
    const priorRequest = prior.kind === "writing_submission" ? submissionRequest(prior.payload)
      : prior.kind === "writing_session" ? resolveSession(prior.payload, writing.submissions)
        : prior.kind === "writing_review" ? validateWriting(prior.kind, prior.payload) : null;
    if (prior.kind !== kind || JSON.stringify(priorRequest) !== JSON.stringify(request)) throw new Error("操作编号已被不同内容使用");
    return structuredClone(prior);
  }
  let prepared = request;
  if (kind === "writing_submission") {
    const session = writing.sessions.find(item => item.id === request.session_id);
    if (!session) throw new Error("找不到写作会话，请先开始训练");
    const previous = events.find(event => event.kind === kind && event.payload.session_id === request.session_id);
    if (previous) {
      if (JSON.stringify(submissionRequest(previous.payload)) !== JSON.stringify(request)) throw new Error("本会话已经提交；修改文章请另开修订稿");
      return structuredClone(previous);
    }
    prepared = submissionSnapshot(request, session, timestamp);
  } else if (kind === "writing_review") prepared = reviewSnapshot(request, writing.submissions);
  return { schema_version: 1, id, recorded_at: timestamp, kind, payload: prepared };
}
