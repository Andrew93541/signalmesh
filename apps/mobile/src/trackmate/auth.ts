// Account session for the TrackMate backend. The session token is kept in
// Android Keystore-backed secure storage (expo-secure-store), never in SQLite.

import * as SecureStore from 'expo-secure-store';

import { createStore } from '@/lib/store';

import { prefsStore, savePrefs } from './prefs';
import type { Relationship } from './smsText';

export const LEGAL = { TERMS_OF_SERVICE: '2026-11-21-draft', PRIVACY_POLICY: '2026-11-21-draft' } as const;

export interface Account {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  email_verified: boolean;
  phone_verified: boolean;
  emergency_contacts: { id: string; name: string; phone: string; relationship: Relationship }[];
  consents: { consent_type: string; document_version: string; accepted: boolean; recorded_at: string }[];
}

interface Session { token: string; user: Account }

const KEY = 'trackmate.session';

export const sessionStore = createStore<{ ready: boolean; session: Session | null }>({ ready: false, session: null });

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function api<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const base = prefsStore.get().backendUrl.trim().replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(base + path, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const d = body?.detail;
      const msg = typeof d === 'string' ? d
        : Array.isArray(d) ? d.map((x: { msg?: string }) => (x.msg ?? '').replace(/^Value error, /, '')).filter(Boolean).join('. ')
        : `Request failed (${res.status})`;
      throw new ApiError(msg.charAt(0).toUpperCase() + msg.slice(1), res.status);
    }
    return body as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError("Can't reach the TrackMate account server. Check your connection and try again.", 0);
  } finally {
    clearTimeout(timer);
  }
}

async function persist(session: Session | null) {
  if (session) await SecureStore.setItemAsync(KEY, JSON.stringify(session));
  else await SecureStore.deleteItemAsync(KEY);
  sessionStore.set({ ready: true, session });
}

/** On launch: restore the saved session; drop it only if the server says it is no longer valid. */
export async function restoreSession() {
  let session: Session | null = null;
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    session = raw ? JSON.parse(raw) : null;
  } catch {
    session = null;
  }
  sessionStore.set({ ready: true, session });
  if (!session) return;
  try {
    const user = await api<Account>('/v1/auth/me', {}, session.token);
    await persist({ token: session.token, user });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) await persist(null);
    // Offline: keep the saved session; the app works without the server.
  }
}

export interface Registration {
  full_name: string;
  email: string;
  phone: string;
  password: string;
  emergency_contact: { name: string; phone: string; relationship: Relationship };
}

export async function register(r: Registration) {
  const res = await api<{ user: Account; token: string }>('/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      ...r,
      consents: Object.entries(LEGAL).map(([type, version]) => ({ type, version, accepted: true })),
    }),
  });
  await persist({ token: res.token, user: res.user });
  savePrefs({ guest: false });
  return res.user;
}

export async function login(identifier: string, password: string) {
  const res = await api<{ user: Account; token: string }>('/v1/auth/login', {
    method: 'POST', body: JSON.stringify({ identifier, password }),
  });
  await persist({ token: res.token, user: res.user });
  savePrefs({ guest: false });
  return res.user;
}

export async function logout() {
  const s = sessionStore.get().session;
  if (s) await api('/v1/auth/logout', { method: 'POST' }, s.token).catch(() => {}); // sign out locally even if offline
  await persist(null);
}

export const requestReset = (identifier: string) =>
  api<{ status: string; delivery: 'dev-log' | 'not-configured' }>('/v1/auth/password/forgot', {
    method: 'POST', body: JSON.stringify({ identifier }),
  });

export const resetPassword = (identifier: string, code: string, new_password: string) =>
  api<{ status: string }>('/v1/auth/password/reset', {
    method: 'POST', body: JSON.stringify({ identifier, code, new_password }),
  });

// Registration is two screens (details → consent). The draft, including the
// password, stays in memory only and is cleared after submitting or leaving.
let draft: Registration | null = null;
export const setRegistrationDraft = (r: Registration | null) => { draft = r; };
export const getRegistrationDraft = () => draft;
