"use client";

import { useCallback, useEffect, useState } from "react";

export type IncidentState = "OPEN" | "ACKNOWLEDGED" | "DISPATCHED" | "RESOLVED";

export interface Incident {
  message_id: string;
  gateway_id: string;
  device_id: string;
  worker_name: string;
  category: "MEDICAL" | "RESCUE" | "GENERAL";
  priority: "HIGH" | "MEDIUM" | "LOW";
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  received_at: string;
  hops: string[];
  hop_count: number;
  incident_state: IncidentState;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  dispatched_by: string | null;
  dispatched_at: string | null;
  dispatch_team: string | null;
  dispatch_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  events?: { id: number; kind: string; actor: string | null; detail: Record<string, unknown> | null; at: string }[];
}

export interface Summary {
  incidents: { total: number; active: number; critical: number; awaiting_ack: number; acknowledged: number; dispatched: number; resolved: number };
  gateways: { known: number; online: number };
  relays: { known: number; online: number };
  upstream_pending: number;
  time: string;
}

export interface GatewayView {
  id: string;
  created_at: string;
  last_seen: string | null;
  online: boolean;
  status: {
    node_id: string;
    database?: string;
    messages?: Record<string, number>;
    upstream_pending?: number;
    nodes?: { node_id: string; role: string; label: string | null; queue_size: number; address: string | null; last_seen: string; online: boolean }[];
    checkins?: { device_id: string; worker_name: string; checked_in_at: string; due_at: string; overdue: boolean }[];
  } | null;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** Calls the backend's responder API through this dashboard's server (cookie auth). */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/backend/${path.replace(/^\//, "")}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (res.status === 401) {
    // Session expired or revoked: full reload so no stale incident data stays in memory.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  }
  if (!res.ok) {
    const d = body?.detail;
    const msg = typeof d === "string" ? d : Array.isArray(d) ? d.map((x: { msg?: string }) => x.msg).join(". ") : `Request failed (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  return body as T;
}

// ---- live updates: WebSocket with polling fallback -----------------------------------

type Listener = () => void;
const listeners = new Set<Listener>();
let socket: WebSocket | null = null;
let connecting = false;
let retry = 0;
let liveState: "live" | "polling" = "polling";
const stateListeners = new Set<(s: "live" | "polling") => void>();

function setLive(s: "live" | "polling") {
  liveState = s;
  stateListeners.forEach((f) => f(s));
}

async function connect() {
  if (socket || connecting || typeof window === "undefined") return;
  connecting = true;
  try {
    const { ticket } = await api<{ ticket: string }>("ws-ticket", { method: "POST" });
    const base = process.env.NEXT_PUBLIC_BACKEND_WS_URL ?? "ws://127.0.0.1:8100";
    const ws = new WebSocket(`${base}/v1/admin/ws?ticket=${encodeURIComponent(ticket)}`);
    socket = ws;
    ws.onopen = () => { retry = 0; setLive("live"); };
    ws.onmessage = () => listeners.forEach((f) => f());
    ws.onclose = () => {
      socket = null;
      setLive("polling");
      const delay = Math.min(30_000, 1000 * 2 ** retry++); // reconnect with backoff
      setTimeout(() => { if (listeners.size) void connect(); }, delay);
    };
  } catch {
    setLive("polling");
    setTimeout(() => { if (listeners.size) void connect(); }, Math.min(30_000, 1000 * 2 ** retry++));
  } finally {
    connecting = false;
  }
}

export function useLiveState() {
  const [s, setS] = useState(liveState);
  useEffect(() => {
    stateListeners.add(setS);
    return () => { stateListeners.delete(setS); };
  }, []);
  return s;
}

/**
 * Fetch `path` now, refetch on every live event, and poll every `pollMs`
 * as a fallback (and as the only source while the socket is down).
 */
export function useLive<T>(path: string | null, pollMs = 10_000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!path) return;
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load data.");
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    if (!path) return;
    const first = setTimeout(reload, 0); // first load right after mount
    listeners.add(reload);
    void connect();
    const t = setInterval(reload, pollMs);
    return () => { listeners.delete(reload); clearInterval(t); clearTimeout(first); };
  }, [path, pollMs, reload]);

  return { data, error, loading, reload };
}

// ---- formatting -----------------------------------------------------------------------

export function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function ago(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

/** Location older than this is shown as stale. */
export const STALE_LOCATION_MS = 15 * 60 * 1000;
export const isStale = (iso: string) => Date.now() - new Date(iso).getTime() > STALE_LOCATION_MS;
