"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  FileText,
  Flag,
  Gift,
  ImageIcon,
  LayoutDashboard,
  Link2,
  Medal,
  ShieldCheck,
  Target,
  Trophy,
  UserCog,
  Users,
} from "lucide-react";

export const nav = [
  ["/admin/dashboard", "Dashboard", LayoutDashboard],
  ["/admin/users", "Users", UserCog],
  ["/admin/predictions", "Predictions", Target],
  ["/admin/prize-pools", "Prize Pools", Gift],
  ["/admin/teams", "Teams", Flag],
  ["/admin/players", "Players", Users],
  ["/admin/matches", "Matches", CalendarDays],
  ["/admin/leaderboard", "Leaderboard", BarChart3],
  ["/admin/banners", "Banners", ImageIcon],
  ["/admin/app_links", "App Links", Link2],
  ["/admin/winners", "Winners", Medal],
  ["/admin/points", "Points Guide", FileText],
] as const;

export function Sidebar() {
  const path = usePathname();

  return (
    <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-slate-950 text-white lg:block">
      <div className="border-b border-white/10 p-6">
        <Link href="/admin/dashboard" className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 ring-1 ring-emerald-400/20">
            <Trophy className="h-7 w-7 text-emerald-400" />
          </div>

          <div>
            <p className="text-base font-semibold leading-tight text-white">
              World Cup 2026
            </p>

            <p className="mt-0.5 text-xs font-medium text-slate-400">
              Goal Prediction Admin
            </p>
          </div>
        </Link>
      </div>

      <div className="px-3 py-4">
        <div className="mb-3 flex items-center gap-2 px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5" />
          Admin Menu
        </div>

        <nav className="space-y-1">
          {nav.map(([href, label, Icon]) => {
            const active = path === href || path.startsWith(`${href}/`);

            return (
              <Link
                key={href}
                href={href}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-950/30"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon
                  className={`h-5 w-5 transition ${
                    active
                      ? "text-white"
                      : "text-slate-400 group-hover:text-emerald-300"
                  }`}
                />

                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}