// 偽の発行応答専用。実LINEへは接続せず、Login ID/secretのフォームだけを受け付ける。
import assert from 'node:assert/strict';
import { Response } from 'undici';
export async function mockStatelessToken(request, clientId, clientSecret, accessToken) {
  assert.equal(request.url, 'https://api.line.me/oauth2/v3/token');
  assert.equal(request.method, 'POST');
  assert.equal(request.headers.get('authorization'), null);
  assert.equal(request.headers.get('content-type'), 'application/x-www-form-urlencoded');
  assert.deepEqual([...new URLSearchParams(await request.text()).entries()], [
    ['grant_type', 'client_credentials'], ['client_id', clientId], ['client_secret', clientSecret],
  ]);
  return Response.json({ token_type: 'Bearer', access_token: accessToken, expires_in: 900 });
}
