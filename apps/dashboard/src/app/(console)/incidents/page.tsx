"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { CATEGORY_LABEL, Card, CopyCoords, Empty, ErrorBox, Freshness, PageHeader, Path, PriorityBadge, StatePill } from "@/components/ui";
import { fmtTime, type Incident, useLive } from "@/lib/client";

const SELECT = "rounded-lg border border-line-strong bg-white px-3 py-2 text-sm";
const WINDOWS = { all: "Any time", "1h": "Last hour", "24h": "Last 24 hours", "7d": "Last 7 days" } as const;
const WINDOW_MS = { "1h": 3600e3, "24h": 86400e3, "7d": 7 * 86400e3 } as const;

export default function Incidents() {
  const [state, setState] = useState("");
  const [priority, setPriority] = useState("");
  const [category, setCategory] = useState("");
  const [windowKey, setWindowKey] = useState<keyof typeof WINDOWS>("all");
  const [since, setSince] = useState<string | null>(null); // fixed when the filter is chosen

  function chooseWindow(k: keyof typeof WINDOWS) {
    setWindowKey(k);
    setSince(k === "all" ? null : new Date(Date.now() - WINDOW_MS[k]).toISOString());
  }
  const [location, setLocation] = useState("");

  const query = useMemo(() => {
    const q = new URLSearchParams({ limit: "500" });
    if (state) q.set("state", state);
    if (priority) q.set("priority", priority);
    if (category) q.set("category", category);
    if (location) q.set("has_location", location);
    if (since) q.set("since", since);
    return `incidents?${q}`;
  }, [state, priority, category, location, since]);

  const { data, error, loading } = useLive<Incident[]>(query);

  return (
    <>
      <PageHeader title="Live SOS" subtitle="Every incident delivered by a SignalMesh gateway. Newest first; resolved last." />
      <Card className="mb-4">
        <div className="flex flex-wrap gap-3" role="group" aria-label="Filters">
          <select aria-label="Status" className={SELECT} value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">All statuses</option>
            <option value="OPEN">Awaiting acknowledgement</option>
            <option value="ACKNOWLEDGED">Acknowledged</option>
            <option value="DISPATCHED">Dispatched</option>
            <option value="RESOLVED">Resolved</option>
            <option value="OPEN,ACKNOWLEDGED,DISPATCHED">All active</option>
          </select>
          <select aria-label="Priority" className={SELECT} value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">All priorities</option><option value="HIGH">Critical</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option>
          </select>
          <select aria-label="Category" className={SELECT} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option><option value="MEDICAL">Medical</option><option value="RESCUE">Rescue</option><option value="GENERAL">Other</option>
          </select>
          <select aria-label="Time" className={SELECT} value={windowKey} onChange={(e) => chooseWindow(e.target.value as keyof typeof WINDOWS)}>
            {Object.entries(WINDOWS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select aria-label="Location" className={SELECT} value={location} onChange={(e) => setLocation(e.target.value)}>
            <option value="">With or without location</option><option value="true">Has location</option><option value="false">No location</option>
          </select>
        </div>
      </Card>
      {error ? <ErrorBox message={error} /> : null}
      {!loading && data?.length === 0 ? <Empty title="No incidents match" body="Try widening the filters." /> : null}
      {data && data.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
              <tr>
                {["Incident", "Person / device", "Type", "Priority", "Created", "Location", "Accuracy", "Location time", "Delivery", "Status", "Path"].map((h) => (
                  <th key={h} scope="col" className="px-3 py-3 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.map((i) => (
                <tr key={i.message_id} className="hover:bg-surface">
                  <td className="px-3 py-3 font-mono text-xs">
                    <Link href={`/incidents/${i.message_id}`} className="font-semibold text-forest underline">{i.message_id.slice(0, 15)}…</Link>
                  </td>
                  <td className="px-3 py-3"><div className="font-semibold">{i.worker_name}</div><div className="font-mono text-xs text-muted">{i.device_id}</div></td>
                  <td className="px-3 py-3">{CATEGORY_LABEL[i.category]}</td>
                  <td className="px-3 py-3"><PriorityBadge p={i.priority} /></td>
                  <td className="px-3 py-3 whitespace-nowrap">{fmtTime(i.created_at)}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {i.latitude !== null && i.longitude !== null ? (
                        <><span className="font-mono text-xs">{i.latitude.toFixed(5)}, {i.longitude.toFixed(5)}</span><CopyCoords lat={i.latitude} lon={i.longitude} /></>
                      ) : null}
                      <Freshness inc={i} />
                    </div>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">{i.location_accuracy_m !== null ? `±${Math.round(i.location_accuracy_m)} m` : <span className="text-muted">—</span>}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{i.location_recorded_at ? fmtTime(i.location_recorded_at) : <span className="text-muted">—</span>}</td>
                  <td className="px-3 py-3"><span className="rounded bg-ok-soft px-2 py-0.5 text-xs font-semibold text-ok">Delivered</span></td>
                  <td className="px-3 py-3"><StatePill state={i.incident_state} /></td>
                  <td className="px-3 py-3"><Path hops={i.hops} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
