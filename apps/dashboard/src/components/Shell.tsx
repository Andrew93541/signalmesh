"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { useLiveState } from "@/lib/client";

const NAV = [
  { href: "/", label: "Command Center" },
  { href: "/incidents", label: "Live SOS" },
  { href: "/map", label: "Emergency Map" },
  { href: "/response", label: "Response Management" },
  { href: "/network", label: "Relay Network" },
  { href: "/gateways", label: "Gateway Health" },
  { href: "/audit", label: "Audit History" },
];

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const live = useLiveState();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-wrap">
      <aside className="w-full border-b border-line bg-forest-dark text-white md:min-h-screen md:w-64 md:border-b-0">
        <div className="flex items-center gap-3 px-5 py-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/trekmate-logo.webp" alt="" width={40} height={40} className="rounded-lg bg-white" />
          <div>
            <p className="text-lg font-extrabold leading-tight">TrackMate</p>
            <p className="text-xs text-white/75">Emergency command centre</p>
          </div>
        </div>
        <nav aria-label="Main" className="flex flex-wrap gap-1 px-3 pb-4 md:flex-col md:flex-nowrap">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
                className={`rounded-lg px-3 py-2.5 text-sm font-semibold ${active ? "bg-white text-forest-dark" : "text-white/90 hover:bg-white/10"}`}>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto space-y-3 px-5 pb-6">
          <p className="flex items-center gap-2 text-xs" aria-live="polite">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${live === "live" ? "bg-leaf" : "bg-sunrise"}`} />
            {live === "live" ? "Live updates connected" : "Live updates reconnecting · polling every 10 s"}
          </p>
          <button onClick={logout} className="w-full rounded-lg border border-white/30 px-3 py-2 text-sm font-semibold hover:bg-white/10">Sign out</button>
        </div>
      </aside>
      <main className="min-w-0 flex-[999_1_560px] p-5 md:p-8">{children}</main>
    </div>
  );
}
