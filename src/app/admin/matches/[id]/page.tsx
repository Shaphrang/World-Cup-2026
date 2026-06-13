//src\app\admin\matches\[id]\page.tsx
"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Swal from "sweetalert2";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Goal,
  Plus,
  RefreshCw,
  Save,
  Shield,
  Trophy,
  Users,
} from "lucide-react";

import { supabase } from "@/lib/supabaseClient";
import { DataTable } from "@/components/admin/DataTable";
import { LoadingSpinner } from "@/components/admin/LoadingSpinner";
import { friendlyError, formatDateTime } from "@/lib/supabaseHelpers";

type JsonRecord = Record<string, unknown>;

type TeamRow = {
  id: string;
  name: string;
  short_name?: string | null;
};

type MatchRow = {
  id: string;
  team_a_id: string;
  team_b_id: string;
  match_title?: string | null;
  stage?: string | null;
  match_start_at: string;
  prediction_lock_at: string;
  team_a_score?: number | null;
  team_b_score?: number | null;
  status: string;
  teams_a?: TeamRow | null;
  teams_b?: TeamRow | null;
};

type PlayerRow = {
  id: string;
  team_id: string;
  player_name: string;
  jersey_no?: number | null;
  position?: string | null;
  is_active?: boolean;
};

type GoalRow = {
  id: string;
  match_id: string;
  player_id: string;
  team_id?: string | null;
  minute?: number | null;
  created_at?: string;
  players?: {
    id: string;
    player_name: string;
  } | null;
  teams?: TeamRow | null;
  [key: string]: unknown;
};

type OneOrMany<T> = T | T[] | null | undefined;

type RawMatchRow = Omit<MatchRow, "teams_a" | "teams_b"> & {
  teams_a?: OneOrMany<TeamRow>;
  teams_b?: OneOrMany<TeamRow>;
};

type RawGoalRow = {
  id: string;
  match_id: string;
  player_id: string;
  team_id?: string | null;
  minute?: number | null;
  created_at?: string;
  players?: OneOrMany<{
    id: string;
    player_name: string;
  }>;
  teams?: OneOrMany<TeamRow>;
  [key: string]: unknown;
};

function normalizeGoalRows(rows: unknown[]): GoalRow[] {
  return rows.map((row) => {
    const item = row as RawGoalRow;

    const normalized: GoalRow = {
      ...item,
      players: singleRelation(item.players),
      teams: singleRelation(item.teams),
    };

    return normalized;
  });
}

function singleRelation<T>(value: OneOrMany<T>): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function normalizeMatch(row: unknown): MatchRow {
  const item = row as RawMatchRow;

  return {
    ...item,
    teams_a: singleRelation(item.teams_a),
    teams_b: singleRelation(item.teams_b),
  };
}

export default function MatchDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [match, setMatch] = useState<MatchRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [goals, setGoals] = useState<GoalRow[]>([]);

  const [participants, setParticipants] = useState<JsonRecord[]>([]);
  const [goalGroups, setGoalGroups] = useState<JsonRecord[]>([]);
  const [playerGroups, setPlayerGroups] = useState<JsonRecord[]>([]);

  const [score, setScore] = useState({
    a: "",
    b: "",
  });

  const [goal, setGoal] = useState({
    player_id: "",
    minute: "",
  });

  const [loading, setLoading] = useState(true);
  const [savingScore, setSavingScore] = useState(false);
  const [addingGoal, setAddingGoal] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  const playerOptions = useMemo(() => {
    return players.map((player) => {
      const teamName =
        player.team_id === match?.team_a_id
          ? match?.teams_a?.name
          : player.team_id === match?.team_b_id
            ? match?.teams_b?.name
            : "";

      return {
        ...player,
        label: teamName
          ? `${player.player_name} — ${teamName}`
          : player.player_name,
      };
    });
  }, [players, match]);

  async function load() {
    setLoading(true);

    const { data, error } = await supabase
      .from("matches")
      .select(
        "id,team_a_id,team_b_id,match_title,stage,match_start_at,prediction_lock_at,team_a_score,team_b_score,status,teams_a:teams!matches_home_team_id_fkey(id,name,short_name),teams_b:teams!matches_away_team_id_fkey(id,name,short_name)"
      )
      .eq("id", id)
      .single();

    if (error) {
      setLoading(false);
      return Swal.fire("Load failed", friendlyError(error), "error");
    }

    const currentMatch = normalizeMatch(data);

    setMatch(currentMatch);

    setScore({
      a:
        currentMatch.team_a_score === null ||
        currentMatch.team_a_score === undefined
          ? ""
          : String(currentMatch.team_a_score),
      b:
        currentMatch.team_b_score === null ||
        currentMatch.team_b_score === undefined
          ? ""
          : String(currentMatch.team_b_score),
    });

    if (currentMatch.team_a_id && currentMatch.team_b_id) {
      const { data: playerRows } = await supabase
        .from("players")
        .select("id,team_id,player_name,jersey_no,position,is_active")
        .in("team_id", [currentMatch.team_a_id, currentMatch.team_b_id])
        .eq("is_active", true)
        .order("player_name", { ascending: true });

      setPlayers((playerRows ?? []) as PlayerRow[]);
    }

    const [
      { data: goalRows },
      { data: participantRows },
      { data: goalGroupRows },
      { data: playerGroupRows },
    ] = await Promise.all([
      supabase
        .from("match_goals")
        .select(
          "id,match_id,player_id,team_id,minute,created_at,players(id,player_name),teams(id,name,short_name)"
        )
        .eq("match_id", id)
        .order("minute", { ascending: true }),

      supabase.rpc("get_match_participants", {
        p_match_id: id,
      }),

      supabase.rpc("get_match_goal_prediction_groups", {
        p_match_id: id,
      }),

      supabase.rpc("get_match_player_prediction_groups", {
        p_match_id: id,
      }),
    ]);

    setGoals(normalizeGoalRows(goalRows ?? []));
    setParticipants((participantRows ?? []) as JsonRecord[]);
    setGoalGroups((goalGroupRows ?? []) as JsonRecord[]);
    setPlayerGroups((playerGroupRows ?? []) as JsonRecord[]);

    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function saveScore() {
    if (score.a === "" || score.b === "") return;

    setSavingScore(true);

    const { error } = await supabase
      .from("matches")
      .update({
        team_a_score: Number(score.a),
        team_b_score: Number(score.b),
        status: "completed",
      })
      .eq("id", id);

    setSavingScore(false);

    if (error) {
      return Swal.fire("Score failed", friendlyError(error), "error");
    }

    await load();

    Swal.fire({
      title: "Saved",
      text: "Final score saved.",
      icon: "success",
      timer: 1400,
      showConfirmButton: false,
    });
  }

  async function addGoal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const selectedPlayer = players.find((p) => p.id === goal.player_id);

    if (!selectedPlayer) {
      return Swal.fire(
        "Missing player",
        "Please select a valid player.",
        "warning"
      );
    }

    setAddingGoal(true);

    const { error } = await supabase.from("match_goals").insert({
      match_id: id,
      player_id: goal.player_id,
      team_id: selectedPlayer.team_id,
      minute: goal.minute ? Number(goal.minute) : null,
    });

    setAddingGoal(false);

    if (error) {
      return Swal.fire("Goal failed", friendlyError(error), "error");
    }

    setGoal({
      player_id: "",
      minute: "",
    });

    await load();

    Swal.fire({
      title: "Added",
      text: "Goal scorer added.",
      icon: "success",
      timer: 1200,
      showConfirmButton: false,
    });
  }

  async function finalize() {
    if (score.a === "" || score.b === "") {
      return Swal.fire(
        "Score required",
        "Please enter the final score before finalizing.",
        "warning"
      );
    }

    const ok = await Swal.fire({
      title: "Finalize match?",
      text: "Predictions and winners will be calculated.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Finalize",
      confirmButtonColor: "#047857",
    });

    if (!ok.isConfirmed) return;

    setFinalizing(true);

    const { error: scoreError } = await supabase
      .from("matches")
      .update({
        team_a_score: Number(score.a),
        team_b_score: Number(score.b),
        status: "completed",
      })
      .eq("id", id);

    if (scoreError) {
      setFinalizing(false);
      return Swal.fire("Score failed", friendlyError(scoreError), "error");
    }

    const { error } = await supabase.rpc("finalize_match", {
      p_match_id: id,
    });

    setFinalizing(false);

    if (error) {
      return Swal.fire("Finalize failed", friendlyError(error), "error");
    }

    await load();

    Swal.fire({
      title: "Finalized",
      text: "Match finalized successfully.",
      icon: "success",
      timer: 1500,
      showConfirmButton: false,
    });
  }

  if (loading || !match) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  const teamAName = match.teams_a?.name ?? "Team A";
  const teamBName = match.teams_b?.name ?? "Team B";

  return (
    <section className="space-y-5">
      <div className="overflow-hidden rounded-[1.7rem] border border-slate-200 bg-white shadow-sm">
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 px-5 py-5 text-white sm:px-6">
          <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-emerald-400/20 blur-3xl" />
          <div className="absolute -bottom-20 left-20 h-44 w-44 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative">
            <Link
              href="/admin/matches"
              className="mb-4 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-black text-white hover:bg-white/15"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Matches
            </Link>

            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                  <CalendarClock className="h-3.5 w-3.5" />
                  {match.stage ?? "Fixture"} •{" "}
                  {formatDateTime(match.match_start_at)}
                </div>

                <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
                  {match.match_title || `${teamAName} vs ${teamBName}`}
                </h1>

                <p className="mt-1 text-sm text-slate-300">
                  Prediction lock: {formatDateTime(match.prediction_lock_at)}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-center">
                <p className="text-xs font-black uppercase tracking-wide text-slate-300">
                  Current Score
                </p>

                <p className="mt-1 text-3xl font-black text-white">
                  {score.a === "" ? "-" : score.a} :{" "}
                  {score.b === "" ? "-" : score.b}
                </p>

                <p className="mt-1 text-xs font-bold uppercase text-emerald-200">
                  {match.status ?? "upcoming"}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-b border-slate-100 bg-slate-50/80 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            icon={<Shield className="h-5 w-5" />}
            label="Team A"
            value={teamAName}
          />

          <SummaryCard
            icon={<Shield className="h-5 w-5" />}
            label="Team B"
            value={teamBName}
          />

          <SummaryCard
            icon={<Goal className="h-5 w-5" />}
            label="Goals Added"
            value={String(goals.length)}
          />

          <SummaryCard
            icon={<Users className="h-5 w-5" />}
            label="Participants"
            value={String(participants.length)}
          />
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-black text-slate-950">Final Score</h2>
                <p className="text-sm text-slate-500">
                  Enter the official match score.
                </p>
              </div>

              <Trophy className="h-5 w-5 text-emerald-700" />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <input
                type="number"
                min={0}
                value={score.a}
                onChange={(e) =>
                  setScore({
                    ...score,
                    a: e.target.value,
                  })
                }
                className="w-24 rounded-xl border border-slate-200 px-3 py-2.5 text-center text-lg font-black outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              />

              <span className="font-black text-slate-500">-</span>

              <input
                type="number"
                min={0}
                value={score.b}
                onChange={(e) =>
                  setScore({
                    ...score,
                    b: e.target.value,
                  })
                }
                className="w-24 rounded-xl border border-slate-200 px-3 py-2.5 text-center text-lg font-black outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              />

              <button
                onClick={saveScore}
                disabled={score.a === "" || score.b === "" || savingScore}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Save className="h-4 w-4" />
                {savingScore ? "Saving..." : "Save"}
              </button>

              <button
                onClick={finalize}
                disabled={score.a === "" || score.b === "" || finalizing}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <CheckCircle2 className="h-4 w-4" />
                {finalizing ? "Finalizing..." : "Finalize"}
              </button>
            </div>
          </div>

          <form
            onSubmit={addGoal}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-black text-slate-950">Add Goal Scorer</h2>
                <p className="text-sm text-slate-500">
                  Select a player and enter the goal minute.
                </p>
              </div>

              <Goal className="h-5 w-5 text-emerald-700" />
            </div>

            <div className="flex flex-wrap gap-3">
              <select
                required
                value={goal.player_id}
                onChange={(e) =>
                  setGoal({
                    ...goal,
                    player_id: e.target.value,
                  })
                }
                className="min-w-60 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              >
                <option value="">Select player...</option>

                {playerOptions.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.label}
                  </option>
                ))}
              </select>

              <input
                type="number"
                min={1}
                placeholder="Minute"
                value={goal.minute}
                onChange={(e) =>
                  setGoal({
                    ...goal,
                    minute: e.target.value,
                  })
                }
                className="w-32 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              />

              <button
                disabled={addingGoal}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
                {addingGoal ? "Adding..." : "Add"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <AdminTableCard
        title="Goal Scorers"
        subtitle="Official goals added for this match."
        action={
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        }
      >
        <DataTable
          data={goals}
          columns={[
            {
              header: "Scorer",
              accessor: (row) => row.players?.player_name ?? row.player_id,
            },
            {
              header: "Team",
              accessor: (row) => row.teams?.name ?? row.team_id,
            },
            {
              header: "Minute",
              accessor: "minute",
            },
          ]}
          searchPlaceholder="Search goals..."
        />
      </AdminTableCard>

      <AdminTableCard
        title="Participants"
        subtitle="Users who participated in this match prediction."
      >
        <DataTable
          data={participants.map((row, index) => ({
            id: String(row.id ?? index),
            ...row,
          }))}
          columns={[
            {
              header: "Data",
              accessor: (row) => (
                <pre className="max-w-[900px] whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
                  {JSON.stringify(row, null, 2)}
                </pre>
              ),
            },
          ]}
        />
      </AdminTableCard>

      <AdminTableCard
        title="Goal Prediction Groups"
        subtitle="Grouped prediction data for goal scorers."
      >
        <DataTable
          data={goalGroups.map((row, index) => ({
            id: String(row.id ?? index),
            ...row,
          }))}
          columns={[
            {
              header: "Data",
              accessor: (row) => (
                <pre className="max-w-[900px] whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
                  {JSON.stringify(row, null, 2)}
                </pre>
              ),
            },
          ]}
        />
      </AdminTableCard>

      <AdminTableCard
        title="Player Prediction Groups"
        subtitle="Grouped prediction data for selected players."
      >
        <DataTable
          data={playerGroups.map((row, index) => ({
            id: String(row.id ?? index),
            ...row,
          }))}
          columns={[
            {
              header: "Data",
              accessor: (row) => (
                <pre className="max-w-[900px] whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
                  {JSON.stringify(row, null, 2)}
                </pre>
              ),
            },
          ]}
        />
      </AdminTableCard>
    </section>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 inline-flex rounded-xl bg-emerald-50 p-2 text-emerald-700">
        {icon}
      </div>

      <p className="text-xs font-black uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p className="mt-1 truncate text-base font-black text-slate-950">
        {value}
      </p>
    </div>
  );
}

function AdminTableCard({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-black text-slate-950">{title}</h2>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>

        {action}
      </div>

      <div className="p-4">{children}</div>
    </div>
  );
}