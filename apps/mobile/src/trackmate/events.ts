// FEEDS: events from the TrackMate backend. No local or sample data: every list
// comes from the server, and an empty server means an empty list.

import { ApiError, api, backendBase, sessionStore } from './auth';
import { discoverQuery, type Category, type DiscoverFilters, type TmEvent } from './eventFormat';

export * from './eventFormat';

const token = () => sessionStore.get().session?.token;
export const listEvents = (f: DiscoverFilters) => api<TmEvent[]>(`/v1/events${discoverQuery(f)}`, {}, token());
export const listCategories = () => api<Category[]>('/v1/event-categories');
export function listMyEvents() {
  const t = token();
  if (!t) return Promise.reject(new ApiError('Sign in to see your events.', 401));
  return api<TmEvent[]>('/v1/events/mine', {}, t);
}
export const getEvent = (id: string) => api<TmEvent>(`/v1/events/${encodeURIComponent(id)}`, {}, token());

export function coverSource(e: Pick<TmEvent, 'id' | 'has_cover' | 'updated_at'>) {
  if (!e.has_cover) return null;
  const t = token();
  return {
    uri: `${backendBase()}/v1/events/${encodeURIComponent(e.id)}/cover?v=${encodeURIComponent(e.updated_at)}`,
    ...(t ? { headers: { Authorization: `Bearer ${t}` } } : {}),
  };
}

