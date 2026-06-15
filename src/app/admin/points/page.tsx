"use client";

import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  CheckCircle2,
  Clock3,
  Crown,
  Database,
  FileText,
  Goal,
  Info,
  Medal,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";

type RuleCard = {
  title: string;
  points: string;
  icon: ReactNode;
  description: string;
};

type ExampleRow = {
  rank: string;
  user: string;
  prediction: string;
  scorer: string;
  submitted: string;
  exact: string;
  scorerPoints: string;
  time: string;
  total: string;
  result: "win" | "lose";
};

const ruleCards: RuleCard[] = [
  {
    title: "Exact Score",
    points: "10 pts",
    icon: <Trophy className="h-5 w-5" />,
    description:
      "The user must predict the exact final score. If the exact score is wrong, the user gets 0 points and loses.",
  },
  {
    title: "Goal Scorer Bonus",
    points: "5 pts",
    icon: <Goal className="h-5 w-5" />,
    description:
      "Each user selects only one player. If the exact score is correct and that player scores at least once, the user gets 5 bonus points.",
  },
  {
    title: "Time Bonus",
    points: "10 to 1 pts",
    icon: <Clock3 className="h-5 w-5" />,
    description:
      "Only exact-score users get time bonus. The earliest exact-score prediction gets 10, second gets 9, third gets 8, and so on.",
  },
];

const exampleRows: ExampleRow[] = [
  {
    rank: "1",
    user: "John",
    prediction: "Qatar 2 - 1 Switzerland",
    scorer: "Akram Afif",
    submitted: "10:05 AM",
    exact: "10",
    scorerPoints: "5",
    time: "10",
    total: "25",
    result: "win",
  },
  {
    rank: "2",
    user: "David",
    prediction: "Qatar 2 - 1 Switzerland",
    scorer: "Akram Afif",
    submitted: "10:15 AM",
    exact: "10",
    scorerPoints: "5",
    time: "8",
    total: "23",
    result: "win",
  },
  {
    rank: "3",
    user: "Mary",
    prediction: "Qatar 2 - 1 Switzerland",
    scorer: "Different Player",
    submitted: "10:08 AM",
    exact: "10",
    scorerPoints: "0",
    time: "9",
    total: "19",
    result: "win",
  },
  {
    rank: "-",
    user: "Sara",
    prediction: "Qatar 1 - 0 Switzerland",
    scorer: "Akram Afif",
    submitted: "09:50 AM",
    exact: "0",
    scorerPoints: "0",
    time: "0",
    total: "0",
    result: "lose",
  },
];

const flowSteps = [
  {
    title: "User predicts",
    text: "User submits exact score prediction and selects one goal scorer.",
    icon: <UserCheck className="h-4 w-4" />,
  },
  {
    title: "Admin finalizes",
    text: "Admin enters final score and actual goal scorer, then clicks Finalize Match.",
    icon: <ShieldCheck className="h-4 w-4" />,
  },
  {
    title: "RPC calculates",
    text: "Supabase finalize_match RPC calculates exact score, scorer bonus, and time bonus.",
    icon: <Database className="h-4 w-4" />,
  },
  {
    title: "Winners appear",
    text: "Only users with exact score correct are ranked as winners.",
    icon: <Crown className="h-4 w-4" />,
  },
];

export default function PointsGuidePage() {
  return (
    <section className="space-y-5">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 px-5 py-6 text-white">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-400/20 blur-3xl" />
          <div className="absolute -bottom-20 left-20 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative max-w-5xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-medium text-emerald-100">
              <FileText className="h-3.5 w-3.5" />
              Admin Documentation
            </div>

            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Points Calculation Guide
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              This page documents the final scoring strategy for the World Cup
              prediction app. The calculation is done during match finalization.
            </p>
          </div>
        </div>

        <div className="grid gap-3 bg-slate-50/80 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <TopStat
            icon={<Trophy className="h-4 w-4" />}
            label="Maximum Points"
            value="25"
          />

          <TopStat
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="Main Rule"
            value="Exact Score"
          />

          <TopStat
            icon={<Goal className="h-4 w-4" />}
            label="Scorer"
            value="One Player"
          />

          <TopStat
            icon={<Database className="h-4 w-4" />}
            label="Calculation"
            value="RPC"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
        <div className="flex gap-3">
          <div className="mt-0.5 rounded-xl bg-rose-100 p-2 text-rose-700">
            <AlertTriangle className="h-5 w-5" />
          </div>

          <div>
            <h2 className="text-sm font-semibold text-rose-950">
              Most important rule
            </h2>

            <p className="mt-1 text-sm leading-6 text-rose-800">
              If the exact score is wrong, the participant gets{" "}
              <b>0 points</b>. No scorer bonus and no time bonus will be
              calculated. Winners are calculated only from users who predicted
              the exact final score correctly.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {ruleCards.map((rule) => (
          <div
            key={rule.title}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
                {rule.icon}
              </div>

              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                {rule.points}
              </span>
            </div>

            <h2 className="text-base font-semibold text-slate-950">
              {rule.title}
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              {rule.description}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <SectionHeader
          icon={<Calculator className="h-4 w-4" />}
          title="Final formula"
          description="The score is calculated only after admin finalizes the match."
        />

        <div className="grid gap-4 p-4 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] lg:items-center">
          <FormulaBox label="Exact Score" value="10 pts" />
          <ArrowRight className="hidden h-5 w-5 text-slate-300 lg:block" />
          <FormulaBox label="Goal Scorer" value="5 pts" />
          <ArrowRight className="hidden h-5 w-5 text-slate-300 lg:block" />
          <FormulaBox label="Time Bonus" value="10 to 1 pts" />
          <ArrowRight className="hidden h-5 w-5 text-slate-300 lg:block" />
          <FormulaBox label="Maximum Total" value="25 pts" highlight />
        </div>

        <div className="border-t border-slate-100 p-4">
          <CodeBlock
            code={`if exact_score_is_wrong:
  exact_score_points = 0
  player_points = 0
  time_points = 0
  points_total = 0

if exact_score_is_correct:
  exact_score_points = 10
  player_points = 5 if selected player scored
  time_points = 10 to 1 based on earliest exact-score submission

points_total = exact_score_points + player_points + time_points`}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <SectionHeader
          icon={<Clock3 className="h-4 w-4" />}
          title="What does earliest exact-score prediction mean?"
          description="Only users who predicted the final score exactly are considered for the time bonus."
        />

        <div className="grid gap-4 p-4 lg:grid-cols-[300px_1fr]">
          <div className="rounded-2xl bg-gradient-to-br from-emerald-700 to-teal-700 p-5 text-white">
            <div className="mb-4 inline-flex rounded-xl bg-white/15 p-3">
              <Medal className="h-6 w-6" />
            </div>

            <p className="text-xs font-medium uppercase tracking-wide text-emerald-100">
              Example Final Result
            </p>

            <h3 className="mt-2 text-2xl font-semibold">
              Qatar 2 - 1 Switzerland
            </h3>

            <div className="mt-4 rounded-xl border border-white/10 bg-white/10 p-3">
              <p className="text-xs text-emerald-50">Actual scorer</p>
              <p className="mt-1 text-sm font-semibold">Akram Afif</p>
            </div>

            <div className="mt-3 rounded-xl border border-white/10 bg-white/10 p-3">
              <p className="text-xs text-emerald-50">Correct exact score</p>
              <p className="mt-1 text-sm font-semibold">
                Qatar 2 - 1 Switzerland
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-950">
              Time bonus order
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Suppose many users predicted the exact score correctly. The system
              checks their submitted time. The first correct exact-score
              submission gets 10 time points, second gets 9, third gets 8, and
              so on.
            </p>

            <div className="mt-4 grid gap-2">
              <TimeBonusRow rank="1st exact-score user" points="10 pts" />
              <TimeBonusRow rank="2nd exact-score user" points="9 pts" />
              <TimeBonusRow rank="3rd exact-score user" points="8 pts" />
              <TimeBonusRow rank="4th exact-score user" points="7 pts" />
              <TimeBonusRow rank="10th exact-score user" points="1 pt" />
              <TimeBonusRow rank="After 10th" points="0 pts" muted />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <SectionHeader
          icon={<Users className="h-4 w-4" />}
          title="Full example calculation"
          description="Final result is Qatar 2 - 1 Switzerland. Actual scorer is Akram Afif."
        />

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5">Rank</th>
                <th className="px-3 py-2.5">User</th>
                <th className="px-3 py-2.5">Prediction</th>
                <th className="px-3 py-2.5">Scorer</th>
                <th className="px-3 py-2.5">Submitted</th>
                <th className="px-3 py-2.5">Exact</th>
                <th className="px-3 py-2.5">Scorer</th>
                <th className="px-3 py-2.5">Time</th>
                <th className="px-3 py-2.5">Total</th>
                <th className="px-3 py-2.5">Result</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 bg-white">
              {exampleRows.map((row) => (
                <tr key={row.user} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {row.rank === "-" ? (
                      <span className="text-slate-400">-</span>
                    ) : (
                      <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-emerald-50 px-2 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                        #{row.rank}
                      </span>
                    )}
                  </td>

                  <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-900">
                    {row.user}
                  </td>

                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                    {row.prediction}
                  </td>

                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                    {row.scorer}
                  </td>

                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">
                    {row.submitted}
                  </td>

                  <td className="whitespace-nowrap px-3 py-2.5">
                    <PointPill value={row.exact} />
                  </td>

                  <td className="whitespace-nowrap px-3 py-2.5">
                    <PointPill value={row.scorerPoints} />
                  </td>

                  <td className="whitespace-nowrap px-3 py-2.5">
                    <PointPill value={row.time} />
                  </td>

                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span className="text-sm font-semibold text-slate-950">
                      {row.total}
                    </span>
                  </td>

                  <td className="whitespace-nowrap px-3 py-2.5">
                    {row.result === "win" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-100">
                        <CheckCircle2 className="h-3 w-3" />
                        Qualified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-700 ring-1 ring-rose-100">
                        <XCircle className="h-3 w-3" />
                        Lost
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-100 bg-slate-50/70 p-4">
          <div className="flex gap-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />

            <p className="text-xs leading-5 text-slate-600">
              Sara submitted earlier than everyone, but her exact score was
              wrong. Therefore her points are automatically 0, and she is not
              included in winner ranking.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <SectionHeader
          icon={<ShieldCheck className="h-4 w-4" />}
          title="Calculation flow"
          description="This is how the app calculates points from prediction to winner."
        />

        <div className="grid gap-3 p-4 md:grid-cols-4">
          {flowSteps.map((step, index) => (
            <div
              key={step.title}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
                  {step.icon}
                </div>

                <span className="text-xs font-semibold text-slate-300">
                  0{index + 1}
                </span>
              </div>

              <h3 className="text-sm font-semibold text-slate-950">
                {step.title}
              </h3>

              <p className="mt-2 text-xs leading-5 text-slate-500">
                {step.text}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <SectionHeader
            icon={<Database className="h-4 w-4" />}
            title="Where points are calculated"
            description="The calculation is done in Supabase, not manually in the UI."
          />

          <div className="space-y-4 p-4">
            <DocLine label="Database function" value="public.finalize_match" />
            <DocLine label="Main table updated" value="public.match_predictions" />
            <DocLine label="Actual score from" value="public.matches" />
            <DocLine label="Actual scorers from" value="public.match_goals" />
            <DocLine label="Trigger page" value="/admin/matches/[id]" />

            <CodeBlock
              code={`await supabase.rpc("finalize_match", {
  p_match_id: matchId,
});`}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <SectionHeader
            icon={<Sparkles className="h-4 w-4" />}
            title="Final decision rule"
            description="This wording can be shown in app rules also."
          />

          <div className="p-4">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm leading-7 text-slate-700">
                A participant must predict the exact score to qualify for
                points. If the exact score is wrong, the participant receives 0
                points and is not eligible for winner ranking. Each participant
                can select only one goal scorer. If that selected player scores
                at least once, the participant gets the 5-point goal scorer
                bonus, but only if the exact score is also correct. Time bonus
                is awarded from 10 to 1 points based on first-come-first-served
                order among exact-score predictions only. Maximum points is 25.
                The admin&apos;s decision on final score, goal scorer, and
                winner calculation is final.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TopStat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
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

function SectionHeader({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-4">
      <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700 ring-1 ring-emerald-100">
        {icon}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-950">{title}</h2>

        <p className="mt-0.5 text-xs leading-5 text-slate-500">
          {description}
        </p>
      </div>
    </div>
  );
}

function FormulaBox({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 text-center shadow-sm ${
        highlight
          ? "border-emerald-200 bg-emerald-50"
          : "border-slate-200 bg-white"
      }`}
    >
      <p
        className={`text-[11px] font-medium uppercase tracking-wide ${
          highlight ? "text-emerald-700" : "text-slate-400"
        }`}
      >
        {label}
      </p>

      <p
        className={`mt-1 text-xl font-semibold ${
          highlight ? "text-emerald-800" : "text-slate-950"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function TimeBonusRow({
  rank,
  points,
  muted,
}: {
  rank: string;
  points: string;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
        muted
          ? "border-slate-200 bg-slate-100 text-slate-500"
          : "border-emerald-100 bg-white text-slate-700"
      }`}
    >
      <span className="text-xs font-medium">{rank}</span>

      <span
        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
          muted
            ? "bg-white text-slate-500"
            : "bg-emerald-50 text-emerald-700"
        }`}
      >
        {points}
      </span>
    </div>
  );
}

function PointPill({ value }: { value: string }) {
  const numberValue = Number(value);

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${
        numberValue > 0
          ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
          : "bg-slate-100 text-slate-500 ring-slate-200"
      }`}
    >
      {value}
    </span>
  );
}

function DocLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs font-medium text-slate-500">{label}</p>

      <p className="font-mono text-xs font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs leading-5 text-emerald-100">
      <code>{code}</code>
    </pre>
  );
}