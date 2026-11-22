// Pure FEEDS helpers and types: no app imports, so Node can unit-test them
// (scripts/test-events.mts).

export type EventStatus =
  | 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'REJECTED' | 'SUSPENDED' | 'CANCELLED' | 'COMPLETED';
export type Difficulty = 'EASY' | 'MODERATE' | 'HARD' | 'EXPERT';

export interface TmEvent {
  id: string;
  title: string;
  description: string;
  category: { code: string; label: string };
  organizer: { id: string; name: string };
  start_location: string;
  destination: string;
  start_lat: number | null;
  start_lon: number | null;
  start_at: string | null;
  end_at: string | null;
  duration_minutes: number | null;
  difficulty: Difficulty | null;
  participant_limit: number | null;
  seats_taken: number;
  seats_available: number | null;
  price_minor: number;
  currency: string;
  requirements: string;
  visibility: 'PUBLIC' | 'UNLISTED';
  status: EventStatus;
  has_cover: boolean;
  published_at: string | null;
  updated_at: string;
  // Only on the organizer's own events:
  organizer_contact?: string;
  approval_mode?: 'AUTO' | 'MANUAL';
  status_reason?: string | null;
  submitted_at?: string | null;
}

export interface Category { code: string; label: string }

export interface DiscoverFilters {
  q?: string;
  category?: string | null;
  location?: string;
  date?: 'ANY' | 'WEEK' | 'MONTH';
  difficulty?: Difficulty | null;
  hasSeats?: boolean;
}

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { EASY: 'Easy', MODERATE: 'Moderate', HARD: 'Hard', EXPERT: 'Expert' };

export const STATUS_LABEL: Record<EventStatus, string> = {
  DRAFT: 'Draft', PENDING_REVIEW: 'In review', APPROVED: 'Approved', PUBLISHED: 'Published', REJECTED: 'Changes needed',
  SUSPENDED: 'Suspended', CANCELLED: 'Cancelled', COMPLETED: 'Completed',
};

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function discoverQuery(f: DiscoverFilters, now = new Date()): string {
  const p = new URLSearchParams();
  if (f.q?.trim()) p.set('q', f.q.trim());
  if (f.category) p.set('category', f.category);
  if (f.location?.trim()) p.set('location', f.location.trim());
  if (f.difficulty) p.set('difficulty', f.difficulty);
  if (f.hasSeats) p.set('has_seats', 'true');
  if (f.date && f.date !== 'ANY') {
    const end = new Date(now);
    end.setDate(end.getDate() + (f.date === 'WEEK' ? 7 : 30));
    p.set('date_from', ymd(now));
    p.set('date_to', ymd(end));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}


// ---- formatting (pure, unit-tested) -------------------------------------------------

export function formatPrice(minor: number, currency: string): string {
  if (!minor) return 'Free';
  const major = minor / 100;
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: major % 1 ? 2 : 0 }).format(major);
  } catch {
    return `${currency} ${major.toFixed(major % 1 ? 2 : 0)}`;
  }
}

export function formatDuration(minutes: number | null): string | null {
  if (!minutes || minutes <= 0) return null;
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (d) return h ? `${d} d ${h} h` : `${d} day${d > 1 ? 's' : ''}`;
  if (h) return m ? `${h} h ${m} min` : `${h} h`;
  return `${m} min`;
}

export function formatWhen(iso: string | null): string {
  if (!iso) return 'Date to be announced';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Date to be announced';
  return `${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

export function seatsText(e: Pick<TmEvent, 'participant_limit' | 'seats_available'>): string {
  if (e.participant_limit === null || e.seats_available === null) return 'Open group';
  if (e.seats_available === 0) return 'Full';
  return `${e.seats_available} of ${e.participant_limit} seats left`;
}
