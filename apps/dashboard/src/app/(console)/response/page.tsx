"use client";

import Link from "next/link";

import { CATEGORY_LABEL, Card, Empty, ErrorBox, PageHeader, PriorityBadge } from "@/components/ui";
import { ago, type Incident, useLive } from "@/lib/client";

const COLUMNS = [
  { state: "OPEN", title: "Needs acknowledgement", hint: "Nobody has accepted these yet." },
  { state: "ACKNOWLEDGED", title: "Acknowledged, no team yet", hint: "Assign a response team." },
  { state: "DISPATCHED", title: "Team on the way", hint: "Resolve when the person is safe." },
] as const;

export default function Response() {
  const { data, error } = useLive<Incident[]>("incidents?state=OPEN,ACKNOWLEDGED,DISPATCHED&limit=500");
  return (
    <>
      <PageHeader title="Response Management" subtitle="Active incidents grouped by what they need next. Critical first, then oldest." />
      {error ? <ErrorBox message={error} /> : null}
      {data && data.length === 0 ? <Empty title="Nothing to respond to" body="There are no active incidents." /> : null}
      <div className="grid gap-5 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const items = (data ?? [])
            .filter((i) => i.incident_state === col.state)
            .sort((a, b) => (a.priority === "HIGH" ? 0 : 1) - (b.priority === "HIGH" ? 0 : 1) || a.received_at.localeCompare(b.received_at));
          return (
            <Card key={col.state}>
              <h2 className="font-bold">{col.title} <span className="text-muted">({items.length})</span></h2>
              <p className="mb-3 text-xs text-muted">{col.hint}</p>
              <ul className="space-y-2">
                {items.map((i) => (
                  <li key={i.message_id}>
                    <Link href={`/incidents/${i.message_id}`} className="block rounded-xl border border-line p-3 hover:bg-surface">
                      <div className="flex items-center gap-2"><PriorityBadge p={i.priority} /><span className="font-semibold">{i.worker_name}</span></div>
                      <p className="mt-1 text-xs text-muted">{CATEGORY_LABEL[i.category]} · waiting {ago(i.received_at)}{i.dispatch_team ? ` · ${i.dispatch_team}` : ""}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </>
  );
}
