"use client";

import { Card, Empty, ErrorBox, PageHeader, Stat } from "@/components/ui";
import { ago, type GatewayView, useLive } from "@/lib/client";

export default function Gateways() {
  const { data, error } = useLive<{ gateways: GatewayView[] }>("network");
  const gws = data?.gateways ?? [];
  return (
    <>
      <PageHeader title="Gateway Health" subtitle="Each SignalMesh gateway reports its status to the backend every few seconds." />
      {error ? <ErrorBox message={error} /> : null}
      {data && gws.length === 0 ? <Empty title="No gateways registered" body="Register a gateway with the backend's manage command." /> : null}
      <div className="space-y-5">
        {gws.map((g) => {
          const s = g.status;
          return (
            <Card key={g.id}>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-bold">{g.id}</h2>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${g.online ? "bg-ok-soft text-ok" : "bg-sos-soft text-sos-text"}`}>
                  {g.online ? "Online" : "Offline"}
                </span>
                <span className="text-sm text-muted">Last report {ago(g.last_seen)}</span>
              </div>
              {s ? (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                  <Stat label="Database" value={s.database === "ok" ? "OK" : (s.database ?? "—")} tone={s.database === "ok" ? "ok" : "sos"} />
                  <Stat label="Messages stored" value={s.messages?.total ?? 0} />
                  <Stat label="Open at gateway" value={s.messages?.open ?? 0} />
                  <Stat label="Waiting to send up" value={s.upstream_pending ?? 0} tone={s.upstream_pending ? "warn" : "plain"} />
                  <Stat label="Relays online" value={(s.nodes ?? []).filter((n) => n.online && n.role === "relay").length} />
                </div>
              ) : <p className="text-sm text-muted">This gateway has never reported its status.</p>}
              {!g.online && s ? <p className="mt-3 text-xs text-warn">Figures are from the last report and may be out of date.</p> : null}
            </Card>
          );
        })}
      </div>
    </>
  );
}
