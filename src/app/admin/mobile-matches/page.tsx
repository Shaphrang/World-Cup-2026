// src\app\admin\mobile-matches\page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import {
  CheckCircle2,
  ChevronDown,
  Clock3,
  Loader2,
  RefreshCw,
  Save,
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

type InlineMatchState = {
  team_a_score: string;
  team_b_score: string;
  status: string;
  selected_scorer_ids: string[];
};

type PickerState = {
  matchId: string;
  query: string;
} | null;

const ACTIVE_MATCH_LIMIT = 30;
const PLAYER_PAGE_SIZE = 1000;
const SCORE_OPTIONS = Array.from({ length: 11 }, (_, index) => String(index));
const EDITABLE_STATUS_OPTIONS = [
  { value: "upcoming", label: "Upcoming" },
  { value: "locked", label: "Locked" },
  { value: "live", label: "Live" },
  { value: "completed", label: "Completed" },
];

function scoreToInput(value: number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

function parseScore(value: string) {
  const cleanValue = value.trim();

  if (!/^\d+$/.test(cleanValue)) return null;

  const score = Number(cleanValue);
  if (score < 0 || score > 10) return null;

  return score;
}

function normalizedStatus(status?: string | null) {
  return String(status ?? "upcoming").toLowerCase();
}

function editableStatus(status?: string | null) {
  const normalized = normalizedStatus(status);

  if (
    normalized === "upcoming" ||
    normalized === "locked" ||
    normalized === "live" ||
    normalized === "completed"
  ) {
    return normalized;
  }

  return "upcoming";
}

function isClosedStatus(status?: string | null) {
  const normalized = normalizedStatus(status);
  return normalized === "finalized" || normalized === "cancelled";
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

function statusChipClass(status?: string | null) {
  const normalized = normalizedStatus(status);

  if (normalized === "completed") {
    return "bg-amber-100 text-amber-800 ring-amber-200";
  }

  if (normalized === "live") {
    return "bg-rose-100 text-rose-700 ring-rose-200";
  }

  if (normalized === "locked") {
    return "bg-indigo-100 text-indigo-700 ring-indigo-200";
  }

  return "bg-emerald-100 text-emerald-700 ring-emerald-200";
}

function shortTeamLabel(team?: TeamMini | null, fallback = "Team") {
  if (!team) return fallback;
  return team.short_name || team.name || fallback;
}

function fixtureTeamName(team?: TeamMini | null, fallback = "Team") {
  if (!team) return fallback;
  return team.name || team.short_name || fallback;
}

function matchDisplayName(row: MatchRow) {
  if (row.match_title?.trim()) return row.match_title;
  return `${fixtureTeamName(row.teams_a, "Team A")} vs ${fixtureTeamName(
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
): InlineMatchState {
  return {
    team_a_score: scoreToInput(row.team_a_score),
    team_b_score: scoreToInput(row.team_b_score),
    status: editableStatus(row.status),
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
    Record<string, InlineMatchState>
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
      .or("status.is.null,status.not.in.(finalized,cancelled)")
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

    const inlineMap: Record<string, InlineMatchState> = {};

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

  function updateInline(matchId: string, patch: Partial<InlineMatchState>) {
    setInlineByMatch((current) => ({
      ...current,
      [matchId]: {
        ...(current[matchId] ?? {
          team_a_score: "",
          team_b_score: "",
          status: "upcoming",
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
        status: "upcoming",
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

  async function saveMatchUpdate(row: MatchRow, finalize = false) {
    if (isClosedStatus(row.status)) {
      Swal.fire("Already closed", "This match is already finalized or cancelled.", "info");
      return;
    }

    const inline = inlineByMatch[row.id] ?? createInlineState(row);
    const nextStatus = finalize ? "completed" : editableStatus(inline.status);
    const hasTeamAScore = inline.team_a_score.trim() !== "";
    const hasTeamBScore = inline.team_b_score.trim() !== "";
    const hasAnyScore = hasTeamAScore || hasTeamBScore;
    const scoreRequired = finalize || nextStatus === "completed";

    if ((scoreRequired || hasAnyScore) && (!hasTeamAScore || !hasTeamBScore)) {
      Swal.fire(
        "Score required",
        "Select score for both teams.",
        "warning",
      );
      return;
    }

    const teamAScore = hasTeamAScore ? parseScore(inline.team_a_score) : null;
    const teamBScore = hasTeamBScore ? parseScore(inline.team_b_score) : null;

    if ((scoreRequired || hasAnyScore) && (teamAScore === null || teamBScore === null)) {
      Swal.fire(
        "Invalid score",
        "Scores must be selected between 0 and 10.",
        "warning",
      );
      return;
    }

    const shouldSaveScore = scoreRequired || hasAnyScore;
    const totalGoals = shouldSaveScore ? Number(teamAScore) + Number(teamBScore) : 0;
    const selectedScorerIds = inline.selected_scorer_ids;
    const players = playersByMatch[row.id] ?? [];
    const selectedRows = selectedScorerIds
      .map((playerId) =>
        players.find((player) => player.player_id === playerId),
      )
      .filter((player): player is MatchPlayerRow => Boolean(player));

    if (shouldSaveScore && selectedRows.length !== selectedScorerIds.length) {
      Swal.fire(
        "Invalid scorer",
        "One or more selected scorers are not valid for this match. Refresh and select again.",
        "warning",
      );
      return;
    }

    if (shouldSaveScore && totalGoals === 0 && selectedScorerIds.length > 0) {
      Swal.fire(
        "Check scorers",
        "For a 0 - 0 match, remove all goal scorers.",
        "warning",
      );
      return;
    }

    if (scoreRequired && totalGoals > 0 && selectedScorerIds.length === 0) {
      Swal.fire(
        "Goal scorer required",
        "Select at least one scorer. For 0 - 0, no scorer is needed.",
        "warning",
      );
      return;
    }

    if (finalize) {
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
    }

    setBusyMatchId(row.id);

    const updatePayload: {
      status: string;
      team_a_score?: number;
      team_b_score?: number;
    } = {
      status: nextStatus,
    };

    if (shouldSaveScore && teamAScore !== null && teamBScore !== null) {
      updatePayload.team_a_score = teamAScore;
      updatePayload.team_b_score = teamBScore;
    }

    const { error: scoreError } = await supabase
      .from("matches")
      .update(updatePayload)
      .eq("id", row.id);

    if (scoreError) {
      setBusyMatchId(null);
      Swal.fire("Update failed", friendlyError(scoreError), "error");
      return;
    }

    if (shouldSaveScore) {
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
    }

    if (finalize) {
      const { error: finalizeError } = await supabase.rpc("finalize_match", {
        p_match_id: row.id,
      });

      if (finalizeError) {
        setBusyMatchId(null);
        Swal.fire("Finalize failed", friendlyError(finalizeError), "error");
        return;
      }
    }

    setBusyMatchId(null);
    await loadActiveMatches(true);

    Swal.fire({
      title: finalize ? "Finalized" : "Saved",
      text: finalize
        ? "Match finalized successfully."
        : "Match update saved successfully.",
      icon: "success",
      timer: 1200,
      showConfirmButton: false,
    });
  }

  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_top_left,#dcfce7_0,#f8fafc_35%,#e0f2fe_100%)] text-slate-950">
      <div className="mx-auto w-full max-w-6xl px-3 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+12px)] sm:px-5 sm:pt-5">
        <header className="sticky top-0 z-30 -mx-3 border-b border-white/70 bg-white/75 px-3 py-3 shadow-sm backdrop-blur-xl sm:static sm:mx-0 sm:rounded-[2rem] sm:border sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">
                Admin Panel
              </p>
              <h1 className="mt-1 truncate text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
                Match Updates
              </h1>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Upcoming, live and completed matches pending finalization.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadActiveMatches(true)}
              disabled={refreshing || loading}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-sky-500 text-white shadow-lg shadow-emerald-500/20 transition active:scale-95 disabled:opacity-60"
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
            <div className="flex min-h-[62dvh] items-center justify-center rounded-[1.75rem] border border-white/70 bg-white/80 shadow-sm backdrop-blur">
              <LoadingSpinner />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex min-h-[62dvh] flex-col items-center justify-center rounded-[1.75rem] border border-dashed border-emerald-200 bg-white/80 px-8 text-center shadow-sm backdrop-blur">
              <Trophy className="h-10 w-10 text-emerald-300" />
              <h2 className="mt-4 text-base font-black text-slate-950">
                No pending matches
              </h2>
              <p className="mt-2 max-w-xs text-sm leading-6 text-slate-500">
                All visible matches are finalized or cancelled.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
                    className="overflow-hidden rounded-[1.65rem] border border-white/70 bg-white/85 shadow-[0_18px_55px_rgba(15,23,42,0.08)] backdrop-blur transition hover:-translate-y-0.5 hover:shadow-[0_22px_70px_rgba(15,23,42,0.12)]"
                  >
                    <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-sky-600 px-4 py-3 text-white">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/70">
                            Fixture
                          </p>
                          <p className="mt-1 truncate text-xs font-bold text-white/90">
                            {row.stage || "Match"}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1.5 text-[10px] font-black text-white ring-1 ring-white/20">
                          <Clock3 className="h-3 w-3" />
                          <span className="max-w-[108px] truncate">
                            {formatDateTime(row.match_start_at)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 bg-gradient-to-br from-white via-emerald-50/60 to-sky-50/70 p-4">
                      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
                        <FixtureTeamCard team={row.teams_a} />
                        <div className="flex items-center justify-center px-1 text-[10px] font-black text-slate-400">
                          VS
                        </div>
                        <FixtureTeamCard team={row.teams_b} alignRight />
                      </div>

                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-[1.25rem] border border-white/80 bg-white/80 p-2 shadow-sm">
                        <ScoreSelect
                          value={inline.team_a_score}
                          disabled={closed || busy}
                          onChange={(value) =>
                            updateInline(row.id, { team_a_score: value })
                          }
                        />

                        <span className="px-1 text-lg font-black text-slate-300">
                          -
                        </span>

                        <ScoreSelect
                          value={inline.team_b_score}
                          disabled={closed || busy}
                          onChange={(value) =>
                            updateInline(row.id, { team_b_score: value })
                          }
                        />
                      </div>

                      <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                        <StatusSelect
                          value={inline.status}
                          disabled={closed || busy}
                          onChange={(status) => updateInline(row.id, { status })}
                        />

                        <span
                          className={`inline-flex h-11 items-center justify-center rounded-2xl px-3 text-[10px] font-black uppercase tracking-wide ring-1 ${statusChipClass(
                            inline.status,
                          )}`}
                        >
                          {statusLabel(inline.status)}
                        </span>
                      </div>

                      <button
                        type="button"
                        disabled={closed || busy}
                        onClick={() => setPicker({ matchId: row.id, query: "" })}
                        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/80 px-3 py-3 text-left shadow-sm transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <div className="min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
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

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          disabled={closed || busy}
                          onClick={() => void saveMatchUpdate(row, false)}
                          className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-white px-3 text-xs font-black text-slate-800 shadow-sm ring-1 ring-slate-200 transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {busy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                          Save
                        </button>

                        <button
                          type="button"
                          disabled={!canFinalize}
                          onClick={() => void saveMatchUpdate(row, true)}
                          className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-slate-950 to-slate-800 px-3 text-xs font-black text-white shadow-lg shadow-slate-950/15 transition active:scale-[0.99] disabled:cursor-not-allowed disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 disabled:shadow-none"
                        >
                          {busy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4" />
                          )}
                          Finalize
                        </button>
                      </div>
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

function FixtureTeamCard({
  team,
  alignRight = false,
}: {
  team: TeamMini;
  alignRight?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 items-center gap-2 rounded-[1.2rem] border border-white/80 bg-white/75 px-3 py-3 shadow-sm ${
        alignRight ? "justify-end text-right" : ""
      }`}
    >
      {!alignRight && <TeamAvatar team={team} />}

      <p className="min-w-0 truncate text-sm font-black text-slate-950">
        {fixtureTeamName(team)}
      </p>

      {alignRight && <TeamAvatar team={team} />}
    </div>
  );
}

function TeamAvatar({ team }: { team: TeamMini }) {
  return (
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-sky-500 text-[10px] font-black text-white shadow-sm">
      {initials(team.short_name || team.name)}
    </span>
  );
}

function ScoreSelect({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="h-12 w-full appearance-none rounded-2xl border border-slate-200 bg-white px-3 text-center text-2xl font-black text-slate-950 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
    >
      <option value="">—</option>
      {SCORE_OPTIONS.map((score) => (
        <option key={score} value={score}>
          {score}
        </option>
      ))}
    </select>
  );
}

function StatusSelect({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (status: string) => void;
}) {
  return (
    <select
      value={editableStatus(value)}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="h-11 w-full appearance-none rounded-2xl border border-white/80 bg-white/85 px-3 text-sm font-black text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
    >
      {EDITABLE_STATUS_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
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
      <div className="mx-auto flex h-dvh w-full max-w-md flex-col bg-[radial-gradient(circle_at_top_left,#dcfce7_0,#f8fafc_42%,#e0f2fe_100%)] text-slate-950 shadow-2xl">
        <div className="border-b border-white/70 bg-white/80 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+14px)] backdrop-blur-xl">
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
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm active:scale-95"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-white/80 bg-white/85 px-3 py-2.5 shadow-sm">
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
            <div className="flex min-h-[45dvh] flex-col items-center justify-center rounded-[1.75rem] border border-dashed border-emerald-200 bg-white/80 px-8 text-center shadow-sm">
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

        <div className="border-t border-white/70 bg-white/80 px-4 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-3 backdrop-blur-xl">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onClear}
              className="h-12 rounded-2xl border border-slate-200 bg-white text-sm font-black text-slate-700 shadow-sm active:scale-[0.99]"
            >
              Clear
            </button>

            <button
              type="button"
              onClick={onClose}
              className="h-12 rounded-2xl bg-gradient-to-r from-emerald-600 to-sky-600 text-sm font-black text-white shadow-lg shadow-emerald-500/20 active:scale-[0.99]"
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
        <h3 className="truncate text-xs font-black uppercase tracking-[0.14em] text-slate-500">
          {title}
        </h3>
        <span className="rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-black text-slate-500 ring-1 ring-slate-200">
          {players.length}
        </span>
      </div>

      <div className="space-y-2">
        {players.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 px-4 py-5 text-center text-xs font-semibold text-slate-400">
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
                className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left shadow-sm transition active:scale-[0.99] ${
                  selected
                    ? "border-emerald-300 bg-emerald-50 text-slate-950"
                    : "border-white/80 bg-white/85 text-slate-800"
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
