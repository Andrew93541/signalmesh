import type { ReactNode } from "react";

import type { Incident, IncidentState } from "@/lib/client";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-white p-5 ${className}`}>{children}</section>;
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {right}
    </header>
  );
}

const STATE_STYLE: Record<IncidentState, string> = {
  OPEN: "bg-sos-soft text-sos-text border-sos-text/30",
  ACKNOWLEDGED: "bg-warn-soft text-warn border-warn/30",
  DISPATCHED: "bg-forest-soft text-forest border-forest/30",
  RESOLVED: "bg-surface2 text-muted border-line-strong/40",
};
const STATE_LABEL: Record<IncidentState, string> = {
  OPEN: "Awaiting acknowledgement", ACKNOWLEDGED: "Acknowledged", DISPATCHED: "Team dispatched", RESOLVED: "Resolved",
};

export function StatePill({ state }: { state: IncidentState }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATE_STYLE[state]}`}>
      {STATE_LABEL[state]}
    </span>
  );
}

export function PriorityBadge({ p }: { p: Incident["priority"] }) {
  const style = p === "HIGH" ? "bg-sos text-white" : p === "MEDIUM" ? "bg-sunrise-soft text-sunrise-text" : "bg-surface2 text-muted";
  const label = p === "HIGH" ? "Critical" : p === "MEDIUM" ? "Medium" : "Low";
  return <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${style}`}>{label}</span>;
}

export const CATEGORY_LABEL = { MEDICAL: "Medical", RESCUE: "Rescue", GENERAL: "Other" } as const;

export function Path({ hops }: { hops: string[] }) {
  return (
    <span className="font-mono text-xs text-muted">
      {hops.map((h, i) => (
        <span key={i}>
          {i > 0 ? <span className="mx-1 text-line-strong">→</span> : null}
          <span className={h.startsWith("RELAY") ? "font-semibold text-sunrise-text" : ""}>{h}</span>
        </span>
      ))}
    </span>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong/50 bg-surface px-6 py-10 text-center">
      <p className="font-semibold text-ink">{title}</p>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return <div role="alert" className="rounded-xl border border-sos-text/30 bg-sos-soft px-4 py-3 text-sm text-sos-text">{message}</div>;
}

export function Stat({ label, value, tone = "plain", hint }: { label: string; value: ReactNode; tone?: "plain" | "sos" | "warn" | "ok" | "forest"; hint?: string }) {
  const tones = {
    plain: "bg-white border-line", sos: "bg-sos-soft border-sos-text/30", warn: "bg-warn-soft border-warn/30",
    ok: "bg-ok-soft border-ok/30", forest: "bg-forest-soft border-forest/30",
  };
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="mt-1 text-3xl font-extrabold tabular-nums text-ink">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function Freshness({ inc }: { inc: Pick<Incident, "location_freshness" | "location_recorded_at"> }) {
  const f = inc.location_freshness;
  const style = f === "CURRENT" ? "bg-ok-soft text-ok" : f === "LAST_KNOWN" ? "bg-warn-soft text-warn" : "bg-surface2 text-muted";
  const label = f === "CURRENT" ? "Current at SOS" : f === "LAST_KNOWN" ? "Last-known" : "No location";
  return <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-semibold ${style}`}>{label}</span>;
}

export function CopyCoords({ lat, lon }: { lat: number; lon: number }) {
  return (
    <button type="button" onClick={() => void navigator.clipboard?.writeText(`${lat.toFixed(6)}, ${lon.toFixed(6)}`)}
      className="rounded border border-line-strong px-2 py-0.5 text-xs font-semibold text-forest hover:bg-forest-soft"
      aria-label={`Copy coordinates ${lat.toFixed(6)}, ${lon.toFixed(6)}`}>Copy</button>
  );
}
