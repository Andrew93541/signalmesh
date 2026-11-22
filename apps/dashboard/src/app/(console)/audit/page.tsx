"use client";

import { Card, Empty, ErrorBox, PageHeader } from "@/components/ui";
import { fmtTime, useLive } from "@/lib/client";

interface AuditRow { id: number; actor_name: string | null; action: string; target: string | null; detail: Record<string, unknown> | null; ip: string | null; at: string }

const LABEL: Record<string, string> = {
  "responder.login": "Signed in", "responder.login_failed": "Failed sign-in",
  "incident.acknowledged": "Acknowledged incident", "incident.dispatched": "Dispatched team", "incident.resolved": "Resolved incident",
};

export default function Audit() {
  const { data, error } = useLive<AuditRow[]>("audit?limit=300", 15_000);
  return (
    <>
      <PageHeader title="Audit History" subtitle="Responder sign-ins and every action taken on incidents." />
      {error ? <ErrorBox message={error} /> : null}
      {data && data.length === 0 ? <Empty title="No activity yet" body="Responder actions will be listed here." /> : null}
      {data && data.length > 0 ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-surface text-xs uppercase text-muted"><tr><th className="px-4 py-3">When</th><th>Who</th><th>Action</th><th>Target</th><th>Detail</th><th>IP</th></tr></thead>
            <tbody className="divide-y divide-line">
              {data.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 whitespace-nowrap">{fmtTime(r.at)}</td>
                  <td>{r.actor_name ?? "—"}</td>
                  <td className={r.action.includes("failed") ? "font-semibold text-sos-text" : ""}>{LABEL[r.action] ?? r.action}</td>
                  <td className="font-mono text-xs">{r.target?.startsWith("SM-") ? r.target : r.action.startsWith("incident") ? r.target : "—"}</td>
                  <td className="text-xs text-muted">{r.detail ? JSON.stringify(r.detail) : ""}</td>
                  <td className="font-mono text-xs">{r.ip ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </>
  );
}
