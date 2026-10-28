import { LOGIN_PHASES } from './login-flow.mjs';

const REJECTIONS = new Set(['none', 'method', 'host', 'path', 'state', 'duplicate', 'malformed', 'timeout', 'io']);
const bool = value => typeof value === 'boolean' ? value : null;
const integer = (value, max) => Number.isSafeInteger(value) && value >= 0 && value <= max ? value : null;
const version = value => typeof value === 'string' && /^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(value) ? value : null;

// Construct every field explicitly. Neither arbitrary status properties nor
// messages, IDs, URLs, account data or authorization parameters are serialized.
export function connectionDiagnostic(status, { fresh = false } = {}) {
  const source = status?.diagnostics;
  return {
    format: 'gre-chatgpt-connection-diagnostic',
    version: 1,
    status_source: fresh === true && status ? 'live' : status ? 'last_known' : 'unavailable',
    available: bool(status?.available),
    authorization_mode: status?.authorization_mode === 'official_sdk_default' ? 'official_sdk_default' : null,
    diagnostics: {
      app_version: version(source?.app_version),
      phase: LOGIN_PHASES.has(source?.phase) ? source.phase : 'unknown',
      elapsed_seconds: integer(source?.elapsed_seconds, 86400),
      listener_open: bool(source?.listener_open),
      callback_requests_seen: integer(source?.callback_requests_seen, 1000000),
      valid_callback_received: bool(source?.valid_callback_received),
      last_callback_rejection: REJECTIONS.has(source?.last_callback_rejection) ? source.last_callback_rejection : 'unknown',
    },
  };
}

export function serializeConnectionDiagnostic(status, options) {
  return JSON.stringify(connectionDiagnostic(status, options), null, 2);
}
