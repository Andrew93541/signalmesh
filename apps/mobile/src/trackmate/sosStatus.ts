// Plain-language SOS status (DESIGN_SYSTEM.md § 7). Pure: no React Native imports,
// tested with plain Node (scripts/test-sos-status.mts).
//
// Truthfulness rules:
// - "Reached the safety network" only for DELIVERED or later (a gateway stored it).
// - "Acknowledged" only when a named responder acknowledged it.
// - Never "help is on the way".

export type LocalStatus = 'QUEUED' | 'CREATED' | 'RELAYED' | 'DELIVERED' | 'ACKNOWLEDGED' | 'RESOLVED';
export type Tone = 'warning' | 'info' | 'success' | 'neutral';

export interface StatusView {
  tone: Tone;
  icon: 'schedule' | 'cell_tower' | 'check_circle' | 'health_and_safety' | 'flag';
  pill: string;
  title: string;
  body: string;
}

const RANK: Record<LocalStatus, number> = { QUEUED: 0, CREATED: 0, RELAYED: 1, DELIVERED: 2, ACKNOWLEDGED: 3, RESOLVED: 4 };

export function describeStatus(
  status: LocalStatus,
  opts: { attempts?: number; acknowledgedBy?: string | null } = {},
): StatusView {
  switch (status) {
    case 'QUEUED':
    case 'CREATED':
      return {
        tone: 'warning', icon: 'schedule', pill: 'Saved on phone',
        title: 'Saved on your phone',
        body: (opts.attempts ?? 0) > 0
          ? "No connection yet. We'll keep trying to send it automatically."
          : 'Sending now…',
      };
    case 'RELAYED':
      return {
        tone: 'warning', icon: 'cell_tower', pill: 'Passed on',
        title: 'Passed to a nearby device',
        body: "It hasn't reached the safety network yet. The nearby device will keep trying.",
      };
    case 'DELIVERED':
      return {
        tone: 'info', icon: 'check_circle', pill: 'Reached',
        title: 'Your message reached the safety network',
        body: 'Waiting for a responder to acknowledge it.',
      };
    case 'ACKNOWLEDGED':
      return {
        tone: 'success', icon: 'health_and_safety', pill: 'Acknowledged',
        title: 'A responder has acknowledged your request',
        body: opts.acknowledgedBy ? `Acknowledged by ${opts.acknowledgedBy}.` : 'A responder has seen your request.',
      };
    case 'RESOLVED':
      return {
        tone: 'neutral', icon: 'flag', pill: 'Closed',
        title: 'This request was marked resolved',
        body: opts.acknowledgedBy ? `Closed by ${opts.acknowledgedBy}.` : 'A responder closed this request.',
      };
  }
}

export interface Step {
  label: string;
  done: boolean;
  detail?: string;
}

/** Milestones the phone can actually know about. */
export function statusSteps(s: {
  status: LocalStatus;
  createdAt: string;
  sentAt: string | null;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
}, formatTime: (iso: string) => string): Step[] {
  const r = RANK[s.status];
  return [
    { label: 'Saved on your phone', done: true, detail: formatTime(s.createdAt) },
    { label: 'Left your phone', done: r >= 1, detail: s.sentAt ? formatTime(s.sentAt) : 'Waiting for a connection' },
    { label: 'Reached the safety network', done: r >= 2 },
    {
      label: 'Acknowledged by a responder',
      done: r >= 3,
      detail: r >= 3 ? [s.acknowledgedBy, s.acknowledgedAt && formatTime(s.acknowledgedAt)].filter(Boolean).join(' · ') : undefined,
    },
  ];
}

/** An SOS still in progress (shown prominently on the Safety screen). */
export function isOpen(status: LocalStatus) {
  return status !== 'RESOLVED';
}
