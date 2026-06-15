"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import Swal from "sweetalert2";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Eye,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
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
  created_at: string | null;
  updated_at: string | null;
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

type PlayerRow = {
  id: string;
  team_id: string;
  player_name: string;
  jersey_no: number | null;
  position: string | null;
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

const STATUS_OPTIONS = [
  { value: "upcoming", label: "Upcoming" },
  { value: "locked", label: "Locked" },
  { value: "live", label: "Live" },
  { value: "completed", label: "Completed" },
  { value: "finalized", label: "Finalized" },
  { value: "cancelled", label: "Cancelled" },
];

const INLINE_STATUS_OPTIONS = [
  { value: "upcoming", label: "Upcoming" },
  { value: "locked", label: "Locked" },
  { value: "live", label: "Live" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const UPCOMING_INLINE_ENABLED_COUNT = 5;
const PLAYER_PAGE_SIZE = 1000;

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

function matchDisplayName(row: MatchRow) {
  if (row.match_title?.trim()) return row.match_title;

  return `${shortTeamLabel(row.teams_a, "Team A")} vs ${shortTeamLabel(
    row.teams_b,
    "Team B"
  )}`;
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

function normalizedStatus(status?: string | null) {
  return String(status ?? "upcoming").toLowerCase();
}

function isCompletedMatch(row: MatchRow) {
  const status = normalizedStatus(row.status);

  return status === "completed" || status === "finalized";
}

function isCancelledMatch(row: MatchRow) {
  return normalizedStatus(row.status) === "cancelled";
}

function isFutureMatch(row: MatchRow, now = Date.now()) {
  return new Date(row.match_start_at).getTime() > now;
}

function getNextEnabledUpcomingIds(rows: MatchRow[], now = Date.now()) {
  return new Set(
    [...rows]
      .sort(sortByStartDateAsc)
      .filter((row) => {
        return (
          isFutureMatch(row, now) &&
          !isCompletedMatch(row) &&
          !isCancelledMatch(row)
        );
      })
      .slice(0, UPCOMING_INLINE_ENABLED_COUNT)
      .map((row) => row.id)
  );
}

function canUseInlineControls(row: MatchRow, nextEnabledUpcomingIds: Set<string>) {
  if (isCompletedMatch(row) || isCancelledMatch(row)) return false;

  // Future matches are protected: only the next 5 upcoming matches can be edited
  // from the table. Past/current unfinished matches remain editable so admin can
  // enter the final result after the game ends.
  if (isFutureMatch(row)) return nextEnabledUpcomingIds.has(row.id);

  return true;
}

function arrangeNextFiveFirst(rows: MatchRow[]) {
  const now = Date.now();
  const sorted = [...rows].sort(sortByStartDateAsc);
  const nextFiveIds = getNextEnabledUpcomingIds(sorted, now);

  const nextFive = sorted.filter((row) => nextFiveIds.has(row.id));
  const rest = sorted.filter((row) => !nextFiveIds.has(row.id));

  return [...nextFive, ...rest];
}

function scoreToInput(value: number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

function parseScore(value: string) {
  const cleanValue = value.trim();

  if (!/^\d+$/.test(cleanValue)) return null;

  return Number(cleanValue);
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

function createInlineState(
  row: MatchRow,
  selectedScorerIds: string[] = []
): InlineFinalizeState {
  return {
    team_a_score: scoreToInput(row.team_a_score),
    team_b_score: scoreToInput(row.team_b_score),
    status: row.status || "upcoming",
    selected_scorer_ids: selectedScorerIds,
  };
}

export default function Matches() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [playersByMatch, setPlayersByMatch] = useState<
    Record<string, MatchPlayerRow[]>
  >({});
  const [inlineByMatch, setInlineByMatch] = useState<
    Record<string, InlineFinalizeState>
  >({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyMatchId, setBusyMatchId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [openScorerMatchId, setOpenScorerMatchId] = useState<string | null>(null);

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
    setOpenScorerMatchId(null);

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
        status,
        created_at,
        updated_at
      `
      )
      .order("match_start_at", { ascending: true });

    if (error) {
      setRows([]);
      setPlayersByMatch({});
      setInlineByMatch({});
      setLoading(false);
      Swal.fire("Load failed", friendlyError(error), "error");
      return;
    }

    const mappedRows = ((data ?? []) as FixtureViewRow[]).map((row) => ({
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
      Swal.fire("Players load failed", friendlyError(playersResult.error), "error");
    }

    if (goalsResult.error) {
      Swal.fire("Goal scorers load failed", friendlyError(goalsResult.error), "error");
    }

    const playersByTeam = new Map<string, PlayerRow[]>();

    playersResult.data.forEach((player) => {
      if (!playersByTeam.has(player.team_id)) playersByTeam.set(player.team_id, []);
      playersByTeam.get(player.team_id)?.push(player);
    });

    const playerMap: Record<string, MatchPlayerRow[]> = {};

    mappedRows.forEach((row) => {
      const teamAPlayers = row.team_a_id ? playersByTeam.get(row.team_a_id) ?? [] : [];
      const teamBPlayers = row.team_b_id ? playersByTeam.get(row.team_b_id) ?? [] : [];

      playerMap[row.id] = [...teamAPlayers, ...teamBPlayers].map((player) => ({
        match_id: row.id,
        player_id: player.id,
        player_name: player.player_name,
        jersey_no: player.jersey_no,
        position: player.position,
        team_id: player.team_id,
        team_name:
          player.team_id === row.team_a_id
            ? row.teams_a?.name ?? null
            : row.teams_b?.name ?? null,
        team_short_name:
          player.team_id === row.team_a_id
            ? row.teams_a?.short_name ?? null
            : row.teams_b?.short_name ?? null,
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

  const nextFiveIds = useMemo(() => getNextEnabledUpcomingIds(rows), [rows]);

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
      team_a_score: scoreToInput(row.team_a_score),
      team_b_score: scoreToInput(row.team_b_score),
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

  function updateInline(
    matchId: string,
    patch: Partial<InlineFinalizeState>
  ) {
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

  function toggleInlineScorer(matchId: string, playerId: string) {
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

  function clearInlineScorers(matchId: string) {
    updateInline(matchId, { selected_scorer_ids: [] });
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
      Swal.fire(
        "Invalid Teams",
        "Team A and Team B cannot be the same.",
        "warning"
      );
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

  async function finalizeInlineMatch(row: MatchRow) {
    if (isCompletedMatch(row)) {
      Swal.fire(
        "Disabled",
        "Completed or finalized matches are read-only from the table.",
        "info"
      );
      return;
    }

    if (!canUseInlineControls(row, nextFiveIds)) {
      Swal.fire(
        "Disabled",
        "Only the next 5 upcoming matches can be updated from the table. The rest are protected.",
        "info"
      );
      return;
    }

    const inline = inlineByMatch[row.id] ?? createInlineState(row);

    if (inline.status !== "completed") {
      Swal.fire(
        "Set status to Completed",
        "Choose Completed in the row status dropdown before finalizing.",
        "warning"
      );
      return;
    }

    const teamAScore = parseScore(inline.team_a_score);
    const teamBScore = parseScore(inline.team_b_score);

    if (teamAScore === null || teamBScore === null) {
      Swal.fire(
        "Final score required",
        "Please enter valid non-negative final scores for both teams.",
        "warning"
      );
      return;
    }

    const totalGoals = teamAScore + teamBScore;
    const selectedScorerIds = inline.selected_scorer_ids;

    if (totalGoals > 0 && selectedScorerIds.length === 0) {
      Swal.fire(
        "Goal scorer required",
        "Please select at least one actual goal scorer. If the match is 0 - 0, no scorer is required.",
        "warning"
      );
      return;
    }

    const players = playersByMatch[row.id] ?? [];
    const selectedRows = selectedScorerIds
      .map((playerId) => players.find((player) => player.player_id === playerId))
      .filter((player): player is MatchPlayerRow => Boolean(player));

    if (selectedScorerIds.length !== selectedRows.length) {
      Swal.fire(
        "Invalid scorer",
        "One or more selected scorers are not valid for this match. Refresh and select again.",
        "warning"
      );
      return;
    }

    const confirm = await Swal.fire({
      title: "Finalize match?",
      text: `This will save ${teamAScore} - ${teamBScore}, save selected scorers, and calculate prediction points.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#047857",
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
        Swal.fire("Goal scorer failed", friendlyError(insertGoalError), "error");
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

    await loadMatches();

    Swal.fire({
      title: "Finalized",
      text: "Match finalized successfully.",
      icon: "success",
      timer: 1500,
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
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-emerald-600">
              <CalendarDays className="h-3.5 w-3.5" />
              Admin Matches
            </div>

            <h1 className="text-xl font-semibold tracking-tight text-slate-950">
              Matches
            </h1>

            <p className="mt-0.5 text-xs text-slate-500">
              Enter final score, actual scorers and finalize directly from the table.
            </p>
          </div>

          <button
            onClick={startAdd}
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-medium text-white transition hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            Add Match
          </button>
        </div>

        <div className="grid gap-2 border-b border-slate-100 px-4 py-3 sm:grid-cols-[1fr_170px_auto] sm:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search match, team or status..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-8 text-xs text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />

            {search && (
              <button
                onClick={() => setSearch("")}
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
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
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="flex min-h-[260px] items-center justify-center">
              <LoadingSpinner />
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-center">
              <p className="text-sm font-semibold text-slate-900">No matches found</p>
              <p className="mt-1 text-xs text-slate-500">
                Try changing the search or status filter.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-[1480px] w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-3 font-medium">Match</th>
                      <th className="px-3 py-3 font-medium">Start</th>
                      <th className="px-3 py-3 font-medium">Lock</th>
                      <th className="px-3 py-3 font-medium">Final Score</th>
                      <th className="px-3 py-3 font-medium">Goal Scorers</th>
                      <th className="px-3 py-3 font-medium">Set Status</th>
                      <th className="px-3 py-3 font-medium">Finalize</th>
                      <th className="px-3 py-3 font-medium">Status</th>
                      <th className="px-3 py-3 text-right font-medium">Actions</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredRows.map((row) => {
                      const isNextFive = nextFiveIds.has(row.id);
                      const completedMatch = isCompletedMatch(row);
                      const cancelledMatch = isCancelledMatch(row);
                      const inline = inlineByMatch[row.id] ?? createInlineState(row);
                      const players = playersByMatch[row.id] ?? [];
                      const isBusy = busyMatchId === row.id;
                      const inlineEnabled = canUseInlineControls(row, nextFiveIds);
                      const controlsDisabled = !inlineEnabled || isBusy;
                      const protectedUpcoming =
                        isFutureMatch(row) &&
                        !isNextFive &&
                        !completedMatch &&
                        !cancelledMatch;
                      const canClickFinalize =
                        inlineEnabled &&
                        !isBusy &&
                        inline.status === "completed" &&
                        inline.team_a_score.trim() !== "" &&
                        inline.team_b_score.trim() !== "";

                      const rowClass = completedMatch
                        ? "bg-slate-950 hover:bg-slate-900"
                        : protectedUpcoming
                          ? "bg-slate-50/80 opacity-70 hover:bg-slate-100"
                          : isNextFive
                            ? "bg-emerald-50/40 hover:bg-emerald-50/70"
                            : "hover:bg-slate-50";

                      const mainTextClass = completedMatch
                        ? "text-white"
                        : "text-slate-900";

                      const mutedTextClass = completedMatch
                        ? "text-slate-300"
                        : "text-slate-500";

                      const softTextClass = completedMatch
                        ? "text-slate-400"
                        : "text-slate-400";

                      const inputClassName = completedMatch
                        ? "h-8 w-14 rounded-lg border border-slate-700 bg-slate-900 px-2 text-center text-xs font-semibold text-slate-300 outline-none transition disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900 disabled:text-slate-500"
                        : "h-8 w-14 rounded-lg border border-slate-200 bg-white px-2 text-center text-xs font-semibold text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

                      const selectClassName = completedMatch
                        ? "h-8 min-w-[130px] rounded-lg border border-slate-700 bg-slate-900 px-2 text-[11px] font-medium text-slate-300 outline-none transition disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900 disabled:text-slate-500"
                        : "h-8 min-w-[130px] rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

                      return (
                        <tr key={row.id} className={`transition ${rowClass}`}>
                          <td className="px-3 py-3 align-top">
                            <div className="min-w-[220px]">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className={`text-xs font-medium ${mainTextClass}`}>
                                  {matchDisplayName(row)}
                                </p>

                                {isNextFive && !completedMatch && (
                                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700">
                                    Enabled
                                  </span>
                                )}

                                {protectedUpcoming && (
                                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">
                                    Locked
                                  </span>
                                )}

                                {completedMatch && (
                                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-200 ring-1 ring-white/10">
                                    Completed
                                  </span>
                                )}
                              </div>

                              <p className={`mt-1 text-[11px] font-normal ${mutedTextClass}`}>
                                {shortTeamLabel(row.teams_a, "Team A")} vs{" "}
                                {shortTeamLabel(row.teams_b, "Team B")}
                              </p>

                              {row.stage && (
                                <p className={`mt-1 text-[11px] ${softTextClass}`}>
                                  {row.stage}
                                </p>
                              )}
                            </div>
                          </td>

                          <td className={`whitespace-nowrap px-3 py-3 align-top font-normal ${mutedTextClass}`}>
                            {formatDateTime(row.match_start_at)}
                          </td>

                          <td className={`whitespace-nowrap px-3 py-3 align-top font-normal ${mutedTextClass}`}>
                            {row.prediction_lock_at
                              ? formatDateTime(row.prediction_lock_at)
                              : "—"}
                          </td>

                          <td className="px-3 py-3 align-top">
                            <div className="flex min-w-[150px] items-center gap-1.5">
                              <div>
                                <p className={`mb-1 text-[10px] font-medium ${softTextClass}`}>
                                  {shortTeamLabel(row.teams_a, "A")}
                                </p>
                                <input
                                  aria-label="Team A final score"
                                  type="number"
                                  min={0}
                                  value={inline.team_a_score}
                                  disabled={controlsDisabled}
                                  onChange={(event) =>
                                    updateInline(row.id, {
                                      team_a_score: event.target.value,
                                    })
                                  }
                                  className={inputClassName}
                                />
                              </div>

                              <span className={`pt-5 text-xs font-semibold ${softTextClass}`}>
                                -
                              </span>

                              <div>
                                <p className={`mb-1 text-[10px] font-medium ${softTextClass}`}>
                                  {shortTeamLabel(row.teams_b, "B")}
                                </p>
                                <input
                                  aria-label="Team B final score"
                                  type="number"
                                  min={0}
                                  value={inline.team_b_score}
                                  disabled={controlsDisabled}
                                  onChange={(event) =>
                                    updateInline(row.id, {
                                      team_b_score: event.target.value,
                                    })
                                  }
                                  className={inputClassName}
                                />
                              </div>
                            </div>
                          </td>

                          <td className="px-3 py-3 align-top">
                            <ScorerDropdown
                              row={row}
                              players={players}
                              selectedIds={inline.selected_scorer_ids}
                              open={openScorerMatchId === row.id}
                              disabled={controlsDisabled}
                              onOpenChange={(nextOpen) =>
                                setOpenScorerMatchId(nextOpen ? row.id : null)
                              }
                              onToggle={(playerId) =>
                                toggleInlineScorer(row.id, playerId)
                              }
                              onClear={() => clearInlineScorers(row.id)}
                            />
                          </td>

                          <td className="px-3 py-3 align-top">
                            <select
                              value={inline.status}
                              disabled={controlsDisabled}
                              onChange={(event) =>
                                updateInline(row.id, { status: event.target.value })
                              }
                              className={selectClassName}
                            >
                              {completedMatch ? (
                                <option value={row.status}>{row.status}</option>
                              ) : (
                                INLINE_STATUS_OPTIONS.map((status) => (
                                  <option key={status.value} value={status.value}>
                                    {status.label}
                                  </option>
                                ))
                              )}
                            </select>
                          </td>

                          <td className="px-3 py-3 align-top">
                            <button
                              type="button"
                              disabled={!canClickFinalize}
                              onClick={() => void finalizeInlineMatch(row)}
                              className="inline-flex h-8 min-w-[104px] items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-[11px] font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                              title={
                                completedMatch
                                  ? "Completed matches are disabled"
                                  : inline.status !== "completed"
                                    ? "Choose Completed before finalizing"
                                    : "Finalize match"
                              }
                            >
                              {isBusy ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              )}
                              {completedMatch
                                ? "Disabled"
                                : isBusy
                                  ? "Saving"
                                  : "Finalize"}
                            </button>
                          </td>

                          <td className="whitespace-nowrap px-3 py-3 align-top">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide ring-1 ${statusClass(
                                row.status
                              )}`}
                            >
                              {row.status || "upcoming"}
                            </span>
                          </td>

                          <td className="whitespace-nowrap px-3 py-3 align-top">
                            <div className="flex justify-end gap-1.5">
                              <Link
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 transition hover:bg-emerald-100"
                                href={`/admin/matches/${row.id}`}
                                title="Open"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Link>

                              <button
                                onClick={() => startEdit(row)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
                                type="button"
                                title="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>

                              <button
                                onClick={() => void deleteMatch(row)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-100 bg-rose-50 text-rose-600 transition hover:bg-rose-100"
                                type="button"
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
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
          <label className="text-xs font-medium text-slate-700">
            Match Title
            <input
              value={form.match_title}
              onChange={(event) => updateForm("match_title", event.target.value)}
              className={inputClass}
              placeholder="Example: Qatar vs Switzerland"
            />
          </label>

          <label className="text-xs font-medium text-slate-700">
            Stage
            <input
              value={form.stage}
              onChange={(event) => updateForm("stage", event.target.value)}
              className={inputClass}
              placeholder="Example: Group A"
            />
          </label>

          <label className="text-xs font-medium text-slate-700">
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

          <label className="text-xs font-medium text-slate-700">
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

          <label className="text-xs font-medium text-slate-700">
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

          <label className="text-xs font-medium text-slate-700">
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

          <label className="text-xs font-medium text-slate-700">
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

          <label className="text-xs font-medium text-slate-700">
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
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}

function ScorerDropdown({
  row,
  players,
  selectedIds,
  open,
  disabled,
  onOpenChange,
  onToggle,
  onClear,
}: {
  row: MatchRow;
  players: MatchPlayerRow[];
  selectedIds: string[];
  open: boolean;
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  onToggle: (playerId: string) => void;
  onClear: () => void;
}) {
  const selectedSet = new Set(selectedIds);
  const selectedPlayers = players.filter((player) => selectedSet.has(player.player_id));
  const teamAPlayers = players.filter((player) => player.team_id === row.team_a_id);
  const teamBPlayers = players.filter((player) => player.team_id === row.team_b_id);

  const buttonText =
    selectedPlayers.length === 0
      ? "Select scorers"
      : `${selectedPlayers.length} scorer${selectedPlayers.length > 1 ? "s" : ""}`;

  return (
    <div className="relative min-w-[210px]">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onOpenChange(!open)}
        className="flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 text-left text-[11px] font-medium text-slate-700 outline-none transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
      >
        <span className="truncate">{buttonText}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </button>

      {selectedPlayers.length > 0 && (
        <p className="mt-1 max-w-[210px] truncate text-[10px] text-slate-500">
          {selectedPlayers.map((player) => player.player_name).join(", ")}
        </p>
      )}

      {open && !disabled && (
        <div className="absolute left-0 top-10 z-50 w-[420px] rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-950">
                Select actual goal scorers
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Multiple players allowed from both teams.
              </p>
            </div>

            <button
              type="button"
              onClick={onClear}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-500 transition hover:bg-slate-50"
            >
              Clear
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <ScorerColumn
              title={shortTeamLabel(row.teams_a, "Team A")}
              players={teamAPlayers}
              selectedIds={selectedIds}
              onToggle={onToggle}
            />

            <ScorerColumn
              title={shortTeamLabel(row.teams_b, "Team B")}
              players={teamBPlayers}
              selectedIds={selectedIds}
              onToggle={onToggle}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ScorerColumn({
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
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="truncate text-[11px] font-semibold text-slate-800">
          {title}
        </p>
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-200">
          {players.length}
        </span>
      </div>

      {players.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white p-3 text-center text-[11px] text-slate-400">
          No players
        </div>
      ) : (
        <div className="max-h-[260px] space-y-1 overflow-y-auto pr-1">
          {players.map((player) => {
            const selected = selectedIds.includes(player.player_id);

            return (
              <button
                key={player.player_id}
                type="button"
                onClick={() => onToggle(player.player_id)}
                className={`w-full rounded-lg border px-2 py-1.5 text-left transition ${
                  selected
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded border ${
                      selected
                        ? "border-emerald-600 bg-emerald-600"
                        : "border-slate-300 bg-white"
                    }`}
                  />

                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-medium">
                      {player.player_name}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-slate-500">
                      {player.position || "Player"}
                      {player.jersey_no ? ` • #${player.jersey_no}` : ""}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const inputClass =
  "mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";
