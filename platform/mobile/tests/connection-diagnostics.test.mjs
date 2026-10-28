import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionDiagnostic, serializeConnectionDiagnostic } from '../src/ai/diagnostics.mjs';
import { createLoginFlow } from '../src/ai/login-flow.mjs';

test('connection diagnostics export only typed bounded whitelist fields and mark failed refresh as last_known', async () => {
  const native = {
    available: true, connected: false, eligible: false,
    authorization_mode: 'official_sdk_default',
    email: 'EMAIL_SECRET@example.test', token: 'TOKEN_SECRET', state: 'STATE_SECRET', code: 'CODE_SECRET', clientId: 'CLIENT_SECRET', hostid: 'HOST_SECRET',
    uri: 'https://example.test/callback?state=QUERY_SECRET&code=QUERY_CODE_SECRET',
    login: { id: 'LOGIN_ID_SECRET', phase: 'awaiting_browser', error: 'RAW_ERROR_SECRET' },
    diagnostics: { app_version: '0.3.2', phase: 'awaiting_browser', elapsed_seconds: 14, listener_open: true, callback_requests_seen: 2, valid_callback_received: false, last_callback_rejection: 'path', token: 'NESTED_TOKEN_SECRET', callback_uri: 'CALLBACK_URI_SECRET', state: 'NESTED_STATE_SECRET' },
    toJSON() { throw Error('must never serialize full native status'); },
  };
  const report = connectionDiagnostic(native, { fresh: true });
  assert.deepEqual(report, {
    format: 'gre-chatgpt-connection-diagnostic', version: 1, status_source: 'live', available: true, authorization_mode: 'official_sdk_default',
    diagnostics: { app_version: '0.3.2', phase: 'awaiting_browser', elapsed_seconds: 14, listener_open: true, callback_requests_seen: 2, valid_callback_received: false, last_callback_rejection: 'path' },
  });
  const serialized = serializeConnectionDiagnostic(native, { fresh: true });
  for (const forbidden of ['SECRET', 'email', 'token', 'clientId', 'hostid', 'callback_uri', 'https://', '?state=', 'login', 'error']) assert(!serialized.includes(forbidden), forbidden);
  const invalid = connectionDiagnostic({ ...native, available: 'true', authorization_mode: 'official_sdk_default?token=SECRET', diagnostics: { app_version: '0.3.2+SECRET', phase: 'SECRET', elapsed_seconds: 86401, listener_open: 1, callback_requests_seen: 1000001, valid_callback_received: 'true', last_callback_rejection: 'state=SECRET' } });
  assert.deepEqual(invalid.diagnostics, { app_version: null, phase: 'unknown', elapsed_seconds: null, listener_open: null, callback_requests_seen: null, valid_callback_received: null, last_callback_rejection: 'unknown' });
  assert.equal(invalid.available, null); assert.equal(invalid.authorization_mode, null);
  for (const value of [-1, 1.5, NaN, Infinity, '1', {}, []]) {
    const checked = connectionDiagnostic({ diagnostics: { elapsed_seconds: value, callback_requests_seen: value } });
    assert.equal(checked.diagnostics.elapsed_seconds, null); assert.equal(checked.diagnostics.callback_requests_seen, null);
  }
  for (const phase of ['idle', 'starting', 'awaiting_browser', 'exchanging', 'verifying', 'connected', 'failed', 'cancelled']) assert.equal(connectionDiagnostic({ diagnostics: { phase } }).diagnostics.phase, phase);
  for (const rejection of ['none', 'method', 'host', 'path', 'state', 'duplicate', 'malformed', 'timeout', 'io']) assert.equal(connectionDiagnostic({ diagnostics: { last_callback_rejection: rejection } }).diagnostics.last_callback_rejection, rejection);
  const bounds = connectionDiagnostic({ diagnostics: { app_version: '99999.99999.99999', elapsed_seconds: 86400, callback_requests_seen: 1000000 } });
  assert.equal(bounds.diagnostics.elapsed_seconds, 86400); assert.equal(bounds.diagnostics.callback_requests_seen, 1000000);
  assert.equal(connectionDiagnostic(null, { fresh: true }).status_source, 'unavailable');
  assert.equal(connectionDiagnostic(native).status_source, 'last_known');
  assert.equal(connectionDiagnostic({ available: false }, { fresh: true }).available, false);
  const api = { connectionStatus: async () => native };
  const flow = createLoginFlow({ api });
  assert.equal(await flow.refresh(), true);
  api.connectionStatus = async () => { throw Error('REFRESH_ERROR_SECRET'); };
  const fresh = await flow.refresh();
  assert.equal(fresh, false);
  const staleText = serializeConnectionDiagnostic(flow.getState().connection, { fresh });
  assert.equal(JSON.parse(staleText).status_source, 'last_known');
  assert(!staleText.includes('SECRET'));
  flow.dispose();
});
