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
  RefreshCw,
  Shield,
  Trophy,
  Users,
} from "lucide-react";

import { supabase } from "@/lib/supabaseClient";
import { LoadingSpinner } from "@/components/admin/LoadingSpinner";
import { friendlyError, formatDateTime } from "@/lib/supabaseHelpers";

type TeamRow = {
  id: string;
  name: string;
  short_name?: string | null;
};

type MatchRow = {
  id: string;
  match_title: string | null;
  stage: string | null;

  team_a_id: string;
  team_a_name: string | null;
  team_a_short_name: string | null;

  team_b_id: string;
  team_b_name: string | null;
  team_b_short_name: string | null;

  match_start_at: string;
  prediction_lock_at: string;

  team_a_score: number | null;
  team_b_score: number | null;
  status: string;
};

type MatchPlayerRow = {
  match_id: string;
  player_id: string;
  player_name: string;
  jersey_no: number | null;
  position: string | null;
  team_id: string;
  team_name: string | null;
  team_short_name: string | null;
};

type MatchGoalRow = {
  id: string;
  match_id: string;
  player_id: string | null;
  team_id: string;
};

type ParticipantRow = {
  prediction_id: string;
  match_id: string;
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;

  predicted_team_a_score: number;
  predicted_team_b_score: number;
  predicted_total_goals: number;

  predicted_player_id: string | null;
  predicted_player_name: string | null;

  exact_score_points: number;
  total_goals_points: number;
  player_points: number;
  points_total: number;

  is_evaluated: boolean;
  created_at: string;
};

function shortTeamName(name?: string | null, shortName?: string | null) {
  return shortName || name || "Team";
}

function statusClass(status?: string | null) {
  switch (status) {
    case "finalized":
      return "bg-emerald-100 text-emerald-700 ring-emerald-200";
    case "completed":
      return "bg-blue-100 text-blue-700 ring-blue-200";
    case "live":
      return "bg-rose-100 text-rose-700 ring-rose-200";
    case "locked":
      return "bg-amber-100 text-amber-700 ring-amber-200";
    case "cancelled":
      return "bg-slate-200 text-slate-600 ring-slate-300";
    default:
      return "bg-cyan-100 text-cyan-700 ring-cyan-200";
  }
}

function predictionLabel(row: ParticipantRow, teamA: string, teamB: string) {
  return `${teamA} ${row.predicted_team_a_score} - ${row.predicted_team_b_score} ${teamB}`;
}

export default function MatchDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [match, setMatch] = useState<MatchRow | null>(null);
  const [players, setPlayers] = useState<MatchPlayerRow[]>([]);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);

  const [score, setScore] = useState({
    a: "",
    b: "",
  });

  const [selectedScorerIds, setSelectedScorerIds] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(false);

  const isFinalized = match?.status === "finalized";

  const teamAName = match?.team_a_name ?? "Team A";
  const teamBName = match?.team_b_name ?? "Team B";

  const teamAShortName = shortTeamName(
    match?.team_a_name,
    match?.team_a_short_name
  );

  const teamBShortName = shortTeamName(
    match?.team_b_name,
    match?.team_b_short_name
  );

  const teamAPlayers = useMemo(() => {
    return players.filter((player) => player.team_id === match?.team_a_id);
  }, [players, match?.team_a_id]);

  const teamBPlayers = useMemo(() => {
    return players.filter((player) => player.team_id === match?.team_b_id);
  }, [players, match?.team_b_id]);

  const selectedScorers = useMemo(() => {
    const selectedSet = new Set(selectedScorerIds);

    return players.filter((player) => selectedSet.has(player.player_id));
  }, [players, selectedScorerIds]);

  async function load() {
    setLoading(true);

    const { data: matchData, error: matchError } = await supabase
      .from("fixtures_view")
      .select(
        `
        id,
        match_title,
        stage,
        team_a_id,
        team_a_name,
        team_a_short_name,
        team_b_id,
        team_b_name,
        team_b_short_name,
        match_start_at,
        prediction_lock_at,
        team_a_score,
        team_b_score,
        status
      `
      )
      .eq("id", id)
      .single();

    if (matchError) {
      setLoading(false);
      return Swal.fire("Load failed", friendlyError(matchError), "error");
    }

    const currentMatch = matchData as MatchRow;

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

    const [{ data: playerRows }, { data: goalRows }, { data: participantRows }] =
      await Promise.all([
        supabase
          .from("match_players_view")
          .select(
            `
            match_id,
            player_id,
            player_name,
            jersey_no,
            position,
            team_id,
            team_name,
            team_short_name
          `
          )
          .eq("match_id", id)
          .order("player_name", { ascending: true }),

        supabase
          .from("match_goals")
          .select("id,match_id,player_id,team_id")
          .eq("match_id", id),

        supabase.rpc("get_match_participants", {
          p_match_id: id,
        }),
      ]);

    setPlayers((playerRows ?? []) as MatchPlayerRow[]);

    const existingScorerIds = ((goalRows ?? []) as MatchGoalRow[])
      .map((goal) => goal.player_id)
      .filter((playerId): playerId is string => Boolean(playerId));

    setSelectedScorerIds([...new Set(existingScorerIds)]);

    setParticipants((participantRows ?? []) as ParticipantRow[]);

    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function toggleScorer(playerId: string) {
    if (isFinalized) return;

    setSelectedScorerIds((current) => {
      if (current.includes(playerId)) {
        return current.filter((idValue) => idValue !== playerId);
      }

      return [...current, playerId];
    });
  }

  async function finalize() {
    if (isFinalized) {
      return Swal.fire(
        "Already finalized",
        "This match has already been finalized.",
        "info"
      );
    }

    if (score.a === "" || score.b === "") {
      return Swal.fire(
        "Score required",
        "Please enter the final score before finalizing.",
        "warning"
      );
    }

    const teamAScore = Number(score.a);
    const teamBScore = Number(score.b);

    if (Number.isNaN(teamAScore) || Number.isNaN(teamBScore)) {
      return Swal.fire("Invalid score", "Score must be a valid number.", "warning");
    }

    if (teamAScore < 0 || teamBScore < 0) {
      return Swal.fire("Invalid score", "Score cannot be negative.", "warning");
    }

    if (teamAScore + teamBScore > 0 && selectedScorerIds.length === 0) {
      return Swal.fire(
        "Goal scorer required",
        "Please select at least one goal scorer before finalizing.",
        "warning"
      );
    }

    const ok = await Swal.fire({
      title: "Finalize match?",
      text: "This will save the final score, save selected goal scorers, and calculate prediction points.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Finalize",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#047857",
    });

    if (!ok.isConfirmed) return;

    setFinalizing(true);

    const { error: scoreError } = await supabase
      .from("matches")
      .update({
        team_a_score: teamAScore,
        team_b_score: teamBScore,
        status: "completed",
      })
      .eq("id", id);

    if (scoreError) {
      setFinalizing(false);
      return Swal.fire("Score failed", friendlyError(scoreError), "error");
    }

    const { error: deleteGoalError } = await supabase
      .from("match_goals")
      .delete()
      .eq("match_id", id);

    if (deleteGoalError) {
      setFinalizing(false);
      return Swal.fire(
        "Goal scorer failed",
        friendlyError(deleteGoalError),
        "error"
      );
    }

    if (selectedScorerIds.length > 0) {
      const selectedRows = selectedScorerIds
        .map((playerId) => players.find((player) => player.player_id === playerId))
        .filter((player): player is MatchPlayerRow => Boolean(player))
        .map((player) => ({
          match_id: id,
          player_id: player.player_id,
          team_id: player.team_id,
        }));

      const { error: insertGoalError } = await supabase
        .from("match_goals")
        .insert(selectedRows);

      if (insertGoalError) {
        setFinalizing(false);
        return Swal.fire(
          "Goal scorer failed",
          friendlyError(insertGoalError),
          "error"
        );
      }
    }

    const { error: finalizeError } = await supabase.rpc("finalize_match", {
      p_match_id: id,
    });

    setFinalizing(false);

    if (finalizeError) {
      return Swal.fire("Finalize failed", friendlyError(finalizeError), "error");
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

  return (
    <section className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 px-5 py-5 text-white">
          <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-emerald-400/20 blur-3xl" />
          <div className="absolute -bottom-20 left-20 h-44 w-44 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative">
            <Link
              href="/admin/matches"
              className="mb-4 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs font-medium text-white transition hover:bg-white/15"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Matches
            </Link>

            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-medium text-emerald-100">
                  <CalendarClock className="h-3.5 w-3.5" />
                  {match.stage ?? "Fixture"} • {formatDateTime(match.match_start_at)}
                </div>

                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  {match.match_title || `${teamAName} vs ${teamBName}`}
                </h1>

                <p className="mt-1 text-sm text-slate-300">
                  Prediction lock: {formatDateTime(match.prediction_lock_at)}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-center">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-300">
                  Final Score
                </p>

                <p className="mt-1 text-3xl font-semibold text-white">
                  {score.a === "" ? "-" : score.a} :{" "}
                  {score.b === "" ? "-" : score.b}
                </p>

                <span
                  className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide ring-1 ${statusClass(
                    match.status
                  )}`}
                >
                  {match.status ?? "upcoming"}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 border-b border-slate-100 bg-slate-50/80 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            icon={<Shield className="h-4 w-4" />}
            label="Team A"
            value={teamAName}
          />

          <SummaryCard
            icon={<Shield className="h-4 w-4" />}
            label="Team B"
            value={teamBName}
          />

          <SummaryCard
            icon={<Goal className="h-4 w-4" />}
            label="Goal Scorers"
            value={String(selectedScorerIds.length)}
          />

          <SummaryCard
            icon={<Users className="h-4 w-4" />}
            label="Participants"
            value={String(participants.length)}
          />
        </div>

        <div className="p-4">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-4 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-sm font-semibold text-slate-950">
                  Final Score & Goal Scorers
                </h2>

                <p className="mt-0.5 text-xs text-slate-500">
                  Select all players who scored at least once. No minute is required.
                </p>
              </div>

              <Trophy className="h-5 w-5 text-emerald-700" />
            </div>

            <div className="grid gap-5 p-4 lg:grid-cols-[320px_1fr]">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Official Score
                </p>

                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="mb-1 block text-[11px] font-medium text-slate-500">
                      {teamAShortName}
                    </label>

                    <input
                      type="number"
                      min={0}
                      value={score.a}
                      disabled={isFinalized}
                      onChange={(event) =>
                        setScore({
                          ...score,
                          a: event.target.value,
                        })
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-lg font-semibold text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </div>

                  <span className="pt-5 text-sm font-medium text-slate-400">-</span>

                  <div className="flex-1">
                    <label className="mb-1 block text-[11px] font-medium text-slate-500">
                      {teamBShortName}
                    </label>

                    <input
                      type="number"
                      min={0}
                      value={score.b}
                      disabled={isFinalized}
                      onChange={(event) =>
                        setScore({
                          ...score,
                          b: event.target.value,
                        })
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-lg font-semibold text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </div>
                </div>

                <button
                  onClick={finalize}
                  disabled={
                    isFinalized || score.a === "" || score.b === "" || finalizing
                  }
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {isFinalized
                    ? "Finalized"
                    : finalizing
                      ? "Finalizing..."
                      : "Finalize Match"}
                </button>

                {selectedScorers.length > 0 && (
                  <div className="mt-4 rounded-lg bg-white p-3 ring-1 ring-slate-200">
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      Selected Scorers
                    </p>

                    <div className="flex flex-wrap gap-1.5">
                      {selectedScorers.map((player) => (
                        <span
                          key={player.player_id}
                          className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-100"
                        >
                          {player.player_name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <ScorerPanel
                  title={teamAName}
                  players={teamAPlayers}
                  selectedScorerIds={selectedScorerIds}
                  disabled={isFinalized}
                  onToggle={toggleScorer}
                />

                <ScorerPanel
                  title={teamBName}
                  players={teamBPlayers}
                  selectedScorerIds={selectedScorerIds}
                  disabled={isFinalized}
                  onToggle={toggleScorer}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <ParticipantsTableCard
        participants={participants}
        teamAShortName={teamAShortName}
        teamBShortName={teamBShortName}
        onRefresh={() => void load()}
      />
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
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 inline-flex rounded-lg bg-emerald-50 p-2 text-emerald-700">
        {icon}
      </div>

      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p className="mt-1 truncate text-sm font-semibold text-slate-950">
        {value}
      </p>
    </div>
  );
}

function ScorerPanel({
  title,
  players,
  selectedScorerIds,
  disabled,
  onToggle,
}: {
  title: string;
  players: MatchPlayerRow[];
  selectedScorerIds: string[];
  disabled: boolean;
  onToggle: (playerId: string) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-950">{title}</h3>

        <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-500">
          {players.length} players
        </span>
      </div>

      {players.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
          No players found.
        </div>
      ) : (
        <div className="grid max-h-[340px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {players.map((player) => {
            const selected = selectedScorerIds.includes(player.player_id);

            return (
              <button
                key={player.player_id}
                type="button"
                disabled={disabled}
                onClick={() => onToggle(player.player_id)}
                className={`rounded-lg border px-3 py-2 text-left transition disabled:cursor-not-allowed ${
                  selected
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium">{player.player_name}</p>

                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {player.position || "Player"}
                      {player.jersey_no ? ` • #${player.jersey_no}` : ""}
                    </p>
                  </div>

                  <span
                    className={`mt-0.5 h-3.5 w-3.5 rounded-full border ${
                      selected
                        ? "border-emerald-600 bg-emerald-600"
                        : "border-slate-300 bg-white"
                    }`}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ParticipantsTableCard({
  participants,
  teamAShortName,
  teamBShortName,
  onRefresh,
}: {
  participants: ParticipantRow[];
  teamAShortName: string;
  teamBShortName: string;
  onRefresh: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">Participants</h2>

          <p className="mt-0.5 text-xs text-slate-500">
            Simple list of users with their score prediction and goal scorer
            prediction.
          </p>
        </div>

        <button
          onClick={onRefresh}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          type="button"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {participants.length === 0 ? (
        <div className="flex min-h-[180px] items-center justify-center bg-white px-4 text-center">
          <div>
            <Users className="mx-auto mb-3 h-7 w-7 text-slate-300" />

            <p className="text-sm font-medium text-slate-800">
              No participants yet
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Predictions will appear here after users submit.
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5">Participant</th>
                <th className="px-3 py-2.5">Prediction</th>
                <th className="px-3 py-2.5">Goal Scorer</th>
                <th className="px-3 py-2.5">Points</th>
                <th className="px-3 py-2.5">Submitted</th>
                <th className="px-3 py-2.5">Status</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 bg-white">
              {participants.map((row) => (
                <tr key={row.prediction_id} className="transition hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                        {(row.full_name || "P").charAt(0).toUpperCase()}
                      </div>

                      <div>
                        <p className="text-xs font-medium text-slate-900">
                          {row.full_name || "Participant"}
                        </p>

                        <p className="text-[11px] text-slate-400">
                          Total goals: {row.predicted_total_goals}
                        </p>
                      </div>
                    </div>
                  </td>

                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200">
                      {predictionLabel(row, teamAShortName, teamBShortName)}
                    </span>
                  </td>

                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                    {row.predicted_player_name || "—"}
                  </td>

                  <td className="whitespace-nowrap px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-100">
                        {row.points_total} pts
                      </span>

                      {row.is_evaluated && (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200">
                          Score {row.exact_score_points} • Goals{" "}
                          {row.total_goals_points} • Scorer {row.player_points}
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">
                    {formatDateTime(row.created_at)}
                  </td>

                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide ring-1 ${
                        row.is_evaluated
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                          : "bg-amber-50 text-amber-700 ring-amber-100"
                      }`}
                    >
                      {row.is_evaluated ? "Evaluated" : "Submitted"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}