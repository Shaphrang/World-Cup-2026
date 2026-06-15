"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  RefreshCw,
  Search,
  Target,
  Trophy,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { formatDateTime, friendlyError } from "@/lib/supabaseHelpers";

type ProfileRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  role: string | null;
};

type MatchOptionRow = {
  id: string;
  match_title: string | null;
  stage: string | null;
  match_start_at: string | null;
  team_a_score: number | null;
  team_b_score: number | null;
  status: string | null;
};

type PredictionRow = {
  id: string;
  user_id: string;
  match_id: string;

  match_title: string | null;
  stage: string | null;

  team_a_id: string | null;
  team_a_name: string | null;
  team_a_short_name: string | null;
  team_a_flag_url: string | null;

  team_b_id: string | null;
  team_b_name: string | null;
  team_b_short_name: string | null;
  team_b_flag_url: string | null;

  team_a_score: number | null;
  team_b_score: number | null;

  scorer_id: string | null;
  scorer_name: string | null;

  exact_score_points: number | null;
  total_goals_points: number | null;
  player_points: number | null;
  points: number | null;

  status: string | null;
  is_evaluated: boolean | null;

  created_at: string | null;
  submitted_at: string | null;
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

function getMatchLabel(match: MatchOptionRow) {
  const title = match.match_title || "Untitled match";
  const score =
    match.team_a_score !== null && match.team_b_score !== null
      ? ` · ${match.team_a_score}-${match.team_b_score}`
      : "";

  return `${title}${score}`;
}

export default function AdminPredictionsPage() {
  const [predictions, setPredictions] = useState<PredictionRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [completedMatches, setCompletedMatches] = useState<MatchOptionRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedMatchId, setSelectedMatchId] = useState("all");

  async function loadPredictions() {
    setLoading(true);

    const [predictionResult, profileResult, matchResult] = await Promise.all([
      supabase
        .from("predictions_view")
        .select("*")
        .order("submitted_at", { ascending: false }),

      supabase
        .from("profiles")
        .select("id, full_name, phone, email, avatar_url, role"),

      supabase
        .from("matches")
        .select(
          "id, match_title, stage, match_start_at, team_a_score, team_b_score, status"
        )
        .in("status", ["completed", "COMPLETED"])
        .order("match_start_at", { ascending: false }),
    ]);

    if (predictionResult.error) {
      setPredictions([]);
      alert(friendlyError(predictionResult.error, "Could not load predictions"));
      setLoading(false);
      return;
    }

    if (profileResult.error) {
      setProfiles([]);
      alert(friendlyError(profileResult.error, "Could not load users"));
      setLoading(false);
      return;
    }

    if (matchResult.error) {
      setCompletedMatches([]);
      alert(friendlyError(matchResult.error, "Could not load completed matches"));
    } else {
      setCompletedMatches((matchResult.data ?? []) as MatchOptionRow[]);
    }

    setPredictions((predictionResult.data ?? []) as PredictionRow[]);
    setProfiles((profileResult.data ?? []) as ProfileRow[]);
    setLoading(false);
  }

  useEffect(() => {
    void loadPredictions();
  }, []);

  const profileMap = useMemo(() => {
    return new Map(profiles.map((profile) => [profile.id, profile]));
  }, [profiles]);

  const rows = useMemo(() => {
    return predictions.map((prediction) => {
      const profile = profileMap.get(prediction.user_id) ?? null;

      return {
        prediction,
        profile,
      };
    });
  }, [predictions, profileMap]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    return rows.filter(({ prediction, profile }) => {
      const rawStatus = prediction.status || "submitted";
      const effectiveStatus = prediction.is_evaluated
        ? "evaluated"
        : "submitted";

      const matchesStatus =
        statusFilter === "all" ||
        statusFilter === rawStatus ||
        statusFilter === effectiveStatus;

      const matchesSelectedMatch =
        selectedMatchId === "all" || prediction.match_id === selectedMatchId;

      const matchText = [
        profile?.full_name,
        profile?.email,
        profile?.phone,
        prediction.match_title,
        prediction.stage,
        prediction.team_a_name,
        prediction.team_b_name,
        prediction.scorer_name,
        prediction.status,
        prediction.points,
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = !q || matchText.includes(q);

      return matchesStatus && matchesSelectedMatch && matchesSearch;
    });
  }, [rows, search, statusFilter, selectedMatchId]);

  const visiblePredictions = useMemo(() => {
    return filteredRows.map((row) => row.prediction);
  }, [filteredRows]);

  const totalPredictions = visiblePredictions.length;
  const uniqueUsers = new Set(visiblePredictions.map((row) => row.user_id)).size;
  const evaluatedCount = visiblePredictions.filter(
    (row) => row.is_evaluated
  ).length;
  const submittedCount = visiblePredictions.filter(
    (row) => !row.is_evaluated
  ).length;
  const totalPoints = visiblePredictions.reduce(
    (sum, row) => sum + Number(row.points ?? 0),
    0
  );

  const selectedMatch = completedMatches.find(
    (match) => match.id === selectedMatchId
  );

  return (
    <section className="space-y-5">
      <div className="overflow-hidden rounded-[1.7rem] border border-slate-200 bg-white shadow-sm">
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 px-5 py-5 text-white sm:px-6">
          <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="absolute -bottom-20 left-20 h-44 w-44 rounded-full bg-emerald-400/10 blur-3xl" />

          <div className="relative flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-cyan-100">
                <Trophy className="h-3.5 w-3.5" />
                Admin Management
              </div>

              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
                All Predictions
              </h1>

              <p className="mt-1 max-w-2xl text-sm text-slate-300">
                View all submitted match predictions with user, teams, scorer,
                points and evaluation status.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/admin/users"
                className="inline-flex items-center justify-center rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-cyan-950/20 transition hover:bg-cyan-400"
              >
                View Users
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-3 border-b border-slate-100 bg-slate-50/80 p-4 sm:grid-cols-5 sm:p-5">
          <StatCard label="Predictions" value={totalPredictions} />
          <StatCard label="Users Played" value={uniqueUsers} />
          <StatCard label="Evaluated" value={evaluatedCount} />
          <StatCard label="Submitted" value={submittedCount} />
          <StatCard label="Total Points" value={totalPoints} />
        </div>

        <div className="border-b border-slate-100 bg-white px-5 py-4 sm:px-6">
          <div className="mb-3 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                Filter by completed match
              </p>

              <select
                value={selectedMatchId}
                onChange={(event) => setSelectedMatchId(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
              >
                <option value="all">All completed matches</option>

                {completedMatches.map((match) => (
                  <option key={match.id} value={match.id}>
                    {getMatchLabel(match)}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-xl bg-white px-4 py-2.5 text-sm font-black text-slate-700 ring-1 ring-slate-200">
              {selectedMatch ? getMatchLabel(selectedMatch) : "Showing all"}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_190px_auto] sm:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search user, match, team, scorer or points..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
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
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
            >
              <option value="all">All Status</option>
              <option value="submitted">Submitted</option>
              <option value="evaluated">Evaluated</option>
            </select>

            <button
              onClick={() => void loadPredictions()}
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {loading ? (
            <LoadingBlock />
          ) : filteredRows.length === 0 ? (
            <EmptyBlock text="No predictions found." />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">User</th>
                      <th className="px-4 py-3">Match</th>
                      <th className="px-4 py-3">Predicted Score</th>
                      <th className="px-4 py-3">Scorer</th>
                      <th className="px-4 py-3">Points</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Submitted</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {filteredRows.map(({ prediction, profile }) => {
                      const isEvaluated = Boolean(prediction.is_evaluated);

                      return (
                        <tr key={prediction.id} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-emerald-500 text-xs font-black text-white">
                                {getInitials(
                                  profile?.full_name,
                                  profile?.email
                                )}
                              </div>

                              <div>
                                <p className="font-black text-slate-900">
                                  {display(profile?.full_name)}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {display(profile?.email)}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <p className="font-black text-slate-900">
                              {display(prediction.match_title)}
                            </p>
                            <p className="text-xs text-slate-500">
                              {display(prediction.stage)}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-600">
                              {display(
                                prediction.team_a_short_name ||
                                  prediction.team_a_name
                              )}
                              {" vs "}
                              {display(
                                prediction.team_b_short_name ||
                                  prediction.team_b_name
                              )}
                            </p>
                          </td>

                          <td className="px-4 py-3">
                            <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-800 ring-1 ring-slate-200">
                              {display(prediction.team_a_score)} -{" "}
                              {display(prediction.team_b_score)}
                            </span>
                          </td>

                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-50 px-3 py-1 text-xs font-black text-cyan-700 ring-1 ring-cyan-100">
                              <Target className="h-3.5 w-3.5" />
                              {display(prediction.scorer_name)}
                            </span>
                          </td>

                          <td className="px-4 py-3">
                            <div className="space-y-1">
                              <p className="text-lg font-black text-slate-950">
                                {Number(prediction.points ?? 0)}
                              </p>

                              <p className="text-xs text-slate-500">
                                Score:{" "}
                                {Number(prediction.exact_score_points ?? 0)}
                                {" · "}
                                Goals:{" "}
                                {Number(prediction.total_goals_points ?? 0)}
                                {" · "}
                                Player: {Number(prediction.player_points ?? 0)}
                              </p>
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black uppercase ${
                                isEvaluated
                                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                                  : "bg-amber-50 text-amber-700 ring-1 ring-amber-100"
                              }`}
                            >
                              {isEvaluated ? (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              ) : (
                                <Target className="h-3.5 w-3.5" />
                              )}
                              {isEvaluated ? "Evaluated" : "Submitted"}
                            </span>
                          </td>

                          <td className="px-4 py-3 text-slate-500">
                            {formatDateTime(prediction.submitted_at)}
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
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-cyan-500" />
        <p className="mt-3 text-sm font-bold text-slate-500">
          Loading predictions...
        </p>
      </div>
    </div>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center">
      <Trophy className="mb-3 h-8 w-8 text-slate-400" />
      <h3 className="text-base font-black text-slate-900">{text}</h3>
    </div>
  );
}