//src\app\admin\matches\page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import Swal from "sweetalert2";
import {
  CalendarDays,
  Database,
  Eye,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Trophy,
  X,
} from "lucide-react";

import { Modal } from "@/components/admin/Modal";
import { LoadingSpinner } from "@/components/admin/LoadingSpinner";
import { supabase } from "@/lib/supabaseClient";
import { formatDateTime, friendlyError } from "@/lib/supabaseHelpers";

type TeamRow = {
  id: string;
  name: string;
  short_name?: string | null;
};

type MatchRow = {
  id: string;
  team_a_id: string | null;
  team_b_id: string | null;
  match_title: string | null;
  stage: string | null;
  match_start_at: string;
  prediction_lock_at: string | null;
  team_a_score: number | null;
  team_b_score: number | null;
  status: string;
  created_at: string | null;
  updated_at: string | null;
  teams_a?: TeamRow | null;
  teams_b?: TeamRow | null;
};

type MatchForm = {
  id?: string;
  match_title: string;
  team_a_id: string;
  team_b_id: string;
  match_start_at: string;
  stage: string;
  team_a_score: string;
  team_b_score: string;
  status: string;
};

const STATUS_OPTIONS = [
  { value: "upcoming", label: "Upcoming" },
  { value: "locked", label: "Locked" },
  { value: "live", label: "Live" },
  { value: "completed", label: "Completed" },
  { value: "finalized", label: "Finalized" },
  { value: "cancelled", label: "Cancelled" },
];

const emptyForm: MatchForm = {
  match_title: "",
  team_a_id: "",
  team_b_id: "",
  match_start_at: "",
  stage: "",
  team_a_score: "",
  team_b_score: "",
  status: "upcoming",
};

function toDateTimeLocalValue(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const pad = (num: number) => String(num).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function teamLabel(team?: TeamRow | null, fallback = "Team") {
  if (!team) return fallback;

  return team.short_name ? `${team.name} (${team.short_name})` : team.name;
}

function shortTeamLabel(team?: TeamRow | null, fallback = "Team") {
  if (!team) return fallback;

  return team.short_name || team.name;
}

function scoreLabel(row: MatchRow) {
  const hasScore =
    row.team_a_score !== null &&
    row.team_a_score !== undefined &&
    row.team_b_score !== null &&
    row.team_b_score !== undefined;

  if (!hasScore) {
    return "Not started";
  }

  return `${row.team_a_score} - ${row.team_b_score}`;
}

function statusClass(status?: string | null) {
  switch (status) {
    case "finalized":
      return "bg-emerald-50 text-emerald-700 ring-emerald-100";
    case "completed":
      return "bg-blue-50 text-blue-700 ring-blue-100";
    case "live":
      return "bg-rose-50 text-rose-700 ring-rose-100";
    case "locked":
      return "bg-amber-50 text-amber-700 ring-amber-100";
    case "cancelled":
      return "bg-slate-100 text-slate-600 ring-slate-200";
    default:
      return "bg-cyan-50 text-cyan-700 ring-cyan-100";
  }
}

function sortByStartDateAsc(a: MatchRow, b: MatchRow) {
  return (
    new Date(a.match_start_at).getTime() - new Date(b.match_start_at).getTime()
  );
}

function arrangeNextFiveFirst(rows: MatchRow[]) {
  const now = Date.now();

  const sorted = [...rows].sort(sortByStartDateAsc);

  const nextFive = sorted
    .filter((row) => {
      const startTime = new Date(row.match_start_at).getTime();

      return (
        startTime >= now &&
        row.status !== "cancelled" &&
        row.status !== "completed" &&
        row.status !== "finalized"
      );
    })
    .slice(0, 5);

  const nextFiveIds = new Set(nextFive.map((row) => row.id));

  const rest = sorted.filter((row) => !nextFiveIds.has(row.id));

  return [...nextFive, ...rest];
}

export default function Matches() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MatchRow | null>(null);
  const [form, setForm] = useState<MatchForm>(emptyForm);

  async function loadTeams() {
    const { data, error } = await supabase
      .from("teams")
      .select("id,name,short_name")
      .order("name", { ascending: true });

    if (error) {
      setTeams([]);
      Swal.fire("Load failed", friendlyError(error), "error");
      return;
    }

    setTeams((data ?? []) as TeamRow[]);
  }

 async function loadMatches() {
  setLoading(true);

  const { data, error } = await supabase
    .from("fixtures_view")
    .select(
      `
      id,
      match_title,
      stage,
      team_a_id,
      team_a_name,
      team_a_short_name,
      team_a_flag_url,
      team_b_id,
      team_b_name,
      team_b_short_name,
      team_b_flag_url,
      match_start_at,
      prediction_lock_at,
      team_a_score,
      team_b_score,
      status,
      created_at,
      updated_at
    `
    )
    .order("match_start_at", { ascending: true });

  if (error) {
    setRows([]);
    Swal.fire("Load failed", friendlyError(error), "error");
  } else {
    const mappedRows = (data ?? []).map((row: any) => ({
      id: row.id,
      team_a_id: row.team_a_id,
      team_b_id: row.team_b_id,
      match_title: row.match_title,
      stage: row.stage,
      match_start_at: row.match_start_at,
      prediction_lock_at: row.prediction_lock_at,
      team_a_score: row.team_a_score,
      team_b_score: row.team_b_score,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,

      teams_a: {
        id: row.team_a_id,
        name: row.team_a_name,
        short_name: row.team_a_short_name,
      },

      teams_b: {
        id: row.team_b_id,
        name: row.team_b_name,
        short_name: row.team_b_short_name,
      },
    }));

    setRows(mappedRows as MatchRow[]);
  }

  setLoading(false);
}

  async function loadAll() {
    await Promise.all([loadTeams(), loadMatches()]);
  }

  useEffect(() => {
    void loadAll();
  }, []);

  const arrangedRows = useMemo(() => arrangeNextFiveFirst(rows), [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    return arrangedRows.filter((row) => {
      const matchesStatus =
        statusFilter === "all" || row.status === statusFilter;

      const rowText = [
        row.match_title,
        row.stage,
        row.status,
        row.team_a_score,
        row.team_b_score,
        row.teams_a?.name,
        row.teams_a?.short_name,
        row.teams_b?.name,
        row.teams_b?.short_name,
        formatDateTime(row.match_start_at),
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = !q || rowText.includes(q);

      return matchesStatus && matchesSearch;
    });
  }, [arrangedRows, search, statusFilter]);

  const nextFiveIds = useMemo(() => {
    const now = Date.now();

    return new Set(
      [...rows]
        .sort(sortByStartDateAsc)
        .filter((row) => {
          const startTime = new Date(row.match_start_at).getTime();

          return (
            startTime >= now &&
            row.status !== "cancelled" &&
            row.status !== "completed" &&
            row.status !== "finalized"
          );
        })
        .slice(0, 5)
        .map((row) => row.id)
    );
  }, [rows]);

  const totalMatches = rows.length;
  const upcomingMatches = rows.filter((row) => row.status === "upcoming").length;
  const liveMatches = rows.filter((row) => row.status === "live").length;
  const completedMatches = rows.filter(
    (row) => row.status === "completed" || row.status === "finalized"
  ).length;

  function startAdd() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function startEdit(row: MatchRow) {
    setEditing(row);

    setForm({
      id: row.id,
      match_title: row.match_title ?? "",
      team_a_id: row.team_a_id ?? "",
      team_b_id: row.team_b_id ?? "",
      match_start_at: toDateTimeLocalValue(row.match_start_at),
      stage: row.stage ?? "",
      team_a_score:
        row.team_a_score === null || row.team_a_score === undefined
          ? ""
          : String(row.team_a_score),
      team_b_score:
        row.team_b_score === null || row.team_b_score === undefined
          ? ""
          : String(row.team_b_score),
      status: row.status ?? "upcoming",
    });

    setOpen(true);
  }

  function updateForm<K extends keyof MatchForm>(key: K, value: MatchForm[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function cleanPayload() {
    return {
      match_title: form.match_title.trim() || null,
      team_a_id: form.team_a_id,
      team_b_id: form.team_b_id,
      match_start_at: new Date(form.match_start_at).toISOString(),
      stage: form.stage.trim() || null,
      team_a_score:
        form.team_a_score === "" || form.team_a_score === null
          ? null
          : Number(form.team_a_score),
      team_b_score:
        form.team_b_score === "" || form.team_b_score === null
          ? null
          : Number(form.team_b_score),
      status: form.status || "upcoming",
    };
  }

  async function saveMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.team_a_id || !form.team_b_id) {
      Swal.fire("Required", "Please select both Team A and Team B.", "warning");
      return;
    }

    if (form.team_a_id === form.team_b_id) {
      Swal.fire("Invalid Teams", "Team A and Team B cannot be the same.", "warning");
      return;
    }

    if (!form.match_start_at) {
      Swal.fire("Required", "Please select match start date and time.", "warning");
      return;
    }

    setSaving(true);

    const payload = cleanPayload();

    const result = editing?.id
      ? await supabase.from("matches").update(payload).eq("id", editing.id)
      : await supabase.from("matches").insert(payload);

    setSaving(false);

    if (result.error) {
      Swal.fire("Save failed", friendlyError(result.error), "error");
      return;
    }

    setOpen(false);
    await loadMatches();

    Swal.fire({
      title: "Saved",
      text: "Match saved successfully.",
      icon: "success",
      timer: 1300,
      showConfirmButton: false,
    });
  }

  async function deleteMatch(row: MatchRow) {
    const confirm = await Swal.fire({
      title: "Delete match?",
      text: "This cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Delete",
      cancelButtonText: "Cancel",
    });

    if (!confirm.isConfirmed) return;

    const { error } = await supabase.from("matches").delete().eq("id", row.id);

    if (error) {
      Swal.fire("Delete failed", friendlyError(error), "error");
      return;
    }

    await loadMatches();

    Swal.fire({
      title: "Deleted",
      text: "Match removed.",
      icon: "success",
      timer: 1200,
      showConfirmButton: false,
    });
  }

  return (
    <section className="space-y-5">
      <div className="overflow-hidden rounded-[1.7rem] border border-slate-200 bg-white shadow-sm">
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 px-5 py-5 text-white sm:px-6">
          <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-emerald-400/20 blur-3xl" />
          <div className="absolute -bottom-20 left-20 h-44 w-44 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                <CalendarDays className="h-3.5 w-3.5" />
                Admin Management
              </div>

              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
                Matches
              </h1>

              <p className="mt-1 max-w-2xl text-sm text-slate-300">
                Showing next 5 upcoming matches first, followed by all matches
                sorted by start date ascending.
              </p>
            </div>

            <button
              onClick={startAdd}
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-emerald-950/20 transition hover:bg-emerald-400"
            >
              <Plus className="h-4 w-4" />
              Add Match
            </button>
          </div>
        </div>

        <div className="grid gap-3 border-b border-slate-100 bg-slate-50/80 p-4 sm:grid-cols-4 sm:p-5">
          <StatCard label="Total Matches" value={totalMatches} />
          <StatCard label="Upcoming" value={upcomingMatches} />
          <StatCard label="Live" value={liveMatches} />
          <StatCard label="Completed" value={completedMatches} />
        </div>

        <div className="grid gap-3 border-b border-slate-100 bg-white px-5 py-4 sm:grid-cols-[1fr_190px_auto] sm:items-center sm:px-6">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search match, team, stage, score or status..."
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
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
          >
            <option value="all">All Status</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>

          <button
            onClick={() => void loadAll()}
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        <div className="p-4 sm:p-5">
          {loading ? (
            <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50">
              <LoadingSpinner />
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center">
              <div className="mb-3 rounded-2xl bg-white p-4 shadow-sm">
                <Database className="h-7 w-7 text-slate-400" />
              </div>

              <h3 className="text-base font-black text-slate-900">
                No matches found
              </h3>

              <p className="mt-1 max-w-md text-sm text-slate-500">
                Try changing your search or filter.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Match</th>
                      <th className="px-4 py-3">Team A</th>
                      <th className="px-4 py-3">Team B</th>
                      <th className="px-4 py-3">Start</th>
                      <th className="px-4 py-3">Lock At</th>
                      <th className="px-4 py-3">Goals Scored</th>
                      <th className="px-4 py-3">Stage</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {filteredRows.map((row) => {
                      const isNextFive = nextFiveIds.has(row.id);

                      return (
                        <tr
                          key={row.id}
                          className={`hover:bg-slate-50/80 ${
                            isNextFive ? "bg-emerald-50/40" : ""
                          }`}
                        >
                          <td className="px-4 py-3">
                            <div className="space-y-1">
                              {isNextFive && (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-emerald-700">
                                  <Trophy className="h-3 w-3" />
                                  Next Match
                                </span>
                              )}

                              <p className="font-black text-slate-900">
                                {row.match_title ||
                                  `${shortTeamLabel(
                                    row.teams_a,
                                    "Team A"
                                  )} vs ${shortTeamLabel(row.teams_b, "Team B")}`}
                              </p>

                              <p className="text-xs text-slate-400">{row.id}</p>
                            </div>
                          </td>

                          <td className="px-4 py-3 font-bold text-slate-700">
                            {teamLabel(row.teams_a, row.team_a_id ?? "Team A")}
                          </td>

                          <td className="px-4 py-3 font-bold text-slate-700">
                            {teamLabel(row.teams_b, row.team_b_id ?? "Team B")}
                          </td>

                          <td className="px-4 py-3 text-slate-600">
                            {formatDateTime(row.match_start_at)}
                          </td>

                          <td className="px-4 py-3 text-slate-600">
                            {row.prediction_lock_at
                              ? formatDateTime(row.prediction_lock_at)
                              : "—"}
                          </td>

                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-black ring-1 ${
                                row.team_a_score === null ||
                                row.team_b_score === null
                                  ? "bg-slate-100 text-slate-600 ring-slate-200"
                                  : "bg-emerald-50 text-emerald-700 ring-emerald-100"
                              }`}
                            >
                              {scoreLabel(row)}
                            </span>
                          </td>

                          <td className="px-4 py-3 text-slate-600">
                            {row.stage || "—"}
                          </td>

                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black uppercase tracking-wide ring-1 ${statusClass(
                                row.status
                              )}`}
                            >
                              {row.status || "upcoming"}
                            </span>
                          </td>

                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              <Link
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 transition hover:bg-emerald-100"
                                href={`/admin/matches/${row.id}`}
                                title="Open"
                              >
                                <Eye className="h-4 w-4" />
                              </Link>

                              <button
                                onClick={() => startEdit(row)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
                                type="button"
                                title="Edit"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>

                              <button
                                onClick={() => void deleteMatch(row)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-100 bg-rose-50 text-rose-700 transition hover:bg-rose-100"
                                type="button"
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
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

      <Modal
        title={`${editing ? "Edit" : "Add"} Match`}
        open={open}
        onClose={() => setOpen(false)}
      >
        <form onSubmit={saveMatch} className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold text-slate-700">
            Match Title
            <input
              value={form.match_title}
              onChange={(event) => updateForm("match_title", event.target.value)}
              className={inputClass}
              placeholder="Example: Group A Match 1"
            />
          </label>

          <label className="text-sm font-bold text-slate-700">
            Stage
            <input
              value={form.stage}
              onChange={(event) => updateForm("stage", event.target.value)}
              className={inputClass}
              placeholder="Example: Group Stage"
            />
          </label>

          <label className="text-sm font-bold text-slate-700">
            Team A <span className="text-rose-600">*</span>
            <select
              required
              value={form.team_a_id}
              onChange={(event) => updateForm("team_a_id", event.target.value)}
              className={inputClass}
            >
              <option value="">Select Team A</option>

              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {teamLabel(team)}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-bold text-slate-700">
            Team B <span className="text-rose-600">*</span>
            <select
              required
              value={form.team_b_id}
              onChange={(event) => updateForm("team_b_id", event.target.value)}
              className={inputClass}
            >
              <option value="">Select Team B</option>

              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {teamLabel(team)}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-bold text-slate-700">
            Match Start At <span className="text-rose-600">*</span>
            <input
              required
              type="datetime-local"
              value={form.match_start_at}
              onChange={(event) =>
                updateForm("match_start_at", event.target.value)
              }
              className={inputClass}
            />
          </label>

          <label className="text-sm font-bold text-slate-700">
            Status
            <select
              value={form.status}
              onChange={(event) => updateForm("status", event.target.value)}
              className={inputClass}
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-bold text-slate-700">
            Team A Score
            <input
              type="number"
              min={0}
              value={form.team_a_score}
              onChange={(event) => updateForm("team_a_score", event.target.value)}
              className={inputClass}
              placeholder="Leave empty if not started"
            />
          </label>

          <label className="text-sm font-bold text-slate-700">
            Team B Score
            <input
              type="number"
              min={0}
              value={form.team_b_score}
              onChange={(event) => updateForm("team_b_score", event.target.value)}
              className={inputClass}
              placeholder="Leave empty if not started"
            />
          </label>

          <div className="flex flex-col-reverse gap-3 pt-2 sm:col-span-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}

const inputClass =
  "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100";

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