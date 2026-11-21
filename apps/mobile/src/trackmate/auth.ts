// Account session for the TrackMate backend. The session token is kept in
// Android Keystore-backed secure storage (expo-secure-store), never in SQLite.

import * as SecureStore from 'expo-secure-store';

import { createStore } from '@/lib/store';

import { prefsStore, savePrefs } from './prefs';
import type { Relationship } from './smsText';

export const LEGAL = { TERMS_OF_SERVICE: '2026-11-21-draft', PRIVACY_POLICY: '2026-11-21-draft' } as const;

export type Experience = 'NONE' | 'BEGINNER' | 'INTERMEDIATE' | 'EXPERIENCED' | 'EXPERT';
export const EXPERIENCE_LABEL: Record<Experience, string> = {
  NONE: 'New to trekking', BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', EXPERIENCED: 'Experienced', EXPERT: 'Expert / guide',
};
export interface EmergencyContact { id: string; name: string; phone: string; relationship: Relationship }

export interface Account {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  email_verified: boolean;
  phone_verified: boolean;
  role?: string;
  travel_preferences?: string | null;
  trekking_experience?: Experience | null;
  intro?: string | null;
  has_photo?: boolean;
  updated_at?: string | null;
  emergency_contacts: EmergencyContact[];
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

export const backendBase = () => prefsStore.get().backendUrl.trim().replace(/\/+$/, '');

async function api<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const base = backendBase();
  if (!base) throw new ApiError('No account server is set up. Add its address under "Account server settings".', 0);
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

// ---- Profile editing (signed-in only). Every call returns the server's copy of
// the account, which replaces the local one: the screen never shows a local guess.

async function authed(path: string, init: RequestInit = {}): Promise<Account> {
  const s = sessionStore.get().session;
  if (!s) throw new ApiError('Sign in first.', 401);
  try {
    const user = await api<Account>(path, init, s.token);
    await persist({ token: s.token, user });
    return user;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) await persist(null);
    throw e;
  }
}

export type ProfileChanges = Partial<Pick<Account, 'full_name' | 'travel_preferences' | 'trekking_experience' | 'intro'>>;
export const updateProfile = (changes: ProfileChanges) =>
  authed('/v1/users/me', { method: 'PATCH', body: JSON.stringify(changes) });

/** Uploads raw image bytes; the server checks type, signature and the 2 MB limit. */
export const uploadPhoto = (base64: string, mimeType: string) => {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return authed('/v1/users/me/photo', { method: 'PUT', body: bytes.buffer, headers: { 'Content-Type': mimeType } });
};
export const deletePhoto = () => authed('/v1/users/me/photo', { method: 'DELETE' });
/** Image source for the signed-in user's photo (auth header; never a public URL). */
export function photoSource(user: Account | undefined) {
  const s = sessionStore.get().session;
  if (!user?.has_photo || !s) return null;
  return { uri: `${backendBase()}/v1/users/me/photo?v=${encodeURIComponent(user.updated_at ?? '')}`, headers: { Authorization: `Bearer ${s.token}` } };
}

type ContactBody = Omit<EmergencyContact, 'id'>;
export const addEmergencyContact = (c: ContactBody) =>
  authed('/v1/users/me/emergency-contacts', { method: 'POST', body: JSON.stringify(c) });
export const editEmergencyContact = (id: string, c: ContactBody) =>
  authed(`/v1/users/me/emergency-contacts/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(c) });
export const deleteEmergencyContact = (id: string) =>
  authed(`/v1/users/me/emergency-contacts/${encodeURIComponent(id)}`, { method: 'DELETE' });

export type ChangeKind = 'email' | 'phone';
export function startContactChange(kind: ChangeKind, value: string, current_password: string) {
  const s = sessionStore.get().session;
  if (!s) return Promise.reject(new ApiError('Sign in first.', 401));
  return api<{ status: string; expires_in_minutes: number; delivery: 'dev-log' | 'not-configured' }>(
    `/v1/users/me/${kind}-change`, { method: 'POST', body: JSON.stringify({ value, current_password }) }, s.token);
}
export const confirmContactChange = (kind: ChangeKind, code: string) =>
  authed(`/v1/users/me/${kind}-change/confirm`, { method: 'POST', body: JSON.stringify({ code }) });

export function changePassword(current_password: string, new_password: string) {
  const s = sessionStore.get().session;
  if (!s) return Promise.reject(new ApiError('Sign in first.', 401));
  return api<{ status: string }>('/v1/users/me/password', { method: 'POST', body: JSON.stringify({ current_password, new_password }) }, s.token);
}
