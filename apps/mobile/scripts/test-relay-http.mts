import assert from 'node:assert/strict';
import { RequestParser, httpResponse } from '../src/lib/relay-http.ts';
const body = JSON.stringify({ message_id: 'SM-abc-123456', description: 'Café – leg hurt ✓' });
const len = Buffer.byteLength(body);
const raw = `POST /gateway/sos?x=1 HTTP/1.1\r\nHost: a\r\nContent-Type: application/json\r\nContent-Length: ${len}\r\n\r\n${body}`;
// whole
let r = new RequestParser().push(raw);
assert.equal(r.method, 'POST'); assert.equal(r.path, '/gateway/sos'); assert.equal(JSON.parse(r.body).description, 'Café – leg hurt ✓');
// byte-by-byte chunks, split inside multibyte chars
const bytes = Buffer.from(raw, 'utf8'); const p = new RequestParser(); let out = null;
for (let i = 0; i < bytes.length; i += 7) { out = p.push(bytes.subarray(i, i + 7)); if (i + 7 < bytes.length) assert.equal(out, null); }
assert.equal(JSON.parse(out.body).message_id, 'SM-abc-123456');
// GET without body
assert.equal(new RequestParser().push('GET /health HTTP/1.1\r\nHost: x\r\n\r\n').path, '/health');
// too large, malformed
assert.equal(new RequestParser().push('POST / HTTP/1.1\r\n' + 'x'.repeat(70000)), 'too_large');
assert.equal(new RequestParser().push('\r\n\r\n'), 'bad');
// response
const res = httpResponse(201, { status: 'RELAYED', note: 'é' }).toString('utf8');
assert.match(res, /^HTTP\/1.1 201 Created\r\n/); assert.match(res, new RegExp('Content-Length: ' + Buffer.byteLength(JSON.stringify({ status: 'RELAYED', note: 'é' })) + '\r\n')); assert.ok(res.endsWith('"note":"é"}'));
console.log('relay-http: all checks passed');
