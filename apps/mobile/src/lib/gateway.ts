import { type AckStatus, type CheckinPayload, type SosMessage, type SosStatus, isStatus } from './contract';
import { getSettings } from './settings';

const TIMEOUT_MS = 4000;

export interface PeerAckBody {
  message_id: string; recipient_device_id: string; recipient_name: string | null; recipient_user_id: string | null; acknowledged_at: string;
}

export class GatewayError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit, baseUrl?: string): Promise<T> {
  const base = (baseUrl ?? getSettings().gatewayUrl).trim().replace(/\/+$/, '');
  if (!base) throw new GatewayError('No address set up');
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

/** Client for one gateway or relay address. `gateway` (below) is the local next hop. */
export function gatewayAt(baseUrl?: string) {
  const req = <T,>(path: string, init?: RequestInit) => request<T>(path, init, baseUrl);
  return {
  health: () => req<unknown>('/health'),

  /** Returns the status the next hop reports (RELAYED from a relay, DELIVERED from the gateway). */
  async sendSos(message: SosMessage): Promise<SosStatus> {
    try {
      const body = await req<{ status?: unknown } | null>('/gateway/sos', {
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
    req<AckStatus>(`/gateway/ack-status/${encodeURIComponent(messageId)}`),

  /** A nearby person acknowledged an SOS on their phone (not a responder acknowledgement). */
  peerAck: (a: PeerAckBody) =>
    req<{ status: string; duplicate: boolean }>('/gateway/peer-ack', { method: 'POST', body: JSON.stringify(a) }),

  checkin: (payload: CheckinPayload) =>
    req<unknown>('/gateway/checkin', { method: 'POST', body: JSON.stringify(payload) }),

  heartbeat: (body: { node_id: string; role: 'relay'; label: string; queue_size: number }) =>
    req<unknown>('/gateway/nodes/heartbeat', { method: 'POST', body: JSON.stringify(body) }),
  };
}

export const gateway = gatewayAt();
