"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { formatDateTime, friendlyError } from "@/lib/supabaseHelpers";

type AdminUser = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  role: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function display(value?: string | number | null) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return "—";
  }

  return String(value);
}

function getInitials(name?: string | null, email?: string | null) {
  const source = name || email || "User";

  return source
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function AdminUsersPage() {
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  async function loadUsers() {
    setLoading(true);

    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, full_name, phone, email, avatar_url, role, created_at, updated_at"
      )
      .order("created_at", { ascending: false });

    if (error) {
      setRows([]);
      alert(friendlyError(error, "Could not load users"));
    } else {
      setRows((data ?? []) as AdminUser[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  const roles = useMemo(() => {
    const uniqueRoles = Array.from(
      new Set(rows.map((row) => row.role || "user"))
    );

    return ["all", ...uniqueRoles];
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    return rows.filter((row) => {
      const role = row.role || "user";

      const matchesRole = roleFilter === "all" || role === roleFilter;

      const matchesSearch =
        !q ||
        [
          row.full_name,
          row.email,
          row.phone,
          row.role,
          row.id,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);

      return matchesRole && matchesSearch;
    });
  }, [rows, search, roleFilter]);

  const totalUsers = rows.length;
  const totalAdmins = rows.filter((row) => row.role === "admin").length;
  const totalNormalUsers = rows.filter((row) => row.role !== "admin").length;
  const totalWithPhone = rows.filter((row) => row.phone).length;

  return (
    <section className="space-y-5">
      <div className="overflow-hidden rounded-[1.7rem] border border-slate-200 bg-white shadow-sm">
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 px-5 py-5 text-white sm:px-6">
          <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-emerald-400/20 blur-3xl" />
          <div className="absolute -bottom-20 left-20 h-44 w-44 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                <Users className="h-3.5 w-3.5" />
                Admin Management
              </div>

              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
                All Users
              </h1>

              <p className="mt-1 max-w-2xl text-sm text-slate-300">
                View all registered users, contact details, roles and account
                creation dates.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/admin/predictions"
                className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-emerald-950/20 transition hover:bg-emerald-400"
              >
                View Predictions
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-3 border-b border-slate-100 bg-slate-50/80 p-4 sm:grid-cols-4 sm:p-5">
          <StatCard label="Total Users" value={totalUsers} />
          <StatCard label="Admins" value={totalAdmins} />
          <StatCard label="Normal Users" value={totalNormalUsers} />
          <StatCard label="With Phone" value={totalWithPhone} />
        </div>

        <div className="grid gap-3 border-b border-slate-100 bg-white px-5 py-4 sm:grid-cols-[1fr_180px_auto] sm:items-center sm:px-6">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, email, phone or role..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
            />

            {search && (
              <button
                onClick={() => setSearch("")}
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
          >
            {roles.map((role) => (
              <option key={role} value={role}>
                {role === "all" ? "All Roles" : role}
              </option>
            ))}
          </select>

          <button
            onClick={() => void loadUsers()}
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        <div className="p-4 sm:p-5">
          {loading ? (
            <LoadingBlock />
          ) : filteredRows.length === 0 ? (
            <EmptyBlock text="No users found." />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">User</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Phone</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-4 py-3">Updated</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {filteredRows.map((user) => {
                      const isAdmin = user.role === "admin";

                      return (
                        <tr key={user.id} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-500 text-xs font-black text-white">
                                {getInitials(user.full_name, user.email)}
                              </div>

                              <div>
                                <p className="font-black text-slate-900">
                                  {display(user.full_name)}
                                </p>
                                <p className="max-w-[230px] truncate text-xs text-slate-400">
                                  {user.id}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3 text-slate-700">
                            {display(user.email)}
                          </td>

                          <td className="px-4 py-3 text-slate-700">
                            {display(user.phone)}
                          </td>

                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black uppercase ${
                                isAdmin
                                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                                  : "bg-slate-100 text-slate-700 ring-1 ring-slate-200"
                              }`}
                            >
                              {isAdmin ? (
                                <ShieldCheck className="h-3.5 w-3.5" />
                              ) : (
                                <UserRound className="h-3.5 w-3.5" />
                              )}
                              {display(user.role || "user")}
                            </span>
                          </td>

                          <td className="px-4 py-3 text-slate-500">
                            {formatDateTime(user.created_at)}
                          </td>

                          <td className="px-4 py-3 text-slate-500">
                            {formatDateTime(user.updated_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function LoadingBlock() {
  return (
    <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-500" />
        <p className="mt-3 text-sm font-bold text-slate-500">
          Loading users...
        </p>
      </div>
    </div>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center">
      <Users className="mb-3 h-8 w-8 text-slate-400" />
      <h3 className="text-base font-black text-slate-900">{text}</h3>
    </div>
  );
}