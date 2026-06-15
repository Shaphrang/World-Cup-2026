"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Swal from "sweetalert2";
import {
  CheckCircle2,
  ChevronDown,
  Clock3,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Trophy,
  X,
} from "lucide-react";

import { LoadingSpinner } from "@/components/admin/LoadingSpinner";
import { supabase } from "@/lib/supabaseClient";
import { formatDateTime, friendlyError } from "@/lib/supabaseHelpers";

type TeamMini = {
  id: string;
  name: string;
  short_name?: string | null;
};

type FixtureViewRow = {
  id: string;
  match_title: string | null;
  stage: string | null;
  team_a_id: string | null;
  team_a_name: string | null;
  team_a_short_name: string | null;
  team_b_id: string | null;
  team_b_name: string | null;
  team_b_short_name: string | null;
  match_start_at: string;
  prediction_lock_at: string | null;
  team_a_score: number | null;
  team_b_score: number | null;
  status: string;
};

type MatchRow = {
  id: string;
  match_title: string | null;
  stage: string | null;
  team_a_id: string | null;
  team_b_id: string | null;
  match_start_at: string;
  prediction_lock_at: string | null;
  team_a_score: number | null;
  team_b_score: number | null;
  status: string;
  teams_a: TeamMini;
  teams_b: TeamMini;
};

type PlayerRow = {
  id: string;
  team_id: string;
  player_name: string;
  jersey_no: number | null;
  position: string | null;
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

type InlineFinalizeState = {
  team_a_score: string;
  team_b_score: string;
  status: string;
  selected_scorer_ids: string[];
};

type PickerState = {
  matchId: string;
  query: string;
} | null;

const QUICK_MATCH_LIMIT = 10;
const PLAYER_PAGE_SIZE = 1000;
const CURRENT_MATCH_BUFFER_HOURS = 4;

const STATUS_OPTIONS = [
  { value: "upcoming", label: "Upcoming" },
  { value: "locked", label: "Locked" },
  { value: "live", label: "Live" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

function scoreToInput(value: number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

function parseScore(value: string) {
  const cleanValue = value.trim();

  if (!/^\d+$/.test(cleanValue)) return null;

  return Number(cleanValue);
}

function normalizedStatus(status?: string | null) {
  return String(status ?? "upcoming").toLowerCase();
}

function isReadOnlyStatus(status?: string | null) {
  const normalized = normalizedStatus(status);
  return normalized === "finalized" || normalized === "cancelled";
}

function isCompletedLike(status?: string | null) {
  const normalized = normalizedStatus(status);
  return normalized === "completed" || normalized === "finalized";
}

function shortTeamLabel(team?: TeamMini | null, fallback = "Team") {
  if (!team) return fallback;
  return team.short_name || team.name || fallback;
}

function matchDisplayName(row: MatchRow) {
  if (row.match_title?.trim()) return row.match_title;
  return `${shortTeamLabel(row.teams_a, "Team A")} vs ${shortTeamLabel(
    row.teams_b,
    "Team B",
  )}`;
}

function initials(value?: string | null) {
  const cleanValue = String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9 ]/g, "");

  if (!cleanValue) return "TM";

  const parts = cleanValue.split(/\s+/).filter(Boolean);

  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function createInlineState(
  row: MatchRow,
  selectedScorerIds: string[] = [],
): InlineFinalizeState {
  return {
    team_a_score: scoreToInput(row.team_a_score),
    team_b_score: scoreToInput(row.team_b_score),
    status: row.status || "upcoming",
    selected_scorer_ids: selectedScorerIds,
  };
}

async function fetchAllActivePlayersForTeams(teamIds: string[]) {
  const uniqueTeamIds = Array.from(new Set(teamIds.filter(Boolean)));

  if (uniqueTeamIds.length === 0) {
    return { data: [] as PlayerRow[], error: null as any };
  }

  const allPlayers: PlayerRow[] = [];
  let from = 0;

  while (true) {
    const to = from + PLAYER_PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from("players")
      .select("id,team_id,player_name,jersey_no,position")
      .in("team_id", uniqueTeamIds)
      .eq("is_active", true)
      .order("team_id", { ascending: true })
      .order("player_name", { ascending: true })
      .range(from, to);

    if (error) {
      return { data: allPlayers, error };
    }

    const page = (data ?? []) as PlayerRow[];
    allPlayers.push(...page);

    if (page.length < PLAYER_PAGE_SIZE) break;

    from += PLAYER_PAGE_SIZE;
  }

  return { data: allPlayers, error: null as any };
}

export default function MobileMatchUpdatePage() {
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [playersByMatch, setPlayersByMatch] = useState<
    Record<string, MatchPlayerRow[]>
  >({});
  const [inlineByMatch, setInlineByMatch] = useState<
    Record<string, InlineFinalizeState>
  >({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyMatchId, setBusyMatchId] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerState>(null);

  async function loadQuickMatches(showRefreshLoader = false) {
    if (showRefreshLoader) setRefreshing(true);
    else setLoading(true);

    const activeFrom = new Date(
      Date.now() - CURRENT_MATCH_BUFFER_HOURS * 60 * 60 * 1000,
    ).toISOString();

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
        team_b_id,
        team_b_name,
        team_b_short_name,
        match_start_at,
        prediction_lock_at,
        team_a_score,
        team_b_score,
        status
      `,
      )
      .gte("match_start_at", activeFrom)
      .not("status", "in", "(finalized,cancelled)")
      .order("match_start_at", { ascending: true })
      .limit(QUICK_MATCH_LIMIT);

    if (error) {
      setRows([]);
      setPlayersByMatch({});
      setInlineByMatch({});
      setLoading(false);
      setRefreshing(false);
      Swal.fire("Load failed", friendlyError(error), "error");
      return;
    }

    const mappedRows = ((data ?? []) as FixtureViewRow[]).map((row) => ({
      id: row.id,
      match_title: row.match_title,
      stage: row.stage,
      team_a_id: row.team_a_id,
      team_b_id: row.team_b_id,
      match_start_at: row.match_start_at,
      prediction_lock_at: row.prediction_lock_at,
      team_a_score: row.team_a_score,
      team_b_score: row.team_b_score,
      status: row.status,
      teams_a: {
        id: row.team_a_id ?? "",
        name: row.team_a_name ?? "Team A",
        short_name: row.team_a_short_name,
      },
      teams_b: {
        id: row.team_b_id ?? "",
        name: row.team_b_name ?? "Team B",
        short_name: row.team_b_short_name,
      },
    })) as MatchRow[];

    setRows(mappedRows);

    const matchIds = mappedRows.map((row) => row.id);

    if (matchIds.length === 0) {
      setPlayersByMatch({});
      setInlineByMatch({});
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const teamIds = mappedRows
      .flatMap((row) => [row.team_a_id, row.team_b_id])
      .filter((teamId): teamId is string => Boolean(teamId));

    const [playersResult, goalsResult] = await Promise.all([
      fetchAllActivePlayersForTeams(teamIds),
      supabase
        .from("match_goals")
        .select("id,match_id,player_id,team_id")
        .in("match_id", matchIds),
    ]);

    if (playersResult.error) {
      Swal.fire(
        "Players load failed",
        friendlyError(playersResult.error),
        "error",
      );
    }

    if (goalsResult.error) {
      Swal.fire(
        "Goal scorers load failed",
        friendlyError(goalsResult.error),
        "error",
      );
    }

    const playersByTeam = new Map<string, PlayerRow[]>();

    playersResult.data.forEach((player) => {
      if (!playersByTeam.has(player.team_id))
        playersByTeam.set(player.team_id, []);
      playersByTeam.get(player.team_id)?.push(player);
    });

    const playerMap: Record<string, MatchPlayerRow[]> = {};

    mappedRows.forEach((row) => {
      const teamAPlayers = row.team_a_id
        ? (playersByTeam.get(row.team_a_id) ?? [])
        : [];
      const teamBPlayers = row.team_b_id
        ? (playersByTeam.get(row.team_b_id) ?? [])
        : [];

      playerMap[row.id] = [...teamAPlayers, ...teamBPlayers].map((player) => ({
        match_id: row.id,
        player_id: player.id,
        player_name: player.player_name,
        jersey_no: player.jersey_no,
        position: player.position,
        team_id: player.team_id,
        team_name:
          player.team_id === row.team_a_id
            ? row.teams_a.name
            : row.teams_b.name,
        team_short_name:
          player.team_id === row.team_a_id
            ? (row.teams_a.short_name ?? null)
            : (row.teams_b.short_name ?? null),
      }));
    });

    const goalMap: Record<string, string[]> = {};

    ((goalsResult.data ?? []) as MatchGoalRow[]).forEach((goal) => {
      if (!goal.player_id) return;
      if (!goalMap[goal.match_id]) goalMap[goal.match_id] = [];
      if (!goalMap[goal.match_id].includes(goal.player_id)) {
        goalMap[goal.match_id].push(goal.player_id);
      }
    });

    const inlineMap: Record<string, InlineFinalizeState> = {};

    mappedRows.forEach((row) => {
      inlineMap[row.id] = createInlineState(row, goalMap[row.id] ?? []);
    });

    setPlayersByMatch(playerMap);
    setInlineByMatch(inlineMap);
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    void loadQuickMatches();
  }, []);

  const pickerMatch = useMemo(() => {
    if (!picker) return null;
    return rows.find((row) => row.id === picker.matchId) ?? null;
  }, [picker, rows]);

  const pickerPlayers = useMemo(() => {
    if (!picker) return [];

    const query = picker.query.trim().toLowerCase();
    const players = playersByMatch[picker.matchId] ?? [];

    if (!query) return players;

    return players.filter((player) => {
      return [
        player.player_name,
        player.position,
        player.jersey_no,
        player.team_name,
        player.team_short_name,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [picker, playersByMatch]);

  function updateInline(matchId: string, patch: Partial<InlineFinalizeState>) {
    setInlineByMatch((current) => ({
      ...current,
      [matchId]: {
        ...(current[matchId] ?? {
          team_a_score: "",
          team_b_score: "",
          status: "completed",
          selected_scorer_ids: [],
        }),
        ...patch,
      },
    }));
  }

  function toggleScorer(matchId: string, playerId: string) {
    setInlineByMatch((current) => {
      const state = current[matchId] ?? {
        team_a_score: "",
        team_b_score: "",
        status: "completed",
        selected_scorer_ids: [],
      };

      const selected = state.selected_scorer_ids.includes(playerId)
        ? state.selected_scorer_ids.filter((idValue) => idValue !== playerId)
        : [...state.selected_scorer_ids, playerId];

      return {
        ...current,
        [matchId]: {
          ...state,
          selected_scorer_ids: selected,
        },
      };
    });
  }

  function clearScorers(matchId: string) {
    updateInline(matchId, { selected_scorer_ids: [] });
  }

  async function finalizeMatch(row: MatchRow) {
    if (isReadOnlyStatus(row.status)) {
      Swal.fire(
        "Disabled",
        "This match cannot be updated from mobile.",
        "info",
      );
      return;
    }

    const inline = inlineByMatch[row.id] ?? createInlineState(row);

    if (inline.status !== "completed") {
      Swal.fire(
        "Set status to Completed",
        "Choose Completed before finalizing the match.",
        "warning",
      );
      return;
    }

    const teamAScore = parseScore(inline.team_a_score);
    const teamBScore = parseScore(inline.team_b_score);

    if (teamAScore === null || teamBScore === null) {
      Swal.fire(
        "Final score required",
        "Enter valid non-negative scores for both teams.",
        "warning",
      );
      return;
    }

    const totalGoals = teamAScore + teamBScore;
    const selectedScorerIds = inline.selected_scorer_ids;

    if (totalGoals === 0 && selectedScorerIds.length > 0) {
      Swal.fire(
        "Check scorers",
        "For a 0 - 0 match, remove all goal scorers before finalizing.",
        "warning",
      );
      return;
    }

    if (totalGoals > 0 && selectedScorerIds.length === 0) {
      Swal.fire(
        "Goal scorer required",
        "Select at least one actual goal scorer. If the match is 0 - 0, no scorer is needed.",
        "warning",
      );
      return;
    }

    const players = playersByMatch[row.id] ?? [];
    const selectedRows = selectedScorerIds
      .map((playerId) =>
        players.find((player) => player.player_id === playerId),
      )
      .filter((player): player is MatchPlayerRow => Boolean(player));

    if (selectedRows.length !== selectedScorerIds.length) {
      Swal.fire(
        "Invalid scorer",
        "One or more selected scorers are not valid for this match. Refresh and select again.",
        "warning",
      );
      return;
    }

    const confirm = await Swal.fire({
      title: "Finalize match?",
      html: `<b>${matchDisplayName(row)}</b><br/>Final score: ${teamAScore} - ${teamBScore}<br/>Scorers: ${selectedRows.length}`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#059669",
      confirmButtonText: "Finalize",
      cancelButtonText: "Cancel",
    });

    if (!confirm.isConfirmed) return;

    setBusyMatchId(row.id);

    const { error: scoreError } = await supabase
      .from("matches")
      .update({
        team_a_score: teamAScore,
        team_b_score: teamBScore,
        status: "completed",
      })
      .eq("id", row.id);

    if (scoreError) {
      setBusyMatchId(null);
      Swal.fire("Score failed", friendlyError(scoreError), "error");
      return;
    }

    const { error: deleteGoalError } = await supabase
      .from("match_goals")
      .delete()
      .eq("match_id", row.id);

    if (deleteGoalError) {
      setBusyMatchId(null);
      Swal.fire("Goal scorer failed", friendlyError(deleteGoalError), "error");
      return;
    }

    if (selectedRows.length > 0) {
      const goalRows = selectedRows.map((player) => ({
        match_id: row.id,
        player_id: player.player_id,
        team_id: player.team_id,
      }));

      const { error: insertGoalError } = await supabase
        .from("match_goals")
        .insert(goalRows);

      if (insertGoalError) {
        setBusyMatchId(null);
        Swal.fire(
          "Goal scorer failed",
          friendlyError(insertGoalError),
          "error",
        );
        return;
      }
    }

    const { error: finalizeError } = await supabase.rpc("finalize_match", {
      p_match_id: row.id,
    });

    setBusyMatchId(null);

    if (finalizeError) {
      Swal.fire("Finalize failed", friendlyError(finalizeError), "error");
      return;
    }

    await loadQuickMatches(true);

    Swal.fire({
      title: "Finalized",
      text: "Match finalized successfully.",
      icon: "success",
      timer: 1500,
      showConfirmButton: false,
    });
  }

  return (
    <main className="min-h-dvh bg-slate-950 text-white">
      <div className="mx-auto min-h-dvh w-full max-w-md bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.22),_transparent_34%),linear-gradient(180deg,#020617_0%,#0f172a_46%,#020617_100%)] pb-[calc(env(safe-area-inset-bottom)+24px)]">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/85 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+14px)] backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200">
                <ShieldCheck className="h-3 w-3" />
                Mobile Admin
              </div>

              <h1 className="mt-3 text-xl font-black tracking-tight text-white">
                Quick Match Update
              </h1>

              <p className="mt-1 max-w-[260px] text-xs leading-5 text-slate-400">
                Next {QUICK_MATCH_LIMIT} matches only. Update score, scorers and
                finalize fast.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadQuickMatches(true)}
              disabled={refreshing || loading}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-white shadow-lg shadow-black/20 backdrop-blur transition active:scale-95 disabled:opacity-60"
              title="Refresh"
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </button>
          </div>
        </header>

        <section className="px-4 py-4">
          {loading ? (
            <div className="flex min-h-[65dvh] items-center justify-center rounded-[2rem] border border-white/10 bg-white/[0.04]">
              <LoadingSpinner />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex min-h-[65dvh] flex-col items-center justify-center rounded-[2rem] border border-dashed border-white/15 bg-white/[0.04] px-8 text-center">
              <Trophy className="h-10 w-10 text-slate-500" />
              <h2 className="mt-4 text-base font-bold text-white">
                No upcoming matches
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                There are no active matches in the quick mobile queue.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {rows.map((row, index) => {
                const inline = inlineByMatch[row.id] ?? createInlineState(row);
                const selectedPlayers = (playersByMatch[row.id] ?? []).filter(
                  (player) =>
                    inline.selected_scorer_ids.includes(player.player_id),
                );
                const busy = busyMatchId === row.id;
                const readOnly = isReadOnlyStatus(row.status);
                const completedTone = isCompletedLike(
                  inline.status || row.status,
                );
                const canFinalize =
                  !readOnly &&
                  !busy &&
                  inline.status === "completed" &&
                  inline.team_a_score.trim() !== "" &&
                  inline.team_b_score.trim() !== "";

                return (
                  <article
                    key={row.id}
                    className={`overflow-hidden rounded-[1.75rem] border shadow-2xl shadow-black/20 transition ${
                      completedTone
                        ? "border-emerald-300/20 bg-slate-900"
                        : "border-white/10 bg-white/[0.07] backdrop-blur"
                    }`}
                  >
                    <div className="border-b border-white/10 p-4">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-white/10 px-2 text-[10px] font-black text-slate-200 ring-1 ring-white/10">
                              {index + 1}
                            </span>

                            <span
                              className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ${
                                completedTone
                                  ? "bg-emerald-400/10 text-emerald-200 ring-emerald-300/15"
                                  : "bg-cyan-400/10 text-cyan-200 ring-cyan-300/15"
                              }`}
                            >
                              {inline.status || row.status || "upcoming"}
                            </span>
                          </div>

                          <h2 className="mt-3 truncate text-base font-black tracking-tight text-white">
                            {matchDisplayName(row)}
                          </h2>

                          <p className="mt-1 text-xs font-medium text-slate-400">
                            {row.stage || "Match"}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            <Clock3 className="h-3 w-3" />
                            Start
                          </div>
                          <p className="mt-1 max-w-[112px] text-[11px] font-semibold leading-4 text-slate-300">
                            {formatDateTime(row.match_start_at)}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                        <TeamBlock team={row.teams_a} />
                        <span className="text-xs font-black text-slate-500">
                          VS
                        </span>
                        <TeamBlock team={row.teams_b} alignRight />
                      </div>
                    </div>

                    <div className="space-y-4 p-4">
                      <div>
                        <SectionLabel>Final Score</SectionLabel>

                        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
                          <ScoreInput
                            label={shortTeamLabel(row.teams_a, "A")}
                            value={inline.team_a_score}
                            disabled={readOnly || busy}
                            onChange={(value) =>
                              updateInline(row.id, { team_a_score: value })
                            }
                          />

                          <span className="pb-3 text-xl font-black text-slate-500">
                            -
                          </span>

                          <ScoreInput
                            label={shortTeamLabel(row.teams_b, "B")}
                            value={inline.team_b_score}
                            disabled={readOnly || busy}
                            onChange={(value) =>
                              updateInline(row.id, { team_b_score: value })
                            }
                          />
                        </div>
                      </div>

                      <div>
                        <SectionLabel>Goal Scorers</SectionLabel>

                        <button
                          type="button"
                          disabled={readOnly || busy}
                          onClick={() =>
                            setPicker({ matchId: row.id, query: "" })
                          }
                          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-white">
                              {selectedPlayers.length === 0
                                ? "Select actual scorers"
                                : `${selectedPlayers.length} scorer${
                                    selectedPlayers.length > 1 ? "s" : ""
                                  } selected`}
                            </p>

                            <p className="mt-1 truncate text-xs text-slate-400">
                              {selectedPlayers.length === 0
                                ? "Multiple players allowed"
                                : selectedPlayers
                                    .map((player) => player.player_name)
                                    .join(", ")}
                            </p>
                          </div>

                          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                        </button>
                      </div>

                      <div>
                        <SectionLabel>Set Status</SectionLabel>

                        <select
                          value={inline.status}
                          disabled={readOnly || busy}
                          onChange={(event) =>
                            updateInline(row.id, { status: event.target.value })
                          }
                          className="h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-sm font-bold text-white outline-none transition focus:border-emerald-300/40 focus:ring-4 focus:ring-emerald-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {STATUS_OPTIONS.map((status) => (
                            <option
                              key={status.value}
                              value={status.value}
                              className="bg-slate-950 text-white"
                            >
                              {status.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        type="button"
                        disabled={!canFinalize}
                        onClick={() => void finalizeMatch(row)}
                        className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-4 text-sm font-black text-emerald-950 shadow-xl shadow-emerald-950/30 transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        {busy ? "Finalizing..." : "Finalize Match"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {picker && pickerMatch && (
        <PlayerPickerSheet
          row={pickerMatch}
          players={pickerPlayers}
          allPlayers={playersByMatch[picker.matchId] ?? []}
          query={picker.query}
          selectedIds={inlineByMatch[picker.matchId]?.selected_scorer_ids ?? []}
          onQueryChange={(query) => setPicker({ ...picker, query })}
          onClose={() => setPicker(null)}
          onClear={() => clearScorers(picker.matchId)}
          onToggle={(playerId) => toggleScorer(picker.matchId, playerId)}
        />
      )}
    </main>
  );
}

function TeamBlock({
  team,
  alignRight = false,
}: {
  team: TeamMini;
  alignRight?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 ${alignRight ? "justify-end" : ""}`}
    >
      {!alignRight && <TeamAvatar team={team} />}

      <div className={alignRight ? "text-right" : ""}>
        <p className="truncate text-sm font-black text-white">
          {shortTeamLabel(team)}
        </p>
        <p className="mt-0.5 max-w-[118px] truncate text-[10px] font-medium text-slate-500">
          {team.name}
        </p>
      </div>

      {alignRight && <TeamAvatar team={team} />}
    </div>
  );
}

function TeamAvatar({ team }: { team: TeamMini }) {
  return (
    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-xs font-black text-white shadow-inner">
      {initials(team.short_name || team.name)}
    </span>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
      {children}
    </p>
  );
}

function ScoreInput({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block truncate text-xs font-bold text-slate-400">
        {label}
      </span>

      <input
        type="number"
        min={0}
        inputMode="numeric"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-14 w-full rounded-2xl border border-white/10 bg-black/30 text-center text-2xl font-black text-white outline-none transition placeholder:text-slate-700 focus:border-emerald-300/40 focus:ring-4 focus:ring-emerald-400/10 disabled:cursor-not-allowed disabled:opacity-50"
        placeholder="0"
      />
    </label>
  );
}

function PlayerPickerSheet({
  row,
  players,
  allPlayers,
  query,
  selectedIds,
  onQueryChange,
  onClose,
  onClear,
  onToggle,
}: {
  row: MatchRow;
  players: MatchPlayerRow[];
  allPlayers: MatchPlayerRow[];
  query: string;
  selectedIds: string[];
  onQueryChange: (query: string) => void;
  onClose: () => void;
  onClear: () => void;
  onToggle: (playerId: string) => void;
}) {
  const teamAPlayers = players.filter(
    (player) => player.team_id === row.team_a_id,
  );
  const teamBPlayers = players.filter(
    (player) => player.team_id === row.team_b_id,
  );
  const selectedCount = selectedIds.length;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm">
      <div className="mx-auto flex h-dvh w-full max-w-md flex-col bg-slate-950 text-white shadow-2xl">
        <div className="border-b border-white/10 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+14px)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">
                Goal Scorers
              </p>
              <h2 className="mt-1 truncate text-lg font-black text-white">
                {matchDisplayName(row)}
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                {selectedCount} selected • {allPlayers.length} players loaded
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-white active:scale-95"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-slate-500" />
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search player, position or jersey..."
              className="min-w-0 flex-1 bg-transparent text-sm font-medium text-white outline-none placeholder:text-slate-600"
              autoFocus
            />
            {query && (
              <button
                type="button"
                onClick={() => onQueryChange("")}
                className="text-slate-500"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {players.length === 0 ? (
            <div className="flex min-h-[45dvh] flex-col items-center justify-center rounded-[2rem] border border-dashed border-white/15 bg-white/[0.04] px-8 text-center">
              <p className="text-sm font-bold text-white">No players found</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Clear the search or refresh the page if players are missing.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <PlayerGroup
                title={shortTeamLabel(row.teams_a, "Team A")}
                players={teamAPlayers}
                selectedIds={selectedIds}
                onToggle={onToggle}
              />

              <PlayerGroup
                title={shortTeamLabel(row.teams_b, "Team B")}
                players={teamBPlayers}
                selectedIds={selectedIds}
                onToggle={onToggle}
              />
            </div>
          )}
        </div>

        <div className="border-t border-white/10 bg-slate-950 px-4 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-3">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onClear}
              className="h-12 rounded-2xl border border-white/10 bg-white/10 text-sm font-black text-white active:scale-[0.99]"
            >
              Clear
            </button>

            <button
              type="button"
              onClick={onClose}
              className="h-12 rounded-2xl bg-emerald-500 text-sm font-black text-emerald-950 active:scale-[0.99]"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayerGroup({
  title,
  players,
  selectedIds,
  onToggle,
}: {
  title: string;
  players: MatchPlayerRow[];
  selectedIds: string[];
  onToggle: (playerId: string) => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="truncate text-xs font-black uppercase tracking-[0.16em] text-slate-500">
          {title}
        </h3>
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-slate-300 ring-1 ring-white/10">
          {players.length}
        </span>
      </div>

      <div className="space-y-2">
        {players.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.04] px-4 py-5 text-center text-xs text-slate-500">
            No players
          </div>
        ) : (
          players.map((player) => {
            const selected = selectedIds.includes(player.player_id);

            return (
              <button
                key={player.player_id}
                type="button"
                onClick={() => onToggle(player.player_id)}
                className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition active:scale-[0.99] ${
                  selected
                    ? "border-emerald-300/40 bg-emerald-400/10 text-white"
                    : "border-white/10 bg-white/[0.04] text-slate-200"
                }`}
              >
                <span
                  className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                    selected
                      ? "border-emerald-300 bg-emerald-400 text-emerald-950"
                      : "border-white/15 bg-black/20 text-transparent"
                  }`}
                >
                  <CheckCircle2 className="h-4 w-4" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">
                    {player.player_name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {player.position || "Player"}
                    {player.jersey_no ? ` • #${player.jersey_no}` : ""}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
