"use client";

import Link from "next/link";
import { use, useState } from "react";

import { CATEGORY_LABEL, Card, CopyCoords, ErrorBox, Freshness, PageHeader, Path, PriorityBadge, StatePill } from "@/components/ui";
import { ago, api, fmtTime, type Incident, useLive } from "@/lib/client";

const EVENT_LABEL: Record<string, string> = {
  RECEIVED: "Received by backend from gateway",
  DUPLICATE: "Duplicate delivery ignored",
  ACKNOWLEDGED: "Acknowledged",
  DISPATCHED: "Team dispatched",
  RESOLVED: "Resolved",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

function Actions({ inc, onDone }: { inc: Incident; onDone: () => void }) {
  const [team, setTeam] = useState("");
  const [note, setNote] = useState("");
  const [resolveNote, setResolveNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(kind: "acknowledge" | "dispatch" | "resolve", body?: object) {
    setBusy(kind);
    setError(null);
    try {
      await api(`incidents/${inc.message_id}/${kind}`, { method: "POST", body: body ? JSON.stringify(body) : undefined });
      onDone(); // show the server's state, never a local guess
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  }

  if (inc.incident_state === "RESOLVED") {
    return <p className="text-sm text-muted">Resolved by {inc.resolved_by} at {fmtTime(inc.resolved_at)}. No further actions.</p>;
  }

  const input = "w-full rounded-lg border border-line-strong px-3 py-2 text-sm";
  return (
    <div className="space-y-5">
      {error ? <ErrorBox message={error} /> : null}
      {inc.incident_state === "OPEN" ? (
        <button onClick={() => act("acknowledge")} disabled={!!busy}
          className="w-full rounded-xl bg-forest px-4 py-3 font-bold text-white hover:bg-forest-dark disabled:opacity-60">
          {busy === "acknowledge" ? "Acknowledging…" : "Acknowledge"}
        </button>
      ) : null}
      {inc.incident_state !== "DISPATCHED" ? (
        <form onSubmit={(e) => { e.preventDefault(); void act("dispatch", { team, note: note || null }); }} className="space-y-2">
          <p className="font-semibold">Dispatch a response team</p>
          <input required minLength={2} value={team} onChange={(e) => setTeam(e.target.value)} placeholder="Team or unit (required)" aria-label="Team or unit" className={input} />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note, e.g. ETA (optional)" aria-label="Dispatch note" className={input} />
          <button disabled={!!busy || team.trim().length < 2} className="w-full rounded-xl border border-forest px-4 py-2.5 font-bold text-forest hover:bg-forest-soft disabled:opacity-50">
            {busy === "dispatch" ? "Dispatching…" : "Dispatch team"}
          </button>
        </form>
      ) : null}
      <form onSubmit={(e) => { e.preventDefault(); void act("resolve", { note: resolveNote }); }} className="space-y-2">
        <p className="font-semibold">Resolve</p>
        <input required minLength={3} value={resolveNote} onChange={(e) => setResolveNote(e.target.value)} placeholder="Outcome (required)" aria-label="Resolution note" className={input} />
        <button disabled={!!busy || resolveNote.trim().length < 3} className="w-full rounded-xl border border-line-strong px-4 py-2.5 font-bold text-ink hover:bg-surface disabled:opacity-50">
          {busy === "resolve" ? "Resolving…" : "Mark resolved"}
        </button>
      </form>
    </div>
  );
}

export default function IncidentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: inc, error, reload } = useLive<Incident & { gateway: unknown }>(`incidents/${encodeURIComponent(id)}`);

  return (
    <>
      <PageHeader
        title={inc ? `${inc.worker_name} · ${CATEGORY_LABEL[inc.category]}` : "Incident"}
        subtitle={inc ? inc.message_id : id}
        right={inc ? <div className="flex items-center gap-2"><PriorityBadge p={inc.priority} /><StatePill state={inc.incident_state} /></div> : null}
      />
      <p className="mb-4 text-sm"><Link href="/incidents" className="font-semibold text-forest underline">← All incidents</Link></p>
      {error ? <ErrorBox message={error} /> : null}
      {inc ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <Card>
              <h2 className="mb-4 text-lg font-bold">Emergency</h2>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field label="Person">{inc.person ? `${inc.person.full_name} · ${inc.person.phone}` : inc.worker_name}</Field>
                <Field label="Device">{inc.device_id}</Field>
                <Field label="Category">{CATEGORY_LABEL[inc.category]}</Field>
                <Field label="Priority"><PriorityBadge p={inc.priority} /></Field>
                <Field label="Description">{inc.description ?? <span className="text-muted">None given</span>}</Field>
                <Field label="Created on the phone">{fmtTime(inc.created_at)} ({ago(inc.created_at)})</Field>
                {inc.person ? (
                  <Field label="Emergency contacts">
                    {inc.person.emergency_contacts.length ? inc.person.emergency_contacts.map((c) => `${c.name} (${c.relationship.toLowerCase()}) ${c.phone}`).join(" · ") : "None on file"}
                  </Field>
                ) : <Field label="Account">Not signed in on the phone</Field>}
              </dl>
            </Card>
            <Card>
              <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">Location <Freshness inc={inc} /></h2>
              {inc.latitude !== null && inc.longitude !== null ? (
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Field label="Coordinates">
                    <span className="font-mono">{inc.latitude.toFixed(6)}, {inc.longitude.toFixed(6)}</span>{" "}
                    <CopyCoords lat={inc.latitude} lon={inc.longitude} />
                  </Field>
                  <Field label="Accuracy">{inc.location_accuracy_m !== null ? `±${Math.round(inc.location_accuracy_m)} m (reported by the phone)` : <span className="text-muted">Not reported by this app version</span>}</Field>
                  <Field label="Captured by the phone">
                    {inc.location_recorded_at ? `${fmtTime(inc.location_recorded_at)} (${ago(inc.location_recorded_at)})` : <span className="text-muted">Not reported</span>}
                  </Field>
                  <Field label="Received by server">{fmtTime(inc.received_at)}</Field>
                  <Field label="Source">
                    {inc.location_source === "DEVICE" ? "Phone location, fresh fix at SOS time"
                      : inc.location_source === "DEVICE_LAST_KNOWN" ? "Phone's last-known location (no fresh fix)"
                      : <span className="text-muted">Not reported</span>}
                  </Field>
                  <Field label="Map">
                    <a className="font-semibold text-forest underline" target="_blank" rel="noreferrer"
                      href={`https://www.openstreetmap.org/?mlat=${inc.latitude}&mlon=${inc.longitude}#map=17/${inc.latitude}/${inc.longitude}`}>Open in OpenStreetMap</a>
                  </Field>
                </dl>
              ) : <p className="text-sm text-muted">The phone had no location when this SOS was sent. No location is shown rather than a guess.</p>}
              {inc.location_freshness === "LAST_KNOWN" ? (
                <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">This is a last-known location, not a live position. The person may have moved.</p>
              ) : null}
            </Card>
            <Card>
              <h2 className="mb-3 text-lg font-bold">Communication path</h2>
              <Path hops={inc.hops} />
              {(() => {
                // Relays = hops between the sender (first) and the gateway; the gateway also
                // counts itself in hop_count when forwarding upward, so derive from the path.
                const relays = inc.hops.slice(1).filter((h) => h !== inc.gateway_id && h !== inc.hops[inc.hops.length - 1]).length;
                return (
                  <p className="mt-2 text-xs text-muted">
                    {relays === 0 ? "Sent directly to the gateway (no relay phone)" : `${relays} relay phone${relays === 1 ? "" : "s"} before the gateway`}
                    {" · "}received by backend {fmtTime(inc.received_at)} via {inc.gateway_id}
                  </p>
                );
              })()}
              <h3 className="mt-5 mb-2 font-semibold">History</h3>
              <ol className="space-y-2">
                {(inc.events ?? []).map((e) => (
                  <li key={e.id} className="flex flex-wrap gap-x-3 text-sm">
                    <span className="w-40 shrink-0 text-muted">{fmtTime(e.at)}</span>
                    <span className="font-semibold">{EVENT_LABEL[e.kind] ?? e.kind}</span>
                    {e.actor ? <span className="text-muted">by {e.actor}</span> : null}
                    {e.detail && "team" in e.detail ? <span className="text-muted">· team {String(e.detail.team)}</span> : null}
                    {e.detail && "note" in e.detail && e.detail.note ? <span className="text-muted">· “{String(e.detail.note)}”</span> : null}
                  </li>
                ))}
              </ol>
            </Card>
            <Card>
              <details>
                <summary className="cursor-pointer font-semibold">Full record</summary>
                <pre className="mt-3 overflow-x-auto rounded-lg bg-surface p-3 text-xs">{JSON.stringify(inc, null, 2)}</pre>
              </details>
            </Card>
          </div>
          <div className="space-y-5">
            <Card>
              <h2 className="mb-4 text-lg font-bold">Response</h2>
              <dl className="mb-5 space-y-3">
                <Field label="Acknowledged">{inc.acknowledged_by ? `${inc.acknowledged_by} · ${fmtTime(inc.acknowledged_at)}` : "Not yet"}</Field>
                <Field label="Dispatched">{inc.dispatched_by ? `${inc.dispatch_team} by ${inc.dispatched_by} · ${fmtTime(inc.dispatched_at)}` : "Not yet"}</Field>
                <Field label="Resolved">{inc.resolved_by ? `${inc.resolved_by} · ${fmtTime(inc.resolved_at)} · “${inc.resolution_note}”` : "Not yet"}</Field>
              </dl>
              <Actions inc={inc} onDone={reload} />
            </Card>
          </div>
        </div>
      ) : null}
    </>
  );
}
