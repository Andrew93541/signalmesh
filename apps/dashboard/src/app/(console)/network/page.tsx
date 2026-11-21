"use client";

import { Card, Empty, ErrorBox, PageHeader } from "@/components/ui";
import { ago, type GatewayView, useLive } from "@/lib/client";

export default function Network() {
  const { data, error } = useLive<{ gateways: GatewayView[] }>("network");
  const gws = data?.gateways ?? [];
  return (
    <>
      <PageHeader title="Relay Network" subtitle="Relay phones and check-ins as reported by each gateway. Relays send a heartbeat to their gateway every few seconds." />
      {error ? <ErrorBox message={error} /> : null}
      {data && gws.length === 0 ? <Empty title="No gateways registered" body="Register one with: python -m trackmate_backend.manage create-gateway GATEWAY_01" /> : null}
      <div className="space-y-5">
        {gws.map((g) => {
          const nodes = g.status?.nodes ?? [];
          return (
            <Card key={g.id}>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-bold">{g.id}</h2>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${g.online ? "bg-ok-soft text-ok" : "bg-sos-soft text-sos-text"}`}>
                  {g.online ? "Gateway online" : `Gateway offline · last seen ${ago(g.last_seen)}`}
                </span>
                {!g.online && nodes.length ? <span className="text-xs text-warn">Relay data below is from the last report and may be out of date.</span> : null}
              </div>
              {nodes.length === 0 ? <p className="text-sm text-muted">No relay phones have reported to this gateway.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="text-xs uppercase text-muted"><tr><th className="py-2">Relay</th><th>Status</th><th>Address seen by gateway</th><th>Waiting messages</th><th>Last heartbeat</th></tr></thead>
                    <tbody className="divide-y divide-line">
                      {nodes.map((n) => (
                        <tr key={n.node_id}>
                          <td className="py-2"><div className="font-mono font-semibold">{n.node_id}</div><div className="text-xs text-muted">{n.label ?? n.role}</div></td>
                          <td><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${n.online ? "bg-ok-soft text-ok" : "bg-surface2 text-muted"}`}>{n.online ? "Online" : "Offline"}</span></td>
                          <td className="font-mono text-xs">{n.address ?? "—"}</td>
                          <td className={n.queue_size ? "font-semibold text-warn" : ""}>{n.queue_size}</td>
                          <td>{ago(n.last_seen)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {g.status?.checkins?.length ? (
                <>
                  <h3 className="mt-5 mb-2 font-semibold">Check-ins</h3>
                  <ul className="space-y-1 text-sm">
                    {g.status.checkins.map((c) => (
                      <li key={c.device_id} className={c.overdue ? "font-semibold text-sos-text" : ""}>
                        {c.worker_name} ({c.device_id}) — {c.overdue ? `OVERDUE since ${ago(c.due_at)}` : `next due ${new Date(c.due_at).toLocaleTimeString()}`}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </Card>
          );
        })}
      </div>
    </>
  );
}
