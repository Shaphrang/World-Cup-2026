//src\app\admin\winners\page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import {
  CalendarDays,
  CheckCircle2,
  Crown,
  Medal,
  RefreshCw,
  Search,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";

import { LoadingSpinner } from "@/components/admin/LoadingSpinner";
import { supabase } from "@/lib/supabaseClient";
import { formatDateTime, friendlyError } from "@/lib/supabaseHelpers";

type CompletedMatchRow = {
  id: string;
  match_title: string | null;
  stage: string | null;

  team_a_name: string | null;
  team_a_short_name: string | null;
  team_a_flag_url: string | null;

  team_b_name: string | null;
  team_b_short_name: string | null;
  team_b_flag_url: string | null;

  team_a_score: number | null;
  team_b_score: number | null;

  match_start_at: string;
  status: string;
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

type RankedParticipant = ParticipantRow & {
  rank_no: number;
};

function getMatchTitle(match: CompletedMatchRow | null) {
  if (!match) return "Select Match";

  if (match.match_title?.trim()) return match.match_title;

  return `${match.team_a_name ?? "Team A"} vs ${match.team_b_name ?? "Team B"}`;
}

function shortTeamName(name?: string | null, shortName?: string | null) {
  return shortName || name || "Team";
}

function scoreText(match: CompletedMatchRow | null) {
  if (!match) return "-";

  const a = match.team_a_score ?? "-";
  const b = match.team_b_score ?? "-";

  return `${a} - ${b}`;
}

function predictionText(
  row: ParticipantRow,
  teamA: string,
  teamB: string
) {
  return `${teamA} ${row.predicted_team_a_score} - ${row.predicted_team_b_score} ${teamB}`;
}

function avatarInitial(name?: string | null) {
  return (name || "P").trim().charAt(0).toUpperCase();
}

function statusBadgeClass(status?: string | null) {
  if (status === "finalized") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  }

  return "bg-blue-50 text-blue-700 ring-blue-100";
}

export default function Winners() {
  const [matches, setMatches] = useState<CompletedMatchRow[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState("");

  const [participants, setParticipants] = useState<ParticipantRow[]>([]);

  const [loadingMatches, setLoadingMatches] = useState(true);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const [search, setSearch] = useState("");

  const selectedMatch = useMemo(() => {
    return matches.find((match) => match.id === selectedMatchId) ?? null;
  }, [matches, selectedMatchId]);

  const teamAShortName = shortTeamName(
    selectedMatch?.team_a_name,
    selectedMatch?.team_a_short_name
  );

  const teamBShortName = shortTeamName(
    selectedMatch?.team_b_name,
    selectedMatch?.team_b_short_name
  );

  const rankedParticipants = useMemo<RankedParticipant[]>(() => {
    const q = search.trim().toLowerCase();

    return [...participants]
      .filter((row) => {
        if (!q) return true;

        return [
          row.full_name,
          row.predicted_player_name,
          row.points_total,
          row.predicted_team_a_score,
          row.predicted_team_b_score,
          row.predicted_total_goals,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => {
        const pointsDiff = b.points_total - a.points_total;
        if (pointsDiff !== 0) return pointsDiff;

        const timeDiff =
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        if (timeDiff !== 0) return timeDiff;

        return (a.full_name || "Participant").localeCompare(
          b.full_name || "Participant"
        );
      })
      .map((row, index) => ({
        ...row,
        rank_no: index + 1,
      }));
  }, [participants, search]);

  const winner = rankedParticipants[0] ?? null;
  const otherWinners = rankedParticipants.slice(1);

  const evaluatedCount = participants.filter((row) => row.is_evaluated).length;
  const participantCount = participants.length;

  async function loadCompletedMatches() {
    setLoadingMatches(true);

    const { data, error } = await supabase
      .from("fixtures_view")
      .select(
        `
        id,
        match_title,
        stage,
        team_a_name,
        team_a_short_name,
        team_a_flag_url,
        team_b_name,
        team_b_short_name,
        team_b_flag_url,
        team_a_score,
        team_b_score,
        match_start_at,
        status
      `
      )
      .in("status", ["completed", "finalized"])
      .order("match_start_at", { ascending: false });

    setLoadingMatches(false);

    if (error) {
      setMatches([]);
      Swal.fire("Load failed", friendlyError(error), "error");
      return;
    }

    const rows = (data ?? []) as CompletedMatchRow[];

    setMatches(rows);

    if (rows.length === 0) {
      setSelectedMatchId("");
      return;
    }

    const currentStillExists = rows.some((row) => row.id === selectedMatchId);

    if (!selectedMatchId || !currentStillExists) {
      setSelectedMatchId(rows[0].id);
    }
  }

  async function loadParticipants(matchId: string) {
    setLoadingParticipants(true);

    const { data, error } = await supabase.rpc("get_match_participants", {
      p_match_id: matchId,
    });

    setLoadingParticipants(false);

    if (error) {
      setParticipants([]);
      Swal.fire("Load failed", friendlyError(error), "error");
      return;
    }

    setParticipants((data ?? []) as ParticipantRow[]);
  }

  async function refreshAll() {
    await loadCompletedMatches();

    if (selectedMatchId) {
      await loadParticipants(selectedMatchId);
    }
  }

  async function publishMatchWinners() {
    if (!selectedMatch || rankedParticipants.length === 0) {
      return Swal.fire(
        "Nothing to publish",
        "There are no ranked participants for this match.",
        "info"
      );
    }

    const confirm = await Swal.fire({
      title: "Publish winners?",
      text: "This will replace the published winners for this match with the current ranking.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Publish",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#047857",
    });

    if (!confirm.isConfirmed) return;

    setPublishing(true);

    const { error: deleteError } = await supabase
      .from("winners")
      .delete()
      .eq("match_id", selectedMatch.id)
      .eq("winner_type", "match");

    if (deleteError) {
      setPublishing(false);
      return Swal.fire("Publish failed", friendlyError(deleteError), "error");
    }

    const rowsToInsert = rankedParticipants.map((row) => ({
      match_id: selectedMatch.id,
      user_id: row.user_id,
      winner_type: "match",
      reward_title:
        row.rank_no === 1 ? "Match Winner" : `Rank ${row.rank_no}`,
      reward_description: `${getMatchTitle(selectedMatch)} • ${row.points_total} points`,
      rank_no: row.rank_no,
      points: row.points_total,
      is_published: true,
    }));

    const { error: insertError } = await supabase
      .from("winners")
      .insert(rowsToInsert);

    setPublishing(false);

    if (insertError) {
      return Swal.fire("Publish failed", friendlyError(insertError), "error");
    }

    Swal.fire({
      title: "Published",
      text: "Match winners published successfully.",
      icon: "success",
      timer: 1400,
      showConfirmButton: false,
    });
  }

  useEffect(() => {
    void loadCompletedMatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedMatchId) {
      setParticipants([]);
      return;
    }

    void loadParticipants(selectedMatchId);
  }, [selectedMatchId]);

  if (loadingMatches) {
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

          <div className="relative flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-medium text-emerald-100">
                <Trophy className="h-3.5 w-3.5" />
                Admin Winners
              </div>

              <h1 className="text-2xl font-semibold tracking-tight">
                Match Winners
              </h1>

              <p className="mt-1 max-w-2xl text-sm text-slate-300">
                Select a completed match, view the winner, and publish the ranked
                winners list.
              </p>
            </div>

            <button
              onClick={() => void refreshAll()}
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3.5 py-2 text-xs font-medium text-white transition hover:bg-white/15"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>
        </div>

        <div className="grid gap-3 border-b border-slate-100 bg-slate-50/80 p-4 lg:grid-cols-[1fr_180px_180px_180px]">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">
              Completed Match
            </label>

            <select
              value={selectedMatchId}
              onChange={(event) => setSelectedMatchId(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            >
              {matches.length === 0 ? (
                <option value="">No completed matches</option>
              ) : (
                matches.map((match) => (
                  <option key={match.id} value={match.id}>
                    {getMatchTitle(match)} • {scoreText(match)}
                  </option>
                ))
              )}
            </select>
          </div>

          <InfoCard
            icon={<CalendarDays className="h-4 w-4" />}
            label="Match Date"
            value={
              selectedMatch ? formatDateTime(selectedMatch.match_start_at) : "-"
            }
          />

          <InfoCard
            icon={<Users className="h-4 w-4" />}
            label="Participants"
            value={String(participantCount)}
          />

          <InfoCard
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="Evaluated"
            value={`${evaluatedCount}/${participantCount}`}
          />
        </div>

        {matches.length === 0 ? (
          <EmptyState
            title="No completed matches yet"
            text="Complete and finalize a match first. Winners will appear here after predictions are evaluated."
          />
        ) : loadingParticipants ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="space-y-4 p-4">
            <WinnerHero
              match={selectedMatch}
              winner={winner}
              teamAShortName={teamAShortName}
              teamBShortName={teamBShortName}
              onPublish={() => void publishMatchWinners()}
              publishing={publishing}
            />

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-4 lg:flex-row lg:items-center">
                <div>
                  <h2 className="text-sm font-semibold text-slate-950">
                    Ranked Winners List
                  </h2>

                  <p className="mt-0.5 text-xs text-slate-500">
                    Rank 2 onwards. Ranking uses highest points first, then
                    earliest prediction time.
                  </p>
                </div>

                <div className="relative w-full lg:w-72">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />

                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search participant or scorer..."
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  />
                </div>
              </div>

              {rankedParticipants.length === 0 ? (
                <EmptyState
                  title="No predictions found"
                  text="There are no evaluated predictions for this selected match."
                />
              ) : otherWinners.length === 0 ? (
                <EmptyState
                  title="Only one participant"
                  text="The main winner is shown above. There are no rank 2, 3, 4 entries yet."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2.5">Rank</th>
                        <th className="px-3 py-2.5">Participant</th>
                        <th className="px-3 py-2.5">Prediction</th>
                        <th className="px-3 py-2.5">Goal Scorer</th>
                        <th className="px-3 py-2.5">Breakdown</th>
                        <th className="px-3 py-2.5 text-right">Points</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100 bg-white">
                      {otherWinners.map((row) => (
                        <tr
                          key={row.prediction_id}
                          className="transition hover:bg-slate-50"
                        >
                          <td className="whitespace-nowrap px-3 py-2.5">
                            <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-slate-100 px-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                              #{row.rank_no}
                            </span>
                          </td>

                          <td className="whitespace-nowrap px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                                {avatarInitial(row.full_name)}
                              </div>

                              <div>
                                <p className="text-xs font-medium text-slate-900">
                                  {row.full_name || "Participant"}
                                </p>

                                <p className="text-[11px] text-slate-400">
                                  {formatDateTime(row.created_at)}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="whitespace-nowrap px-3 py-2.5">
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200">
                              {predictionText(
                                row,
                                teamAShortName,
                                teamBShortName
                              )}
                            </span>
                          </td>

                          <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                            {row.predicted_player_name || "—"}
                          </td>

                          <td className="whitespace-nowrap px-3 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              <PointBadge label="Exact" value={row.exact_score_points} />
                              <PointBadge label="Goals" value={row.total_goals_points} />
                              <PointBadge label="Scorer" value={row.player_points} />
                            </div>
                          </td>

                          <td className="whitespace-nowrap px-3 py-2.5 text-right">
                            <span className="text-sm font-semibold text-slate-950">
                              {row.points_total}
                            </span>
                            <span className="ml-1 text-[11px] text-slate-400">
                              pts
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function InfoCard({
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

function WinnerHero({
  match,
  winner,
  teamAShortName,
  teamBShortName,
  onPublish,
  publishing,
}: {
  match: CompletedMatchRow | null;
  winner: RankedParticipant | null;
  teamAShortName: string;
  teamBShortName: string;
  onPublish: () => void;
  publishing: boolean;
}) {
  if (!match) {
    return (
      <EmptyState
        title="Select a match"
        text="Choose a completed match from the dropdown above."
      />
    );
  }

  if (!winner) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
        <Trophy className="mx-auto mb-3 h-8 w-8 text-slate-300" />

        <h3 className="text-sm font-semibold text-slate-900">
          No winner calculated
        </h3>

        <p className="mt-1 text-xs text-slate-500">
          No predictions were found for this match.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm">
      <div className="relative overflow-hidden bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600 p-5 text-white">
        <div className="absolute -right-14 -top-14 h-40 w-40 rounded-full bg-white/15 blur-3xl" />
        <div className="absolute -bottom-16 left-20 h-40 w-40 rounded-full bg-cyan-200/20 blur-3xl" />

        <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-2xl font-semibold text-emerald-700 shadow-lg">
                {avatarInitial(winner.full_name)}
              </div>

              <div className="absolute -right-2 -top-2 rounded-full bg-amber-300 p-1.5 text-amber-900 shadow">
                <Crown className="h-4 w-4" />
              </div>
            </div>

            <div>
              <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-emerald-50">
                <Sparkles className="h-3 w-3" />
                Match Winner
              </div>

              <h2 className="text-2xl font-semibold tracking-tight">
                {winner.full_name || "Participant"}
              </h2>

              <p className="mt-1 text-sm text-emerald-50">
                {getMatchTitle(match)} • {scoreText(match)}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/20 bg-white/15 px-5 py-4 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-50">
              Total Points
            </p>

            <p className="mt-1 text-4xl font-semibold text-white">
              {winner.points_total}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 bg-emerald-50/40 p-4 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-center">
        <WinnerMiniCard
          label="Prediction"
          value={predictionText(winner, teamAShortName, teamBShortName)}
        />

        <WinnerMiniCard
          label="Goal Scorer"
          value={winner.predicted_player_name || "—"}
        />

        <WinnerMiniCard
          label="Submitted"
          value={formatDateTime(winner.created_at)}
        />

        <button
          onClick={onPublish}
          disabled={publishing}
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Medal className="h-4 w-4" />
          {publishing ? "Publishing..." : "Publish Winners"}
        </button>
      </div>
    </div>
  );
}

function WinnerMiniCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-3 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p className="mt-1 truncate text-sm font-semibold text-slate-900">
        {value}
      </p>
    </div>
  );
}

function PointBadge({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <span
      className={`rounded-full px-2 py-1 text-[11px] font-medium ring-1 ${
        value > 0
          ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
          : "bg-slate-100 text-slate-500 ring-slate-200"
      }`}
    >
      {label} {value}
    </span>
  );
}

function EmptyState({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="flex min-h-[220px] items-center justify-center bg-white px-4 text-center">
      <div>
        <Trophy className="mx-auto mb-3 h-8 w-8 text-slate-300" />

        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>

        <p className="mt-1 max-w-md text-xs text-slate-500">{text}</p>
      </div>
    </div>
  );
}