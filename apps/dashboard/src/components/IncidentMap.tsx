"use client";

import Link from "next/link";
import { useEffect } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";

import { fmtTime, type Incident, isStale } from "@/lib/client";

const STATE_COLOR = { OPEN: "#D92D36", ACKNOWLEDGED: "#F47B0B", DISPATCHED: "#075C3B", RESOLVED: "#7A8B7F" } as const;

function Fit({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 15);
    else if (points.length > 1) map.fitBounds(points, { padding: [40, 40] });
  }, [map, points]);
  return null;
}

export default function IncidentMap({ incidents }: { incidents: Incident[] }) {
  const located = incidents.filter((i) => i.latitude !== null && i.longitude !== null);
  const points = located.map((i) => [i.latitude!, i.longitude!] as [number, number]);
  return (
    <MapContainer center={points[0] ?? [20.5937, 78.9629]} zoom={points.length ? 13 : 4} className="h-[560px] w-full rounded-2xl" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Fit points={points} />
      {located.map((i) => {
        const stale = isStale(i.created_at);
        return (
          <CircleMarker key={i.message_id} center={[i.latitude!, i.longitude!]} radius={i.priority === "HIGH" ? 12 : 9}
            pathOptions={{ color: STATE_COLOR[i.incident_state], fillColor: STATE_COLOR[i.incident_state], fillOpacity: stale ? 0.15 : 0.6, weight: 3, dashArray: stale ? "4 4" : undefined }}>
            <Popup>
              <strong>{i.worker_name}</strong> · {i.category} · {i.priority}<br />
              {i.incident_state}<br />
              Location taken {fmtTime(i.created_at)}{stale ? " (stale)" : ""}<br />
              <Link href={`/incidents/${i.message_id}`}>Open incident</Link>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
