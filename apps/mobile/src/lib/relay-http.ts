// Minimal HTTP/1.1 over a raw TCP socket, enough for the relay's JSON API.
// Kept free of React Native imports so it can be tested with plain Node.

import { Buffer } from 'buffer';

export interface HttpRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string;
}

export const MAX_REQUEST_BYTES = 64 * 1024;

const REASONS: Record<number, string> = {
  200: 'OK', 201: 'Created', 400: 'Bad Request', 404: 'Not Found', 413: 'Payload Too Large', 422: 'Unprocessable Entity', 500: 'Internal Server Error',
};

/** Feed it socket chunks; returns the request once headers and body are complete. */
export class RequestParser {
  private buf: Buffer = Buffer.alloc(0);

  push(chunk: Uint8Array | string): HttpRequest | 'too_large' | 'bad' | null {
    this.buf = Buffer.concat([this.buf, typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : Buffer.from(chunk)]);
    if (this.buf.length > MAX_REQUEST_BYTES) return 'too_large';

    const headerEnd = this.buf.indexOf('\r\n\r\n');
    if (headerEnd < 0) return null;

    const [requestLine, ...lines] = this.buf.toString('latin1', 0, headerEnd).split('\r\n');
    const [method, target] = requestLine.split(' ');
    if (!method || !target) return 'bad';

    const headers: Record<string, string> = {};
    for (const line of lines) {
      const i = line.indexOf(':');
      if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
    const length = parseInt(headers['content-length'] ?? '0', 10) || 0;
    const bodyStart = headerEnd + 4;
    if (this.buf.length < bodyStart + length) return null;

    return {
      method: method.toUpperCase(),
      path: target.split('?')[0],
      headers,
      body: this.buf.toString('utf8', bodyStart, bodyStart + length),
    };
  }
}

export function httpResponse(status: number, body: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(body), 'utf8');
  const head =
    `HTTP/1.1 ${status} ${REASONS[status] ?? 'OK'}\r\n` +
    'Content-Type: application/json\r\n' +
    `Content-Length: ${json.length}\r\n` +
    'Access-Control-Allow-Origin: *\r\n' +
    'Connection: close\r\n\r\n';
  return Buffer.concat([Buffer.from(head, 'latin1'), json]);
}
