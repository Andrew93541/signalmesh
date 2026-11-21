import { type AckStatus, type CheckinPayload, type SosMessage, type SosStatus, isStatus } from './contract';
import { getSettings } from './settings';

const TIMEOUT_MS = 4000;

export class GatewayError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getSettings().gatewayUrl.trim().replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(base + path, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) throw new GatewayError(body?.detail ?? `HTTP ${res.status}`, res.status);
    return body as T;
  } catch (e) {
    if (e instanceof GatewayError) throw e;
    if (controller.signal.aborted) throw new GatewayError('Timed out');
    throw new GatewayError(e instanceof Error ? e.message : 'Network error');
  } finally {
    clearTimeout(timer);
  }
}

export const gateway = {
  health: () => request<unknown>('/health'),

  /** Returns the status the next hop reports (RELAYED from a relay, DELIVERED from the gateway). */
  async sendSos(message: SosMessage): Promise<SosStatus> {
    try {
      const body = await request<{ status?: unknown } | null>('/gateway/sos', {
        method: 'POST',
        body: JSON.stringify(message),
      });
      return isStatus(body?.status) && body.status !== 'CREATED' ? body.status : 'DELIVERED';
    } catch (e) {
      // 409 = gateway already has this message_id (an earlier retry got through).
      if (e instanceof GatewayError && e.status === 409) return 'DELIVERED';
      throw e;
    }
  },

  ackStatus: (messageId: string) =>
    request<AckStatus>(`/gateway/ack-status/${encodeURIComponent(messageId)}`),

  checkin: (payload: CheckinPayload) =>
    request<unknown>('/gateway/checkin', { method: 'POST', body: JSON.stringify(payload) }),

  heartbeat: (body: { node_id: string; role: 'relay'; label: string; queue_size: number }) =>
    request<unknown>('/gateway/nodes/heartbeat', { method: 'POST', body: JSON.stringify(body) }),
};
