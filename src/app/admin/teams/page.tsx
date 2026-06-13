//src\app\admin\teams\page.tsx
"use client";

import { CrudPage } from "@/components/admin/CrudPage";

type TeamRow = {
  id?: string;
  name: string;
  short_name?: string | null;
  flag_url?: string | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
};

export default function Teams() {
  return (
    <CrudPage<TeamRow>
      title="Teams"
      table="teams"
      select="id,name,short_name,flag_url,created_at,updated_at"
      columns={[
        {
          header: "Team Name",
          accessor: "name",
        },
        {
          header: "Short Name",
          accessor: "short_name",
        },
        {
          header: "Flag URL",
          accessor: "flag_url",
        },
      ]}
      fields={[
        {
          name: "name",
          label: "Team Name",
          required: true,
        },
        {
          name: "short_name",
          label: "Short Name",
        },
        {
          name: "flag_url",
          label: "Flag URL",
          type: "url",
        },
      ]}
    />
  );
}