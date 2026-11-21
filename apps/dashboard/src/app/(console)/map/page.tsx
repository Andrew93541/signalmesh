"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

import { Card, ErrorBox, PageHeader, StatePill } from "@/components/ui";
import { fmtTime, type Incident, useLive } from "@/lib/client";

const IncidentMap = dynamic(() => import("@/components/IncidentMap"), { ssr: false, loading: () => <p className="text-sm text-muted">Loading map…</p> });

export default function MapPage() {
  const { data, error } = useLive<Incident[]>("incidents?state=OPEN,ACKNOWLEDGED,DISPATCHED&limit=500");
  const incidents = data ?? [];
  const located = incidents.filter((i) => i.latitude !== null);
  const missing = incidents.filter((i) => i.latitude === null);

  return (
    <>
      <PageHeader title="Emergency Map" subtitle="Active incidents with the location sent in the SOS. Only real coordinates are plotted." />
      {error ? <ErrorBox message={error} /> : null}
      <div className="mb-4 flex flex-wrap gap-4 text-sm">
        {[["#D92D36", "Awaiting acknowledgement"], ["#F47B0B", "Acknowledged"], ["#075C3B", "Dispatched"]].map(([c, l]) => (
          <span key={l} className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full" style={{ background: c }} />{l}</span>
        ))}
        <span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full border-2 border-dashed border-line-strong" />Faded, dashed = last-known location, not live</span>
      </div>
      <IncidentMap incidents={incidents} />
      <p className="mt-2 text-xs text-muted">Map tiles © OpenStreetMap contributors; they need internet. Coordinates are listed below for offline use.</p>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-bold">With location ({located.length})</h2>
          <ul className="space-y-2 text-sm">
            {located.map((i) => (
              <li key={i.message_id} className="flex flex-wrap items-center gap-2">
                <Link href={`/incidents/${i.message_id}`} className="font-semibold text-forest underline">{i.worker_name}</Link>
                <span className="font-mono text-xs">{i.latitude!.toFixed(5)}, {i.longitude!.toFixed(5)}</span>
                <span className="text-muted">{fmtTime(i.location_recorded_at ?? i.created_at)}{i.location_accuracy_m !== null ? ` · ±${Math.round(i.location_accuracy_m)} m` : ""}{i.location_freshness !== "CURRENT" ? " · last-known" : ""}</span>
                <StatePill state={i.incident_state} />
              </li>
            ))}
            {located.length === 0 ? <li className="text-muted">No active incident has a location.</li> : null}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-3 font-bold">No location ({missing.length})</h2>
          <p className="mb-2 text-xs text-muted">These phones had no GPS fix. They are not placed on the map.</p>
          <ul className="space-y-2 text-sm">
            {missing.map((i) => (
              <li key={i.message_id}><Link href={`/incidents/${i.message_id}`} className="font-semibold text-forest underline">{i.worker_name}</Link> · {i.device_id}</li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
