// src\app\admin\mobile-matches\page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import {
  Clock3,
  CheckCircle2,
  ChevronDown,
  Loader2,
  RefreshCw,
  Search,
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
  status: string | null;
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
  status: string | null;
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
  selected_scorer_ids: string[];
};

type PickerState = {
  matchId: string;
  query: string;
} | null;

const ACTIVE_MATCH_LIMIT = 30;
const PLAYER_PAGE_SIZE = 1000;
const CLOSED_STATUS_FILTER = "(completed,finalized,cancelled)";

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

function isClosedStatus(status?: string | null) {
  const normalized = normalizedStatus(status);
  return (
    normalized === "completed" ||
    normalized === "finalized" ||
    normalized === "cancelled"
  );
}

function statusLabel(status?: string | null) {
  const normalized = normalizedStatus(status);

  if (normalized === "locked") return "Locked";
  if (normalized === "live") return "Live";
  if (normalized === "completed") return "Completed";
  if (normalized === "finalized") return "Finalized";
  if (normalized === "cancelled") return "Cancelled";

  return "Upcoming";
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

  async function loadActiveMatches(showRefreshLoader = false) {
    if (showRefreshLoader) setRefreshing(true);
    else setLoading(true);

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
      .not("status", "in", CLOSED_STATUS_FILTER)
      .order("match_start_at", { ascending: true })
      .limit(ACTIVE_MATCH_LIMIT);

    if (error) {
      setRows([]);
      setPlayersByMatch({});
      setInlineByMatch({});
      setLoading(false);
      setRefreshing(false);
      Swal.fire("Load failed", friendlyError(error), "error");
      return;
    }

    const mappedRows = ((data ?? []) as FixtureViewRow[])
      .filter((row) => !isClosedStatus(row.status))
      .map((row) => ({
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
      if (!playersByTeam.has(player.team_id)) {
        playersByTeam.set(player.team_id, []);
      }
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
    void loadActiveMatches();
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
    if (isClosedStatus(row.status)) {
      Swal.fire("Already closed", "This match is already closed.", "info");
      return;
    }

    const inline = inlineByMatch[row.id] ?? createInlineState(row);
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
        "Select at least one scorer. For 0 - 0, no scorer is needed.",
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
      html: `<b>${matchDisplayName(row)}</b><br/>Score: ${teamAScore} - ${teamBScore}<br/>Scorers: ${selectedRows.length}`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#16a34a",
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

    await loadActiveMatches(true);

    Swal.fire({
      title: "Finalized",
      text: "Match finalized successfully.",
      icon: "success",
      timer: 1400,
      showConfirmButton: false,
    });
  }

  return (
    <main className="min-h-dvh bg-slate-50 text-slate-950">
      <div className="mx-auto w-full max-w-5xl px-3 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+12px)] sm:px-5 sm:pt-5">
        <header className="sticky top-0 z-30 -mx-3 border-b border-slate-200/80 bg-slate-50/90 px-3 py-3 backdrop-blur-xl sm:static sm:mx-0 sm:rounded-3xl sm:border sm:bg-white sm:px-5 sm:shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">
                Admin Matches
              </p>
              <h1 className="mt-1 truncate text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
                Pending Final Updates
              </h1>
              <p className="mt-1 text-xs font-medium text-slate-500">
                Showing matches not completed, finalized or cancelled.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadActiveMatches(true)}
              disabled={refreshing || loading}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition active:scale-95 disabled:opacity-60"
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

        <section className="mt-4">
          {loading ? (
            <div className="flex min-h-[62dvh] items-center justify-center rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
              <LoadingSpinner />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex min-h-[62dvh] flex-col items-center justify-center rounded-[1.75rem] border border-dashed border-slate-300 bg-white px-8 text-center shadow-sm">
              <Trophy className="h-10 w-10 text-slate-300" />
              <h2 className="mt-4 text-base font-black text-slate-950">
                No pending matches
              </h2>
              <p className="mt-2 max-w-xs text-sm leading-6 text-slate-500">
                Every match is already completed, finalized or cancelled.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((row) => {
                const inline = inlineByMatch[row.id] ?? createInlineState(row);
                const selectedPlayers = (playersByMatch[row.id] ?? []).filter(
                  (player) =>
                    inline.selected_scorer_ids.includes(player.player_id),
                );
                const busy = busyMatchId === row.id;
                const closed = isClosedStatus(row.status);
                const teamAScore = parseScore(inline.team_a_score);
                const teamBScore = parseScore(inline.team_b_score);
                const validScores = teamAScore !== null && teamBScore !== null;
                const totalGoals = validScores ? teamAScore + teamBScore : 0;
                const canFinalize =
                  !closed &&
                  !busy &&
                  validScores &&
                  (totalGoals === 0 || selectedPlayers.length > 0);

                return (
                  <article
                    key={row.id}
                    className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
                  >
                    <div className="border-b border-slate-100 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-100">
                            {statusLabel(row.status)}
                          </span>

                          <h2 className="mt-2 truncate text-base font-black text-slate-950">
                            {matchDisplayName(row)}
                          </h2>

                          <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                            {row.stage || "Match"}
                          </p>
                        </div>

                        <div className="shrink-0 rounded-2xl bg-slate-50 px-2.5 py-2 text-right ring-1 ring-slate-100">
                          <Clock3 className="ml-auto h-3.5 w-3.5 text-slate-400" />
                          <p className="mt-1 max-w-[94px] text-[10px] font-bold leading-4 text-slate-500">
                            {formatDateTime(row.match_start_at)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <TeamBlock team={row.teams_a} />
                        <span className="text-[10px] font-black text-slate-300">
                          VS
                        </span>
                        <TeamBlock team={row.teams_b} alignRight />
                      </div>
                    </div>

                    <div className="space-y-3 p-4">
                      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                        <ScoreInput
                          label={shortTeamLabel(row.teams_a, "A")}
                          value={inline.team_a_score}
                          disabled={closed || busy}
                          onChange={(value) =>
                            updateInline(row.id, { team_a_score: value })
                          }
                        />

                        <span className="pb-3 text-lg font-black text-slate-300">
                          -
                        </span>

                        <ScoreInput
                          label={shortTeamLabel(row.teams_b, "B")}
                          value={inline.team_b_score}
                          disabled={closed || busy}
                          onChange={(value) =>
                            updateInline(row.id, { team_b_score: value })
                          }
                        />
                      </div>

                      <button
                        type="button"
                        disabled={closed || busy}
                        onClick={() => setPicker({ matchId: row.id, query: "" })}
                        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-left transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                            Goal scorers
                          </p>
                          <p className="mt-1 truncate text-sm font-bold text-slate-800">
                            {selectedPlayers.length === 0
                              ? "Select players"
                              : selectedPlayers
                                  .map((player) => player.player_name)
                                  .join(", ")}
                          </p>
                        </div>

                        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                      </button>

                      <button
                        type="button"
                        disabled={!canFinalize}
                        onClick={() => void finalizeMatch(row)}
                        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        {busy ? "Finalizing..." : "Finalize"}
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
      className={`flex min-w-0 items-center gap-2 ${
        alignRight ? "justify-end text-right" : ""
      }`}
    >
      {!alignRight && <TeamAvatar team={team} />}

      <div className="min-w-0">
        <p className="truncate text-sm font-black text-slate-950">
          {shortTeamLabel(team)}
        </p>
        <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-400">
          {team.name}
        </p>
      </div>

      {alignRight && <TeamAvatar team={team} />}
    </div>
  );
}

function TeamAvatar({ team }: { team: TeamMini }) {
  return (
    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-xs font-black text-slate-700 ring-1 ring-slate-200">
      {initials(team.short_name || team.name)}
    </span>
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
      <span className="mb-1.5 block truncate text-xs font-black text-slate-500">
        {label}
      </span>

      <input
        type="number"
        min={0}
        inputMode="numeric"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-2xl border border-slate-200 bg-white text-center text-2xl font-black text-slate-950 outline-none transition placeholder:text-slate-300 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
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
    <div className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm">
      <div className="mx-auto flex h-dvh w-full max-w-md flex-col bg-slate-50 text-slate-950 shadow-2xl">
        <div className="border-b border-slate-200 bg-white px-4 pb-3 pt-[calc(env(safe-area-inset-top)+14px)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">
                Goal Scorers
              </p>
              <h2 className="mt-1 truncate text-lg font-black text-slate-950">
                {matchDisplayName(row)}
              </h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {selectedCount} selected • {allPlayers.length} players
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 active:scale-95"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search player..."
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-950 outline-none placeholder:text-slate-400"
              autoFocus
            />
            {query && (
              <button
                type="button"
                onClick={() => onQueryChange("")}
                className="text-slate-400"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {players.length === 0 ? (
            <div className="flex min-h-[45dvh] flex-col items-center justify-center rounded-[1.75rem] border border-dashed border-slate-300 bg-white px-8 text-center">
              <p className="text-sm font-black text-slate-950">No players found</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Clear the search or refresh if players are missing.
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

        <div className="border-t border-slate-200 bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-3">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onClear}
              className="h-12 rounded-2xl border border-slate-200 bg-white text-sm font-black text-slate-700 active:scale-[0.99]"
            >
              Clear
            </button>

            <button
              type="button"
              onClick={onClose}
              className="h-12 rounded-2xl bg-slate-950 text-sm font-black text-white active:scale-[0.99]"
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
        <h3 className="truncate text-xs font-black uppercase tracking-[0.14em] text-slate-400">
          {title}
        </h3>
        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-slate-500 ring-1 ring-slate-200">
          {players.length}
        </span>
      </div>

      <div className="space-y-2">
        {players.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-5 text-center text-xs font-semibold text-slate-400">
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
                    ? "border-emerald-300 bg-emerald-50 text-slate-950"
                    : "border-slate-200 bg-white text-slate-800"
                }`}
              >
                <span
                  className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                    selected
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-slate-300 bg-white text-transparent"
                  }`}
                >
                  <CheckCircle2 className="h-4 w-4" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black">
                    {player.player_name}
                  </p>
                  <p className="mt-0.5 truncate text-xs font-semibold text-slate-400">
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
