"use client";

import Link from "next/link";

import { CATEGORY_LABEL, Card, Empty, ErrorBox, PageHeader, PriorityBadge, Stat, StatePill } from "@/components/ui";
import { ago, type Incident, type Summary, useLive } from "@/lib/client";

export default function CommandCenter() {
  const { data: s, error } = useLive<Summary>("summary");
  const { data: open } = useLive<Incident[]>("incidents?state=OPEN,ACKNOWLEDGED,DISPATCHED&limit=8");

  return (
    <>
      <PageHeader title="Command Center" subtitle={s ? `Updated ${new Date(s.time).toLocaleTimeString()}` : "Loading…"} />
      {error ? <ErrorBox message={error} /> : null}
      {s ? (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Active SOS incidents" value={s.incidents.active} tone={s.incidents.active ? "sos" : "plain"} />
            <Stat label="Critical" value={s.incidents.critical} tone={s.incidents.critical ? "sos" : "plain"} />
            <Stat label="Awaiting acknowledgement" value={s.incidents.awaiting_ack} tone={s.incidents.awaiting_ack ? "warn" : "plain"} />
            <Stat label="Acknowledged" value={s.incidents.acknowledged} />
            <Stat label="Dispatched" value={s.incidents.dispatched} tone={s.incidents.dispatched ? "forest" : "plain"} />
            <Stat label="Gateways online" value={`${s.gateways.online}/${s.gateways.known}`} tone={s.gateways.known && s.gateways.online === s.gateways.known ? "ok" : "warn"}
              hint={s.gateways.known ? undefined : "No gateway registered"} />
            <Stat label="Relays online" value={`${s.relays.online}/${s.relays.known}`} hint="As reported by online gateways" />
            <Stat label="Pending upstream" value={s.upstream_pending} tone={s.upstream_pending ? "warn" : "plain"} hint="Messages waiting at gateways" />
          </div>
          <Card className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">Open incidents</h2>
              <Link href="/incidents" className="text-sm font-semibold text-forest underline">All incidents</Link>
            </div>
            {open && open.length === 0 ? (
              <Empty title="No open incidents" body="New SOS messages appear here as soon as a gateway delivers them." />
            ) : (
              <ul className="divide-y divide-line">
                {(open ?? []).map((i) => (
                  <li key={i.message_id}>
                    <Link href={`/incidents/${i.message_id}`} className="flex flex-wrap items-center gap-3 py-3 hover:bg-surface">
                      <PriorityBadge p={i.priority} />
                      <span className="font-semibold">{i.worker_name}</span>
                      <span className="text-sm text-muted">{CATEGORY_LABEL[i.category]} · {i.device_id}</span>
                      <span className="ml-auto text-sm text-muted">{ago(i.received_at)}</span>
                      <StatePill state={i.incident_state} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : null}
    </>
  );
}
