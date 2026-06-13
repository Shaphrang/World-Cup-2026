//src\app\admin\players\page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { CrudPage, type Field } from "@/components/admin/CrudPage";
import { supabase } from "@/lib/supabaseClient";

type TeamRow = {
  id: string;
  name: string;
  short_name?: string | null;
};

type PlayerRow = {
  id?: string;
  team_id?: string;
  player_name: string;
  jersey_no?: number | null;
  position?: string | null;
  is_active?: boolean;
  club_name?: string | null;
  squad_role?: string | null;
  source_url?: string | null;
  import_batch?: string | null;
  is_goal_candidate?: boolean;
  created_at?: string;
  updated_at?: string;
  teams?: TeamRow | null;
  [key: string]: unknown;
};

export default function Players() {
  const [teams, setTeams] = useState<TeamRow[]>([]);

  useEffect(() => {
    supabase
      .from("teams")
      .select("id,name,short_name")
      .order("name", { ascending: true })
      .then(({ data }) => setTeams((data ?? []) as TeamRow[]));
  }, []);

  const teamOptions = useMemo(
    () =>
      teams.map((team) => ({
        value: team.id,
        label: team.short_name
          ? `${team.name} (${team.short_name})`
          : team.name,
      })),
    [teams]
  );

  const fields: Field[] = [
    {
      name: "player_name",
      label: "Player Name",
      required: true,
    },
    {
      name: "team_id",
      label: "Team",
      required: true,
      options: teamOptions,
    },
    {
      name: "jersey_no",
      label: "Jersey Number",
      type: "number",
    },
    {
      name: "position",
      label: "Position",
    },
    {
      name: "club_name",
      label: "Club Name",
    },
    {
      name: "squad_role",
      label: "Squad Role",
    },
    {
      name: "source_url",
      label: "Source URL",
      type: "url",
    },
    {
      name: "is_goal_candidate",
      label: "Goal Candidate",
      type: "checkbox",
    },
    {
      name: "is_active",
      label: "Active",
      type: "checkbox",
    },
  ];

  return (
    <CrudPage<PlayerRow>
      title="Players"
      table="players"
      select="id,team_id,player_name,jersey_no,position,is_active,club_name,squad_role,source_url,import_batch,is_goal_candidate,created_at,updated_at,teams(id,name,short_name)"
      columns={[
        {
          header: "Player",
          accessor: "player_name",
        },
        {
          header: "Team",
          accessor: (row) =>
            row.teams?.short_name
              ? `${row.teams.name} (${row.teams.short_name})`
              : row.teams?.name ?? row.team_id,
        },
        {
          header: "Jersey",
          accessor: "jersey_no",
        },
        {
          header: "Position",
          accessor: "position",
        },
        {
          header: "Squad Role",
          accessor: "squad_role",
        },
        {
          header: "Goal Candidate",
          accessor: (row) =>
            row.is_goal_candidate ? (
              <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-700 ring-1 ring-amber-100">
                Yes
              </span>
            ) : (
              <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">
                No
              </span>
            ),
        },
        {
          header: "Active",
          accessor: (row) =>
            row.is_active ? (
              <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700 ring-1 ring-emerald-100">
                Active
              </span>
            ) : (
              <span className="inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-xs font-black text-rose-700 ring-1 ring-rose-100">
                Inactive
              </span>
            ),
        },
      ]}
      fields={fields}
      initialRecord={{
        is_active: true,
        is_goal_candidate: false,
      }}
    />
  );
}