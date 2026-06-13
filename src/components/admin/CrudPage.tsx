//src\components\admin\CrudPage.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import Swal from "sweetalert2";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  RefreshCw,
  Database,
  X,
  Save,
} from "lucide-react";

import { supabase } from "@/lib/supabaseClient";
import { friendlyError } from "@/lib/supabaseHelpers";
import { DataTable, type Column } from "./DataTable";
import { Modal } from "./Modal";
import { LoadingSpinner } from "./LoadingSpinner";

export type Field = {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
};

type CrudPageProps<T extends { id?: string; [key: string]: unknown }> = {
  title: string;
  table: string;
  columns: Column<T>[];
  fields: Field[];
  select?: string;
  initialRecord?: Partial<T>;
  orderBy?: string;
};

export function CrudPage<T extends { id?: string; [key: string]: unknown }>({
  title,
  table,
  columns,
  fields,
  select = "*",
  initialRecord = {},
  orderBy = "created_at",
}: CrudPageProps<T>) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);

    let query = supabase.from(table).select(select);

    if (orderBy) {
      query = query.order(orderBy, { ascending: false });
    }

    const { data, error } = await query;

    if (error) {
      setRows([]);
      Swal.fire("Load failed", friendlyError(error), "error");
    } else {
      setRows((data ?? []) as unknown as T[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return rows;

    return rows.filter((row) => {
      const rowText = safeStringify(row).toLowerCase();

      if (rowText.includes(q)) return true;

      return columns.some((col) => {
        try {
          if (typeof col.accessor === "function") {
            return String(col.accessor(row) ?? "").toLowerCase().includes(q);
          }

          return String(row[col.accessor as keyof T] ?? "")
            .toLowerCase()
            .includes(q);
        } catch {
          return false;
        }
      });
    });
  }, [rows, search, columns]);

  function start(row?: T) {
    setEditing(row ?? null);
    setForm({
      ...initialRecord,
      ...(row ?? {}),
    });
    setOpen(true);
  }

  function cleanPayload() {
    const payload: Record<string, unknown> = {};

    for (const field of fields) {
      const value = form[field.name];

      if (field.type === "checkbox") {
        payload[field.name] = Boolean(value);
        continue;
      }

      if (field.type === "number") {
        if (value === "" || value === undefined || value === null) {
          payload[field.name] = null;
        } else {
          payload[field.name] = Number(value);
        }
        continue;
      }

      if (field.type === "datetime-local") {
        if (!value) {
          payload[field.name] = null;
        } else {
          payload[field.name] = new Date(String(value)).toISOString();
        }
        continue;
      }

      if (typeof value === "string") {
        const trimmed = value.trim();
        payload[field.name] = trimmed === "" ? null : trimmed;
        continue;
      }

      payload[field.name] = value ?? null;
    }

    return payload;
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setSaving(true);

    const payload = cleanPayload();

    const res = editing?.id
      ? await supabase.from(table).update(payload).eq("id", editing.id)
      : await supabase.from(table).insert(payload);

    setSaving(false);

    if (res.error) {
      return Swal.fire("Save failed", friendlyError(res.error), "error");
    }

    setOpen(false);
    await load();

    Swal.fire({
      title: "Saved",
      text: "Record saved successfully.",
      icon: "success",
      timer: 1400,
      showConfirmButton: false,
    });
  }

  async function remove(row: T) {
    if (!row.id) return;

    const ok = await Swal.fire({
      title: "Delete record?",
      text: "This cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Delete",
      cancelButtonText: "Cancel",
    });

    if (!ok.isConfirmed) return;

    const { error } = await supabase.from(table).delete().eq("id", row.id);

    if (error) {
      return Swal.fire("Delete failed", friendlyError(error), "error");
    }

    await load();

    Swal.fire({
      title: "Deleted",
      text: "Record removed.",
      icon: "success",
      timer: 1200,
      showConfirmButton: false,
    });
  }

  const inputClass =
    "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100";

  return (
    <section className="space-y-5">
      <div className="overflow-hidden rounded-[1.7rem] border border-slate-200 bg-white shadow-sm">
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 px-5 py-5 text-white sm:px-6">
          <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-emerald-400/20 blur-3xl" />
          <div className="absolute -bottom-20 left-20 h-44 w-44 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                <Database className="h-3.5 w-3.5" />
                Admin Management
              </div>

              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
                {title}
              </h1>

              <p className="mt-1 max-w-2xl text-sm text-slate-300">
                Create, update and manage {title.toLowerCase()} records.
              </p>
            </div>

            <button
              onClick={() => start()}
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-emerald-950/20 transition hover:bg-emerald-400"
            >
              <Plus className="h-4 w-4" />
              Add {title}
            </button>
          </div>
        </div>

        <div className="grid gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:px-6">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${title.toLowerCase()}...`}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
            />

            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700">
            {filteredRows.length} / {rows.length} records
          </div>

          <button
            onClick={() => void load()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
            type="button"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        <div className="p-4 sm:p-5">
          {loading ? (
            <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50">
              <LoadingSpinner />
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center">
              <div className="mb-3 rounded-2xl bg-white p-4 shadow-sm">
                <Database className="h-7 w-7 text-slate-400" />
              </div>

              <h3 className="text-base font-black text-slate-900">
                No records found
              </h3>

              <p className="mt-1 max-w-md text-sm text-slate-500">
                {search
                  ? "Try changing your search text."
                  : `Start by adding your first ${title.toLowerCase()} record.`}
              </p>

              {!search && (
                <button
                  onClick={() => start()}
                  type="button"
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-emerald-700"
                >
                  <Plus className="h-4 w-4" />
                  Add {title}
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <DataTable
                data={filteredRows}
                columns={columns}
                actions={(row) => (
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => start(row)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
                      type="button"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>

                    <button
                      onClick={() => void remove(row)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-100 bg-rose-50 text-rose-700 transition hover:bg-rose-100"
                      type="button"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              />
            </div>
          )}
        </div>
      </div>

      <Modal
        title={`${editing ? "Edit" : "Add"} ${title}`}
        open={open}
        onClose={() => setOpen(false)}
      >
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => {
            const value = form[field.name];

            if (field.type === "checkbox") {
              return (
                <label
                  key={field.name}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(value)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        [field.name]: e.currentTarget.checked,
                      })
                    }
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  {field.label}
                </label>
              );
            }

            return (
              <label
                key={field.name}
                className="text-sm font-bold text-slate-700"
              >
                {field.label}
                {field.required && <span className="text-rose-600"> *</span>}

                {field.options ? (
                  <select
                    required={field.required}
                    value={String(value ?? "")}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        [field.name]: e.target.value || null,
                      })
                    }
                    className={inputClass}
                  >
                    <option value="">Select...</option>

                    {field.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type ?? "text"}
                    required={field.required}
                    value={
                      field.type === "datetime-local"
                        ? toDateTimeLocalValue(value)
                        : String(value ?? "")
                    }
                    onChange={(e) =>
                      setForm({
                        ...form,
                        [field.name]:
                          field.type === "number"
                            ? e.target.value === ""
                              ? ""
                              : Number(e.target.value)
                            : e.target.value,
                      })
                    }
                    className={inputClass}
                  />
                )}
              </label>
            );
          })}

          <div className="flex flex-col-reverse gap-3 pt-2 sm:col-span-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}

function toDateTimeLocalValue(value: unknown) {
  if (!value) return "";

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  const pad = (num: number) => String(num).padStart(2, "0");

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}