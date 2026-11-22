// Community feed client. Everything comes from the TrackMate backend; media is
// uploaded straight from the file on disk (streamed natively, not loaded into JS).

import { FileSystemUploadType, createUploadTask, getInfoAsync, type UploadTask } from 'expo-file-system/legacy';

import { ApiError, api, backendBase, sessionStore } from './auth';

export interface PublicUser { id: string; name: string; username: string | null; has_photo: boolean }
export interface Media { id: string; kind: 'IMAGE' | 'VIDEO'; mime: string }
export interface Post {
  id: string;
  author: PublicUser;
  caption: string;
  location_name: string | null;
  latitude: number | null; // only when the author chose to share exact coordinates
  longitude: number | null;
  media: Media[];
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  is_mine: boolean;
  created_at: string;
  updated_at: string;
}
export interface Comment { id: string; author: PublicUser; body: string; created_at: string; can_delete: boolean }
export interface Profile extends PublicUser {
  bio: string | null;
  interests: string[];
  home_location: string | null;
  posts_count: number;
  followers_count: number;
  following_count: number;
  is_me: boolean;
  is_following: boolean;
  follows_me: boolean;
}
export interface Page<T> { items: T[]; next_before: string | null }
export type ReportReason = 'SPAM' | 'HARASSMENT' | 'INAPPROPRIATE' | 'DANGEROUS' | 'FALSE_INFORMATION' | 'OTHER';

function token() {
  const t = sessionStore.get().session?.token;
  if (!t) throw new ApiError('Sign in to use the community feed.', 401);
  return t;
}
const call = <T,>(path: string, init: RequestInit = {}) => api<T>(path, init, token());
const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });
const q = (before?: string | null) => (before ? `before=${encodeURIComponent(before)}` : '');

export const getFeed = (scope: 'discover' | 'following', before?: string | null) =>
  call<Page<Post>>(`/v1/feed?scope=${scope}${before ? `&${q(before)}` : ''}`);
export const getPost = (id: string) => call<Post>(`/v1/posts/${encodeURIComponent(id)}`);
export const editPost = (id: string, ch: { caption?: string; location_name?: string | null; share_location?: false }) =>
  call<Post>(`/v1/posts/${encodeURIComponent(id)}`, json('PATCH', ch));
export const deletePost = (id: string) => call(`/v1/posts/${encodeURIComponent(id)}`, json('DELETE'));
export const setLike = (id: string, liked: boolean) => call<Post>(`/v1/posts/${encodeURIComponent(id)}/like`, json(liked ? 'POST' : 'DELETE'));
export const getComments = (id: string) => call<Comment[]>(`/v1/posts/${encodeURIComponent(id)}/comments`);
export const addComment = (id: string, body: string) => call<Comment>(`/v1/posts/${encodeURIComponent(id)}/comments`, json('POST', { body }));
export const deleteComment = (id: string) => call(`/v1/comments/${encodeURIComponent(id)}`, json('DELETE'));
export const getProfile = (userId: string) => call<Profile>(`/v1/users/${encodeURIComponent(userId)}/profile`);
export const getUserPosts = (userId: string, before?: string | null) =>
  call<Page<Post>>(`/v1/users/${encodeURIComponent(userId)}/posts${before ? `?${q(before)}` : ''}`);
export const getPeople = (userId: string, kind: 'followers' | 'following', before?: string | null) =>
  call<Page<PublicUser & { is_following: boolean; followed_at: string }>>(`/v1/users/${encodeURIComponent(userId)}/${kind}${before ? `?${q(before)}` : ''}`);
export const setFollow = (userId: string, on: boolean) => call(`/v1/users/${encodeURIComponent(userId)}/follow`, json(on ? 'POST' : 'DELETE'));
export const setBlock = (userId: string, on: boolean) => call(`/v1/users/${encodeURIComponent(userId)}/block`, json(on ? 'POST' : 'DELETE'));
export const getBlocked = () => call<PublicUser[]>('/v1/users/me/blocks');
export const report = (target_type: 'POST' | 'COMMENT' | 'USER' | 'EVENT', target_id: string, reason: ReportReason) =>
  call('/v1/reports', json('POST', { target_type, target_id, reason }));

export interface NewPost {
  caption: string;
  location_name: string | null;
  share_location: boolean;
  latitude?: number | null;
  longitude?: number | null;
  media: { uri: string; mime: string }[];
}

const LIMIT = { image: 10 * 1024 * 1024, video: 60 * 1024 * 1024 };
const STALL_MS = 60_000;
let current: UploadTask | null = null;
let cancelled = false;

/** Stops an upload in progress (the "Cancel" button). */
export function cancelUpload() {
  cancelled = true;
  void current?.cancelAsync();
}

/**
 * Uploads each file (streamed by the OS from disk; the server re-checks type, size and
 * signature), then creates the post. Too-large files are refused before sending, and an
 * upload that moves no bytes for 60 s is stopped instead of spinning forever.
 */
export async function createPost(p: NewPost, onProgress?: (done: number, total: number, fraction: number) => void): Promise<Post> {
  const t = token();
  cancelled = false;
  for (const m of p.media) {
    const info = await getInfoAsync(m.uri).catch(() => null);
    const size = info && info.exists ? info.size : 0;
    const video = m.mime.startsWith('video/');
    const limit = video ? LIMIT.video : LIMIT.image;
    if (size > limit) {
      throw new ApiError(`This ${video ? 'video' : 'photo'} is ${(size / 1048576).toFixed(0)} MB; the limit is ${limit / 1048576} MB.${video ? ' Pick a shorter clip.' : ''}`, 413);
    }
  }
  const ids: string[] = [];
  for (const [i, m] of p.media.entries()) {
    onProgress?.(i, p.media.length, 0);
    let lastMove = Date.now();
    let sent = -1;
    const task = createUploadTask(`${backendBase()}/v1/media`, m.uri,
      { httpMethod: 'POST', uploadType: FileSystemUploadType.BINARY_CONTENT, headers: { Authorization: `Bearer ${t}`, 'Content-Type': m.mime } },
      (ev) => {
        if (ev.totalBytesSent !== sent) { sent = ev.totalBytesSent; lastMove = Date.now(); }
        onProgress?.(i, p.media.length, ev.totalBytesExpectedToSend > 0 ? ev.totalBytesSent / ev.totalBytesExpectedToSend : 0);
      });
    current = task;
    let stalled = false;
    const watchdog = setInterval(() => {
      if (Date.now() - lastMove > STALL_MS) { stalled = true; void task.cancelAsync(); }
    }, 5_000);
    let res;
    try {
      res = await task.uploadAsync();
    } catch {
      res = null;
    } finally {
      clearInterval(watchdog);
      current = null;
    }
    if (cancelled) throw new ApiError('Upload cancelled.', 0);
    if (!res) throw new ApiError(stalled ? 'The upload stopped moving. Check your connection and try again.' : "Couldn't upload. Check your connection and try again.", 0);
    const body = (() => { try { return JSON.parse(res.body); } catch { return null; } })();
    if (res.status >= 300) throw new ApiError(typeof body?.detail === 'string' ? body.detail : `Upload failed (${res.status})`, res.status);
    ids.push(body.id);
  }
  onProgress?.(p.media.length, p.media.length, 1);
  return call<Post>('/v1/posts', json('POST', {
    caption: p.caption, location_name: p.location_name, share_location: p.share_location,
    latitude: p.share_location ? p.latitude : null, longitude: p.share_location ? p.longitude : null, media_ids: ids,
  }));
}

/** Image/video source with the session header (media is never public by URL). */
export function mediaSource(id: string) {
  const t = sessionStore.get().session?.token;
  return { uri: `${backendBase()}/v1/media/${encodeURIComponent(id)}`, headers: t ? { Authorization: `Bearer ${t}` } : undefined };
}
export function userPhotoSource(u: Pick<PublicUser, 'id' | 'has_photo'>) {
  const s = sessionStore.get().session;
  if (!u.has_photo || !s) return null;
  const path = u.id === s.user.id ? '/v1/users/me/photo' : `/v1/users/${encodeURIComponent(u.id)}/photo`;
  return { uri: `${backendBase()}${path}?v=${encodeURIComponent(s.user.updated_at ?? '')}`, headers: { Authorization: `Bearer ${s.token}` } };
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---- direct messages (people who follow you, or you follow each other) -----------------

export interface Conversation {
  id: string;
  other: PublicUser;
  last_message: { sender_id: string; body: string; created_at: string } | null;
  unread: number;
  blocked: boolean;
  updated_at: string;
}
export interface Message { id: string; body: string; created_at: string; mine: boolean; read_at: string | null }

export const getInbox = () => call<Conversation[]>('/v1/conversations');
export const getUnread = () => call<{ unread: number }>('/v1/conversations/unread-count');
export const openConversation = (userId: string) => call<Conversation>('/v1/conversations', json('POST', { user_id: userId }));
export const getMessages = (id: string, before?: string | null) =>
  call<Page<Message>>(`/v1/conversations/${encodeURIComponent(id)}/messages${before ? `?${q(before)}` : ''}`);
export const sendMessage = (id: string, body: string) => call<Message>(`/v1/conversations/${encodeURIComponent(id)}/messages`, json('POST', { body }));
export const markRead = (id: string) => call(`/v1/conversations/${encodeURIComponent(id)}/read`, json('POST'));
