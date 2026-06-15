"use client";

import {
  CheckCircle2,
  Edit3,
  ExternalLink,
  Link2,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabaseClient";

type AppLinkRow = {
  id: string;
  link_key: string;
  title: string;
  subtitle: string | null;
  button_text: string;
  url: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type FormState = {
  link_key: string;
  title: string;
  subtitle: string;
  button_text: string;
  url: string;
  is_active: boolean;
};

const emptyForm: FormState = {
  link_key: "home_whatsapp_group",
  title: "Join the World Cup Community",
  subtitle:
    "Get updates, prize details, match reminders, and participate with other prediction players.",
  button_text: "Join WhatsApp Group",
  url: "",
  is_active: true,
};

function formatDate(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function isValidUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export default function AppLinksPage() {
  const [rows, setRows] = useState<AppLinkRow[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return rows;

    return rows.filter((item) => {
      return (
        item.link_key.toLowerCase().includes(query) ||
        item.title.toLowerCase().includes(query) ||
        item.url.toLowerCase().includes(query) ||
        item.button_text.toLowerCase().includes(query)
      );
    });
  }, [rows, search]);

  async function loadRows() {
    setLoading(true);
    setMessage(null);

    const { data, error } = await supabase
      .from("app_links")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage({
        type: "error",
        text: error.message || "Could not load app links.",
      });
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data ?? []) as AppLinkRow[]);
    setLoading(false);
  }

  useEffect(() => {
    loadRows();
  }, []);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setMessage(null);
  }

  function editRow(row: AppLinkRow) {
    setEditingId(row.id);
    setForm({
      link_key: row.link_key,
      title: row.title,
      subtitle: row.subtitle ?? "",
      button_text: row.button_text,
      url: row.url,
      is_active: row.is_active,
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function saveRow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    const payload = {
      link_key: normalizeKey(form.link_key),
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      button_text: form.button_text.trim() || "Join Group",
      url: form.url.trim(),
      is_active: form.is_active,
      updated_at: new Date().toISOString(),
    };

    if (!payload.link_key) {
      setMessage({
        type: "error",
        text: "Link key is required.",
      });
      setSaving(false);
      return;
    }

    if (!payload.title) {
      setMessage({
        type: "error",
        text: "Title is required.",
      });
      setSaving(false);
      return;
    }

    if (!isValidUrl(payload.url)) {
      setMessage({
        type: "error",
        text: "Please enter a valid http or https URL.",
      });
      setSaving(false);
      return;
    }

    const request = editingId
      ? supabase.from("app_links").update(payload).eq("id", editingId)
      : supabase.from("app_links").insert(payload);

    const { error } = await request;

    if (error) {
      setMessage({
        type: "error",
        text: error.message || "Could not save app link.",
      });
      setSaving(false);
      return;
    }

    setMessage({
      type: "success",
      text: editingId ? "App link updated successfully." : "App link created successfully.",
    });

    setSaving(false);
    resetForm();
    await loadRows();
  }

  async function toggleStatus(row: AppLinkRow) {
    setMessage(null);

    const { error } = await supabase
      .from("app_links")
      .update({
        is_active: !row.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (error) {
      setMessage({
        type: "error",
        text: error.message || "Could not update status.",
      });
      return;
    }

    await loadRows();
  }

  async function deleteRow(row: AppLinkRow) {
    const confirmed = window.confirm(
      `Delete "${row.title}"? This cannot be undone.`
    );

    if (!confirmed) return;

    setMessage(null);

    const { error } = await supabase.from("app_links").delete().eq("id", row.id);

    if (error) {
      setMessage({
        type: "error",
        text: error.message || "Could not delete app link.",
      });
      return;
    }

    if (editingId === row.id) {
      resetForm();
    }

    setMessage({
      type: "success",
      text: "App link deleted successfully.",
    });

    await loadRows();
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-3xl bg-slate-950 text-white shadow-xl shadow-slate-200">
          <div className="relative p-6 sm:p-7">
            <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-emerald-400/10 blur-3xl" />
            <div className="absolute bottom-0 left-1/2 h-36 w-36 rounded-full bg-cyan-400/10 blur-3xl" />

            <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400/15 ring-1 ring-emerald-300/20">
                  <MessageCircle className="h-6 w-6 text-emerald-300" />
                </div>

                <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
                  App Links
                </h1>

                <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-400">
                  Manage app links like WhatsApp group, community links, support
                  links, and other buttons shown inside the Flutter app.
                </p>
              </div>

              <button
                type="button"
                onClick={loadRows}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-950 shadow-lg transition hover:bg-emerald-50"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>
          </div>
        </section>

        {message ? (
          <div
            className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-bold ${
              message.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            {message.type === "success" ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            ) : (
              <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
            )}

            <span>{message.text}</span>
          </div>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <form
            onSubmit={saveRow}
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-950">
                  {editingId ? "Edit Link" : "Create Link"}
                </h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Use key{" "}
                  <span className="font-black text-emerald-700">
                    home_whatsapp_group
                  </span>{" "}
                  for the home WhatsApp section.
                </p>
              </div>

              {editingId ? (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-xl bg-slate-100 p-2 text-slate-500 transition hover:bg-slate-200 hover:text-slate-900"
                  title="Cancel edit"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">
                  Link Key *
                </span>
                <input
                  value={form.link_key}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      link_key: event.target.value,
                    }))
                  }
                  placeholder="home_whatsapp_group"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-950 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">
                  Title *
                </span>
                <input
                  value={form.title}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      title: event.target.value,
                    }))
                  }
                  placeholder="Join the World Cup Community"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-950 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">
                  Subtitle
                </span>
                <textarea
                  value={form.subtitle}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      subtitle: event.target.value,
                    }))
                  }
                  rows={4}
                  placeholder="Get updates, prize details, match reminders..."
                  className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 text-slate-950 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">
                  Button Text *
                </span>
                <input
                  value={form.button_text}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      button_text: event.target.value,
                    }))
                  }
                  placeholder="Join WhatsApp Group"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-950 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">
                  URL *
                </span>
                <input
                  value={form.url}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      url: event.target.value,
                    }))
                  }
                  placeholder="https://chat.whatsapp.com/..."
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-950 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <p className="text-sm font-black text-slate-950">Active</p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-500">
                    Show this link inside the app.
                  </p>
                </div>

                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      is_active: event.target.checked,
                    }))
                  }
                  className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
              </label>

              <button
                type="submit"
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}

                {editingId ? "Update Link" : "Create Link"}
              </button>
            </div>
          </form>

          <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-black text-slate-950">
                    All App Links
                  </h2>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {filteredRows.length} link
                    {filteredRows.length === 1 ? "" : "s"} found
                  </p>
                </div>

                <div className="relative w-full md:w-80">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search links..."
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm font-semibold text-slate-950 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                  />
                </div>
              </div>
            </div>

            {loading ? (
              <div className="flex h-72 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="flex h-72 flex-col items-center justify-center px-6 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                  <Link2 className="h-7 w-7 text-slate-400" />
                </div>
                <h3 className="text-base font-black text-slate-950">
                  No links found
                </h3>
                <p className="mt-1 max-w-sm text-sm font-medium text-slate-500">
                  Create your WhatsApp group link to show it in the Flutter app.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[900px] w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-black uppercase tracking-wide text-slate-500">
                      <th className="px-5 py-3">Link</th>
                      <th className="px-5 py-3">Key</th>
                      <th className="px-5 py-3">URL</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Updated</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {filteredRows.map((row) => (
                      <tr key={row.id} className="align-top hover:bg-slate-50">
                        <td className="px-5 py-4">
                          <div className="max-w-xs">
                            <p className="truncate text-sm font-black text-slate-950">
                              {row.title}
                            </p>
                            <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                              {row.button_text}
                            </p>
                            {row.subtitle ? (
                              <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-slate-400">
                                {row.subtitle}
                              </p>
                            ) : null}
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <span className="rounded-xl bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700">
                            {row.link_key}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <a
                            href={row.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex max-w-[240px] items-center gap-1 truncate text-xs font-bold text-emerald-700 hover:text-emerald-900"
                          >
                            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{row.url}</span>
                          </a>
                        </td>

                        <td className="px-5 py-4">
                          <button
                            type="button"
                            onClick={() => toggleStatus(row)}
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black ${
                              row.is_active
                                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                                : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                            }`}
                          >
                            {row.is_active ? (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5" />
                            )}

                            {row.is_active ? "Active" : "Inactive"}
                          </button>
                        </td>

                        <td className="px-5 py-4 text-xs font-semibold text-slate-500">
                          {formatDate(row.updated_at)}
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => editRow(row)}
                              className="rounded-xl bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200 hover:text-slate-950"
                              title="Edit"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => deleteRow(row)}
                              className="rounded-xl bg-rose-50 p-2 text-rose-600 transition hover:bg-rose-100"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}