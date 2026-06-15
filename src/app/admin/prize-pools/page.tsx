"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import Swal from "sweetalert2";
import {
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Gift,
  ImageIcon,
  LinkIcon,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Store,
  Trash2,
  Trophy,
  UploadCloud,
  X,
} from "lucide-react";

import { Modal } from "@/components/admin/Modal";
import { LoadingSpinner } from "@/components/admin/LoadingSpinner";
import { supabase } from "@/lib/supabaseClient";
import { formatDateTime, friendlyError } from "@/lib/supabaseHelpers";

const IMAGE_BUCKET = "match-prize-pools";
const MAX_IMAGE_BYTES = 500000;

type MatchRow = {
  id: string;
  match_title: string | null;
  stage: string | null;
  match_start_at: string | null;
  status: string | null;
  team_a_name?: string | null;
  team_b_name?: string | null;
  team_a_score?: number | null;
  team_b_score?: number | null;
};

type PrizePoolRow = {
  id: string;
  match_id: string;

  title: string;
  description: string | null;

  prize_1: string | null;
  prize_2: string | null;
  prize_3: string | null;

  prize_1_subtitle: string | null;
  prize_2_subtitle: string | null;
  prize_3_subtitle: string | null;

  prize_1_icon: string | null;
  prize_2_icon: string | null;
  prize_3_icon: string | null;

  sponsor_name: string | null;
  sponsor_business_name: string | null;
  sponsor_location: string | null;
  sponsor_badge_text: string | null;
  sponsor_label: string | null;
  sponsor_logo_url: string | null;
  sponsor_hero_image_url: string | null;
  sponsor_link_url: string | null;
  sponsor_cta_text: string | null;

  banner_image_url: string | null;
  card_variant: string | null;
  reward_title: string | null;
  highlight_text: string | null;
  terms: string | null;

  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
};

type PrizePoolForm = {
  match_id: string;

  title: string;
  description: string;

  card_variant: string;
  sponsor_badge_text: string;
  sponsor_label: string;

  sponsor_name: string;
  sponsor_business_name: string;
  sponsor_location: string;
  sponsor_logo_url: string;
  sponsor_hero_image_url: string;
  sponsor_link_url: string;
  sponsor_cta_text: string;

  banner_image_url: string;

  reward_title: string;
  highlight_text: string;

  prize_1: string;
  prize_1_subtitle: string;
  prize_1_icon: string;

  prize_2: string;
  prize_2_subtitle: string;
  prize_2_icon: string;

  prize_3: string;
  prize_3_subtitle: string;
  prize_3_icon: string;

  terms: string;
  is_active: boolean;
  starts_at: string;
  ends_at: string;
};

type ImageField =
  | "sponsor_logo_url"
  | "sponsor_hero_image_url"
  | "banner_image_url";

const emptyForm: PrizePoolForm = {
  match_id: "",

  title: "Today's Prize Pool",
  description: "",

  card_variant: "compact_offer",
  sponsor_badge_text: "SPONSORED",
  sponsor_label: "OFFICIAL MATCH SPONSOR",

  sponsor_name: "",
  sponsor_business_name: "",
  sponsor_location: "",
  sponsor_logo_url: "",
  sponsor_hero_image_url: "",
  sponsor_link_url: "",
  sponsor_cta_text: "Visit Sponsor",

  banner_image_url: "",

  reward_title: "PREDICT & WIN EXCLUSIVE REWARDS!",
  highlight_text: "Watch, predict and win exclusive gifts from our match partner.",

  prize_1: "",
  prize_1_subtitle: "",
  prize_1_icon: "voucher",

  prize_2: "",
  prize_2_subtitle: "",
  prize_2_icon: "dinner",

  prize_3: "",
  prize_3_subtitle: "",
  prize_3_icon: "jersey",

  terms:
    "Only eligible predictions will be considered. If multiple users have the same points, the earliest submitted prediction wins. Admin decision is final.",

  is_active: true,
  starts_at: "",
  ends_at: "",
};

export default function PrizePoolsPage() {
  const [pools, setPools] = useState<PrizePoolRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<ImageField | null>(null);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PrizePoolRow | null>(null);
  const [form, setForm] = useState<PrizePoolForm>(emptyForm);

  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [matchFilter, setMatchFilter] = useState("all");

  async function load() {
    setLoading(true);

    const [poolResult, matchResult] = await Promise.all([
      supabase
        .from("match_prize_pools")
        .select("*")
        .order("updated_at", { ascending: false }),

      supabase
        .from("fixtures_view")
        .select(
          "id, match_title, stage, match_start_at, status, team_a_name, team_b_name, team_a_score, team_b_score"
        )
        .order("match_start_at", { ascending: false }),
    ]);

    if (poolResult.error) {
      setPools([]);
      Swal.fire("Load failed", friendlyError(poolResult.error), "error");
      setLoading(false);
      return;
    }

    if (matchResult.error) {
      setMatches([]);
      Swal.fire("Load failed", friendlyError(matchResult.error), "error");
      setLoading(false);
      return;
    }

    setPools((poolResult.data ?? []) as PrizePoolRow[]);
    setMatches((matchResult.data ?? []) as MatchRow[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const matchMap = useMemo(() => {
    return new Map(matches.map((match) => [match.id, match]));
  }, [matches]);

  const filteredPools = useMemo(() => {
    const q = search.trim().toLowerCase();

    return pools.filter((pool) => {
      const match = matchMap.get(pool.match_id);

      const matchesMatch =
        matchFilter === "all" || pool.match_id === matchFilter;

      const matchesActive =
        activeFilter === "all" ||
        (activeFilter === "active" && pool.is_active) ||
        (activeFilter === "inactive" && !pool.is_active);

      const text = [
        pool.title,
        pool.description,
        pool.prize_1,
        pool.prize_1_subtitle,
        pool.prize_2,
        pool.prize_2_subtitle,
        pool.prize_3,
        pool.prize_3_subtitle,
        pool.sponsor_name,
        pool.sponsor_business_name,
        pool.sponsor_location,
        pool.sponsor_badge_text,
        pool.sponsor_label,
        pool.reward_title,
        pool.highlight_text,
        pool.terms,
        match?.match_title,
        match?.team_a_name,
        match?.team_b_name,
        match?.stage,
        match?.status,
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = !q || text.includes(q);

      return matchesMatch && matchesActive && matchesSearch;
    });
  }, [pools, matchMap, search, activeFilter, matchFilter]);

  const totalPools = filteredPools.length;
  const activePools = filteredPools.filter((pool) => pool.is_active).length;
  const inactivePools = filteredPools.filter((pool) => !pool.is_active).length;
  const withSponsorImage = filteredPools.filter(
    (pool) => pool.sponsor_hero_image_url || pool.banner_image_url
  ).length;

  const selectedMatch = matchFilter === "all" ? null : matchMap.get(matchFilter);

  function start(row?: PrizePoolRow) {
    setEditing(row ?? null);

    setForm(
      row
        ? {
            match_id: row.match_id ?? "",

            title: row.title ?? "Today's Prize Pool",
            description: row.description ?? "",

            card_variant: row.card_variant ?? "compact_offer",
            sponsor_badge_text: row.sponsor_badge_text ?? "SPONSORED",
            sponsor_label: row.sponsor_label ?? "OFFICIAL MATCH SPONSOR",

            sponsor_name: row.sponsor_name ?? "",
            sponsor_business_name: row.sponsor_business_name ?? "",
            sponsor_location: row.sponsor_location ?? "",
            sponsor_logo_url: row.sponsor_logo_url ?? "",
            sponsor_hero_image_url: row.sponsor_hero_image_url ?? "",
            sponsor_link_url: row.sponsor_link_url ?? "",
            sponsor_cta_text: row.sponsor_cta_text ?? "Visit Sponsor",

            banner_image_url: row.banner_image_url ?? "",

            reward_title:
              row.reward_title ?? "PREDICT & WIN EXCLUSIVE REWARDS!",
            highlight_text:
              row.highlight_text ??
              "Watch, predict and win exclusive gifts from our match partner.",

            prize_1: row.prize_1 ?? "",
            prize_1_subtitle: row.prize_1_subtitle ?? "",
            prize_1_icon: row.prize_1_icon ?? "voucher",

            prize_2: row.prize_2 ?? "",
            prize_2_subtitle: row.prize_2_subtitle ?? "",
            prize_2_icon: row.prize_2_icon ?? "dinner",

            prize_3: row.prize_3 ?? "",
            prize_3_subtitle: row.prize_3_subtitle ?? "",
            prize_3_icon: row.prize_3_icon ?? "jersey",

            terms: row.terms ?? "",
            is_active: Boolean(row.is_active),
            starts_at: toDateTimeLocalValue(row.starts_at),
            ends_at: toDateTimeLocalValue(row.ends_at),
          }
        : {
            ...emptyForm,
            match_id: matchFilter === "all" ? "" : matchFilter,
          }
    );

    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setEditing(null);
    setForm(emptyForm);
    setUploadingField(null);
  }

  function cleanPayload() {
    return {
      match_id: form.match_id,

      title: form.title.trim(),
      description: nullableText(form.description),

      card_variant: nullableText(form.card_variant) ?? "compact_offer",
      sponsor_badge_text: nullableText(form.sponsor_badge_text) ?? "SPONSORED",
      sponsor_label:
        nullableText(form.sponsor_label) ?? "OFFICIAL MATCH SPONSOR",

      sponsor_name: nullableText(form.sponsor_name),
      sponsor_business_name: nullableText(form.sponsor_business_name),
      sponsor_location: nullableText(form.sponsor_location),
      sponsor_logo_url: nullableText(form.sponsor_logo_url),
      sponsor_hero_image_url: nullableText(form.sponsor_hero_image_url),
      sponsor_link_url: nullableText(form.sponsor_link_url),
      sponsor_cta_text: nullableText(form.sponsor_cta_text) ?? "Visit Sponsor",

      banner_image_url: nullableText(form.banner_image_url),

      reward_title:
        nullableText(form.reward_title) ??
        "PREDICT & WIN EXCLUSIVE REWARDS!",
      highlight_text: nullableText(form.highlight_text),

      prize_1: nullableText(form.prize_1),
      prize_1_subtitle: nullableText(form.prize_1_subtitle),
      prize_1_icon: nullableText(form.prize_1_icon) ?? "voucher",

      prize_2: nullableText(form.prize_2),
      prize_2_subtitle: nullableText(form.prize_2_subtitle),
      prize_2_icon: nullableText(form.prize_2_icon) ?? "dinner",

      prize_3: nullableText(form.prize_3),
      prize_3_subtitle: nullableText(form.prize_3_subtitle),
      prize_3_icon: nullableText(form.prize_3_icon) ?? "jersey",

      terms: nullableText(form.terms),
      is_active: Boolean(form.is_active),
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
    };
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!form.match_id) {
      Swal.fire("Missing match", "Please select a match.", "warning");
      return;
    }

    if (!form.title.trim()) {
      Swal.fire("Missing title", "Please enter a prize pool title.", "warning");
      return;
    }

    if (!form.sponsor_business_name.trim() && !form.sponsor_name.trim()) {
      Swal.fire(
        "Missing sponsor",
        "Please enter the sponsor or business name.",
        "warning"
      );
      return;
    }

    setSaving(true);

    const payload = cleanPayload();

    const result = editing?.id
      ? await supabase
          .from("match_prize_pools")
          .update(payload)
          .eq("id", editing.id)
      : await supabase
          .from("match_prize_pools")
          .upsert(payload, { onConflict: "match_id" });

    setSaving(false);

    if (result.error) {
      Swal.fire("Save failed", friendlyError(result.error), "error");
      return;
    }

    closeModal();
    await load();

    Swal.fire({
      title: "Saved",
      text: "Prize pool saved successfully.",
      icon: "success",
      timer: 1400,
      showConfirmButton: false,
    });
  }

  async function remove(row: PrizePoolRow) {
    const ok = await Swal.fire({
      title: "Delete prize pool?",
      text: "This cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Delete",
      cancelButtonText: "Cancel",
    });

    if (!ok.isConfirmed) return;

    const { error } = await supabase
      .from("match_prize_pools")
      .delete()
      .eq("id", row.id);

    if (error) {
      Swal.fire("Delete failed", friendlyError(error), "error");
      return;
    }

    await load();

    Swal.fire({
      title: "Deleted",
      text: "Prize pool removed.",
      icon: "success",
      timer: 1200,
      showConfirmButton: false,
    });
  }

  async function toggleActive(row: PrizePoolRow) {
    const { error } = await supabase
      .from("match_prize_pools")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);

    if (error) {
      Swal.fire("Update failed", friendlyError(error), "error");
      return;
    }

    setPools((current) =>
      current.map((item) =>
        item.id === row.id ? { ...item, is_active: !item.is_active } : item
      )
    );
  }

  async function uploadImage(
    event: ChangeEvent<HTMLInputElement>,
    field: ImageField
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!form.match_id) {
      Swal.fire(
        "Select match first",
        "Please select a match before uploading image.",
        "warning"
      );
      return;
    }

    const allowedTypes = ["image/webp", "image/jpeg", "image/png"];

    if (!allowedTypes.includes(file.type)) {
      Swal.fire(
        "Invalid file",
        "Only WebP, JPG and PNG images are allowed.",
        "warning"
      );
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      Swal.fire(
        "Image too large",
        `Please upload an optimized image below 500 KB. Current size: ${formatBytes(
          file.size
        )}`,
        "warning"
      );
      return;
    }

    setUploadingField(field);

    const ext = getSafeExtension(file);
    const path = `${form.match_id}/${field}-${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from(IMAGE_BUCKET)
      .upload(path, file, {
        cacheControl: "31536000",
        contentType: file.type,
        upsert: false,
      });

    setUploadingField(null);

    if (error) {
      Swal.fire("Upload failed", friendlyError(error), "error");
      return;
    }

    const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);

    setForm((prev) => ({
      ...prev,
      [field]: data.publicUrl,
    }));

    Swal.fire({
      title: "Uploaded",
      text: "Image uploaded successfully.",
      icon: "success",
      timer: 1200,
      showConfirmButton: false,
    });
  }

  const inputClass =
    "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100";

  const smallInputClass =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100";

  return (
    <section className="space-y-5">
      <div className="overflow-hidden rounded-[1.7rem] border border-slate-200 bg-white shadow-sm">
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 px-5 py-5 text-white sm:px-6">
          <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-emerald-400/20 blur-3xl" />
          <div className="absolute -bottom-20 left-20 h-44 w-44 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                <Gift className="h-3.5 w-3.5" />
                Sponsored Business Rewards
              </div>

              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
                Prize Pools
              </h1>

              <p className="mt-1 max-w-2xl text-sm text-slate-300">
                Manage match-wise sponsors, business images, location, reward
                details and active prize announcements.
              </p>
            </div>

            <button
              onClick={() => start()}
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-emerald-950/20 transition hover:bg-emerald-400"
            >
              <Plus className="h-4 w-4" />
              Add Prize Pool
            </button>
          </div>
        </div>

        <div className="grid gap-3 border-b border-slate-100 bg-slate-50/80 p-4 sm:grid-cols-4 sm:p-5">
          <StatCard label="Prize Pools" value={totalPools} />
          <StatCard label="Active" value={activePools} />
          <StatCard label="Inactive" value={inactivePools} />
          <StatCard label="With Images" value={withSponsorImage} />
        </div>

        <div className="border-b border-slate-100 bg-white px-5 py-4 sm:px-6">
          <div className="mb-3 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                Filter by Match
              </p>

              <select
                value={matchFilter}
                onChange={(event) => setMatchFilter(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              >
                <option value="all">All Matches</option>

                {matches.map((match) => (
                  <option key={match.id} value={match.id}>
                    {getMatchLabel(match)}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-xl bg-white px-4 py-2.5 text-sm font-black text-slate-700 ring-1 ring-slate-200">
              {selectedMatch
                ? `${filteredPools.length} prize pool found`
                : "Showing all prize pools"}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search match, prize, sponsor, business or location..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              />

              {search && (
                <button
                  onClick={() => setSearch("")}
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <select
              value={activeFilter}
              onChange={(event) => setActiveFilter(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
            >
              <option value="all">All Status</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>

            <button
              onClick={() => void load()}
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {loading ? (
            <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50">
              <LoadingSpinner />
            </div>
          ) : filteredPools.length === 0 ? (
            <EmptyBlock text="No prize pools found." />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="grid grid-cols-[1.3fr_1fr_1fr_1.2fr_120px_120px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-500">
                <div>Match</div>
                <div>Sponsor</div>
                <div>Location</div>
                <div>Rewards</div>
                <div>Status</div>
                <div className="text-right">Action</div>
              </div>

              <div className="divide-y divide-slate-100">
                {filteredPools.map((pool) => {
                  const match = matchMap.get(pool.match_id);

                  return (
                    <PrizePoolListRow
                      key={pool.id}
                      pool={pool}
                      match={match}
                      onEdit={() => start(pool)}
                      onDelete={() => void remove(pool)}
                      onToggle={() => void toggleActive(pool)}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal
        title={`${editing ? "Edit" : "Add"} Sponsored Prize Pool`}
        open={open}
        onClose={closeModal}
        maxWidth="max-w-6xl"
      >
        <form onSubmit={save} className="space-y-5">
          <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
            <label className="text-sm font-bold text-slate-700 sm:col-span-2">
              Match <span className="text-rose-600">*</span>

              <select
                required
                value={form.match_id}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    match_id: event.target.value,
                  }))
                }
                className={inputClass}
              >
                <option value="">Select match...</option>

                {matches.map((match) => (
                  <option key={match.id} value={match.id}>
                    {getMatchLabel(match)}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-bold text-slate-700">
              Prize Pool Title <span className="text-rose-600">*</span>

              <input
                required
                value={form.title}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    title: event.target.value,
                  }))
                }
                className={inputClass}
              />
            </label>

            <label className="text-sm font-bold text-slate-700">
              Card Variant

              <select
                value={form.card_variant}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    card_variant: event.target.value,
                  }))
                }
                className={inputClass}
              >
                <option value="compact_offer">Compact Offer Card</option>
                <option value="premium_split">Premium Split Hero</option>
                <option value="rewards_first">Rewards First</option>
                <option value="glass_spotlight">Glass Spotlight</option>
                <option value="stacked_story">Stacked Story Card</option>
              </select>
            </label>

            <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700 sm:col-span-2">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    is_active: event.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              Active Prize Pool
            </label>
          </div>

          <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
            <SectionTitle
              icon={<Store className="h-4 w-4" />}
              title="Sponsor / Business Details"
            />

            <label className="text-sm font-bold text-slate-700">
              Sponsor Badge Text

              <input
                value={form.sponsor_badge_text}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    sponsor_badge_text: event.target.value,
                  }))
                }
                placeholder="SPONSORED"
                className={inputClass}
              />
            </label>

            <label className="text-sm font-bold text-slate-700">
              Sponsor Label

              <input
                value={form.sponsor_label}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    sponsor_label: event.target.value,
                  }))
                }
                placeholder="OFFICIAL MATCH SPONSOR"
                className={inputClass}
              />
            </label>

            <label className="text-sm font-bold text-slate-700">
              Sponsor Name

              <input
                value={form.sponsor_name}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    sponsor_name: event.target.value,
                  }))
                }
                placeholder="Cafe Shillong Arena"
                className={inputClass}
              />
            </label>

            <label className="text-sm font-bold text-slate-700">
              Business Display Name

              <input
                value={form.sponsor_business_name}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    sponsor_business_name: event.target.value,
                  }))
                }
                placeholder="Cafe Shillong Arena"
                className={inputClass}
              />
            </label>

            <label className="text-sm font-bold text-slate-700">
              Location

              <input
                value={form.sponsor_location}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    sponsor_location: event.target.value,
                  }))
                }
                placeholder="Police Bazaar, Shillong"
                className={inputClass}
              />
            </label>

            <label className="text-sm font-bold text-slate-700">
              Sponsor Link URL

              <input
                type="url"
                value={form.sponsor_link_url}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    sponsor_link_url: event.target.value,
                  }))
                }
                placeholder="https://..."
                className={inputClass}
              />
            </label>

            <label className="text-sm font-bold text-slate-700">
              CTA Button Text

              <input
                value={form.sponsor_cta_text}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    sponsor_cta_text: event.target.value,
                  }))
                }
                placeholder="Visit Sponsor"
                className={inputClass}
              />
            </label>
          </div>

          <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
            <SectionTitle
              icon={<ImageIcon className="h-4 w-4" />}
              title="Images"
              note="Upload optimized WebP/JPG/PNG under 500 KB."
            />

            <ImageUploadField
              label="Sponsor Hero Image"
              field="sponsor_hero_image_url"
              value={form.sponsor_hero_image_url}
              inputClass={smallInputClass}
              uploadingField={uploadingField}
              onChangeText={(value) =>
                setForm((prev) => ({
                  ...prev,
                  sponsor_hero_image_url: value,
                }))
              }
              onUpload={uploadImage}
            />

            <ImageUploadField
              label="Sponsor Logo"
              field="sponsor_logo_url"
              value={form.sponsor_logo_url}
              inputClass={smallInputClass}
              uploadingField={uploadingField}
              onChangeText={(value) =>
                setForm((prev) => ({
                  ...prev,
                  sponsor_logo_url: value,
                }))
              }
              onUpload={uploadImage}
            />

            <ImageUploadField
              label="Legacy Banner Image URL"
              field="banner_image_url"
              value={form.banner_image_url}
              inputClass={smallInputClass}
              uploadingField={uploadingField}
              onChangeText={(value) =>
                setForm((prev) => ({
                  ...prev,
                  banner_image_url: value,
                }))
              }
              onUpload={uploadImage}
            />
          </div>

          <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4">
            <SectionTitle
              icon={<Gift className="h-4 w-4" />}
              title="Rewards"
              note="Use title + subtitle to get the exact mobile card style."
            />

            <label className="text-sm font-bold text-slate-700">
              Reward Section Title

              <input
                value={form.reward_title}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    reward_title: event.target.value,
                  }))
                }
                className={inputClass}
              />
            </label>

            <label className="text-sm font-bold text-slate-700">
              Highlight Text

              <input
                value={form.highlight_text}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    highlight_text: event.target.value,
                  }))
                }
                className={inputClass}
              />
            </label>

            <div className="grid gap-3 md:grid-cols-3">
              <RewardInputs
                label="Reward 1"
                title={form.prize_1}
                subtitle={form.prize_1_subtitle}
                icon={form.prize_1_icon}
                onTitle={(value) =>
                  setForm((prev) => ({ ...prev, prize_1: value }))
                }
                onSubtitle={(value) =>
                  setForm((prev) => ({ ...prev, prize_1_subtitle: value }))
                }
                onIcon={(value) =>
                  setForm((prev) => ({ ...prev, prize_1_icon: value }))
                }
              />

              <RewardInputs
                label="Reward 2"
                title={form.prize_2}
                subtitle={form.prize_2_subtitle}
                icon={form.prize_2_icon}
                onTitle={(value) =>
                  setForm((prev) => ({ ...prev, prize_2: value }))
                }
                onSubtitle={(value) =>
                  setForm((prev) => ({ ...prev, prize_2_subtitle: value }))
                }
                onIcon={(value) =>
                  setForm((prev) => ({ ...prev, prize_2_icon: value }))
                }
              />

              <RewardInputs
                label="Reward 3"
                title={form.prize_3}
                subtitle={form.prize_3_subtitle}
                icon={form.prize_3_icon}
                onTitle={(value) =>
                  setForm((prev) => ({ ...prev, prize_3: value }))
                }
                onSubtitle={(value) =>
                  setForm((prev) => ({ ...prev, prize_3_subtitle: value }))
                }
                onIcon={(value) =>
                  setForm((prev) => ({ ...prev, prize_3_icon: value }))
                }
              />
            </div>
          </div>

          <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
            <SectionTitle
              icon={<CalendarClock className="h-4 w-4" />}
              title="Schedule and Terms"
            />

            <label className="text-sm font-bold text-slate-700">
              Starts At

              <input
                type="datetime-local"
                value={form.starts_at}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    starts_at: event.target.value,
                  }))
                }
                className={inputClass}
              />
            </label>

            <label className="text-sm font-bold text-slate-700">
              Ends At

              <input
                type="datetime-local"
                value={form.ends_at}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    ends_at: event.target.value,
                  }))
                }
                className={inputClass}
              />
            </label>

            <label className="text-sm font-bold text-slate-700 sm:col-span-2">
              Description

              <textarea
                value={form.description}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }))
                }
                rows={3}
                placeholder="Short prize announcement shown to users..."
                className={inputClass}
              />
            </label>

            <label className="text-sm font-bold text-slate-700 sm:col-span-2">
              Terms

              <textarea
                value={form.terms}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    terms: event.target.value,
                  }))
                }
                rows={3}
                className={inputClass}
              />
            </label>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={closeModal}
              className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving || uploadingField !== null}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Gift className="h-4 w-4" />
              )}
              {saving ? "Saving..." : "Save Prize Pool"}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}

function PrizePoolListRow({
  pool,
  match,
  onEdit,
  onDelete,
  onToggle,
}: {
  pool: PrizePoolRow;
  match?: MatchRow;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const businessName =
    pool.sponsor_business_name || pool.sponsor_name || "—";

  const rewards = [
    [pool.prize_1, pool.prize_1_subtitle].filter(Boolean).join(" "),
    [pool.prize_2, pool.prize_2_subtitle].filter(Boolean).join(" "),
    [pool.prize_3, pool.prize_3_subtitle].filter(Boolean).join(" "),
  ].filter(Boolean);

  const hasImages = Boolean(
    pool.sponsor_hero_image_url ||
      pool.sponsor_logo_url ||
      pool.banner_image_url
  );

  return (
    <div className="grid grid-cols-[1.3fr_1fr_1fr_1.2fr_120px_120px] items-center gap-3 px-4 py-3 text-sm hover:bg-slate-50">
      <div className="min-w-0">
        <p className="truncate font-black text-slate-950">
          {getMatchLabel(match)}
        </p>
        <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">
          {formatDateTime(match?.match_start_at ?? null)}
        </p>
      </div>

      <div className="min-w-0">
        <p className="truncate font-bold text-slate-800">
          {businessName}
        </p>
        <p className="mt-0.5 truncate text-xs font-semibold text-amber-700">
          {pool.sponsor_label || "OFFICIAL MATCH SPONSOR"}
        </p>
      </div>

      <div className="min-w-0">
        <p className="truncate font-semibold text-slate-600">
          {pool.sponsor_location || "—"}
        </p>

        {hasImages && (
          <p className="mt-0.5 text-xs font-bold text-emerald-700">
            Images added
          </p>
        )}
      </div>

      <div className="min-w-0">
        {rewards.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {rewards.slice(0, 3).map((reward, index) => (
              <span
                key={index}
                className="max-w-[120px] truncate rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700"
              >
                {reward}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-xs font-semibold text-slate-400">
            No rewards
          </span>
        )}
      </div>

      <div>
        <button
          type="button"
          onClick={onToggle}
          className={`rounded-full px-3 py-1.5 text-xs font-black ${
            pool.is_active
              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
              : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
          }`}
        >
          {pool.is_active ? "Active" : "Inactive"}
        </button>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-100"
        >
          Edit
        </button>

        <button
          type="button"
          onClick={onDelete}
          className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-700 hover:bg-rose-100"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function SectionTitle({
  icon,
  title,
  note,
}: {
  icon: React.ReactNode;
  title: string;
  note?: string;
}) {
  return (
    <div className="sm:col-span-2">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
          {icon}
        </div>

        <div>
          <h3 className="text-sm font-black text-slate-950">{title}</h3>
          {note && <p className="text-xs font-semibold text-slate-500">{note}</p>}
        </div>
      </div>
    </div>
  );
}

function ImageUploadField({
  label,
  field,
  value,
  inputClass,
  uploadingField,
  onChangeText,
  onUpload,
}: {
  label: string;
  field: ImageField;
  value: string;
  inputClass: string;
  uploadingField: ImageField | null;
  onChangeText: (value: string) => void;
  onUpload: (
    event: ChangeEvent<HTMLInputElement>,
    field: ImageField
  ) => Promise<void>;
}) {
  const uploading = uploadingField === field;

  return (
    <div className="space-y-2">
      <label className="text-sm font-bold text-slate-700">{label}</label>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
        <div className="flex h-32 items-center justify-center bg-white">
          {value ? (
            <img src={value} alt={label} className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-8 w-8 text-slate-400" />
          )}
        </div>

        <div className="space-y-2 p-3">
          <input
            value={value}
            onChange={(event) => onChangeText(event.target.value)}
            placeholder="Paste public image URL..."
            className={inputClass}
          />

          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 transition hover:bg-emerald-100">
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UploadCloud className="h-4 w-4" />
            )}

            {uploading ? "Uploading..." : "Upload image under 500 KB"}

            <input
              type="file"
              accept="image/webp,image/jpeg,image/png"
              disabled={uploadingField !== null}
              onChange={(event) => void onUpload(event, field)}
              className="hidden"
            />
          </label>
        </div>
      </div>
    </div>
  );
}

function RewardInputs({
  label,
  title,
  subtitle,
  icon,
  onTitle,
  onSubtitle,
  onIcon,
}: {
  label: string;
  title: string;
  subtitle: string;
  icon: string;
  onTitle: (value: string) => void;
  onSubtitle: (value: string) => void;
  onIcon: (value: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-black uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <div className="mt-3 space-y-2">
        <input
          value={title}
          onChange={(event) => onTitle(event.target.value)}
          placeholder="₹2,000"
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
        />

        <input
          value={subtitle}
          onChange={(event) => onSubtitle(event.target.value)}
          placeholder="Voucher"
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
        />

        <select
          value={icon}
          onChange={(event) => onIcon(event.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
        >
          <option value="voucher">Voucher</option>
          <option value="dinner">Dinner</option>
          <option value="jersey">Jersey</option>
          <option value="gift">Gift</option>
          <option value="ticket">Ticket</option>
          <option value="cash">Cash</option>
        </select>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center">
      <Trophy className="mb-3 h-8 w-8 text-slate-400" />
      <h3 className="text-base font-black text-slate-900">{text}</h3>
    </div>
  );
}

function display(value?: string | number | null) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return "—";
  }

  return String(value);
}

function getMatchLabel(match?: MatchRow | null) {
  if (!match) return "Unknown match";

  const fallbackTeams =
    match.team_a_name && match.team_b_name
      ? `${match.team_a_name} vs ${match.team_b_name}`
      : "Untitled match";

  const title = match.match_title || fallbackTeams;
  const stage = match.stage ? ` · ${match.stage}` : "";
  const status = match.status ? ` · ${match.status}` : "";

  return `${title}${stage}${status}`;
}

function nullableText(value: string) {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function toDateTimeLocalValue(value: string | null) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const pad = (num: number) => String(num).padStart(2, "0");

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function getSafeExtension(file: File) {
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/png") return "png";
  return "jpg";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;

  const kb = bytes / 1024;

  if (kb < 1024) return `${kb.toFixed(1)} KB`;

  return `${(kb / 1024).toFixed(2)} MB`;
}