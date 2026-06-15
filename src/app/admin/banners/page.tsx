"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import Swal from "sweetalert2";
import {
  Ban,
  CheckCircle2,
  ExternalLink,
  ImageIcon,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { LoadingSpinner } from "@/components/admin/LoadingSpinner";
import { Modal } from "@/components/admin/Modal";
import { supabase } from "@/lib/supabaseClient";
import { friendlyError, formatDateTime } from "@/lib/supabaseHelpers";

const BUCKET_NAME = "sponsor-banners";
const MAX_IMAGE_BYTES = 500 * 1024;
const MAX_BANNER_WIDTH = 1920;

const placements = [
  { value: "global", label: "Global - All Pages" },
  { value: "home", label: "Home" },
  { value: "fixtures", label: "Fixtures" },
  { value: "prediction", label: "Prediction" },
  { value: "my_predictions", label: "My Predictions" },
  { value: "rules", label: "Rules" },
  { value: "profile", label: "Profile" },
  { value: "winner", label: "Winner" },
  { value: "winners", label: "Winners" },
  { value: "leaderboard", label: "Leaderboard" },
  { value: "match_detail", label: "Match Detail" },
] as const;

const slots = [
  { value: "top", label: "Top" },
  { value: "middle", label: "Middle" },
  { value: "bottom", label: "Bottom" },
  { value: "after_header", label: "After Header" },
  { value: "after_matches", label: "After Matches" },
  { value: "after_results", label: "After Results" },
  { value: "after_predictions", label: "After Predictions" },
  { value: "after_popular_picks", label: "After Popular Picks" },
  { value: "before_list", label: "Before List" },
  { value: "after_list", label: "After List" },
] as const;

type Placement = (typeof placements)[number]["value"];
type Slot = (typeof slots)[number]["value"];

type SponsorBannerRow = {
  id: string;
  title: string;
  image_url: string;
  link_url: string | null;
  placement: Placement;
  slot: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type BannerForm = {
  title: string;
  image_url: string;
  link_url: string;
  placement: Placement;
  slot: string;
  sort_order: number | "";
  is_active: boolean;
};

const emptyForm: BannerForm = {
  title: "",
  image_url: "",
  link_url: "",
  placement: "home",
  slot: "top",
  sort_order: 0,
  is_active: true,
};

export default function BannersPage() {
  const [rows, setRows] = useState<SponsorBannerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [compressing, setCompressing] = useState(false);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SponsorBannerRow | null>(null);
  const [form, setForm] = useState<BannerForm>(emptyForm);

  const [search, setSearch] = useState("");
  const [placementFilter, setPlacementFilter] = useState("all");
  const [slotFilter, setSlotFilter] = useState("all");

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [imageInfo, setImageInfo] = useState("");

  async function load() {
    setLoading(true);

    const { data, error } = await supabase
      .from("sponsor_banners")
      .select(
        `
        id,
        title,
        image_url,
        link_url,
        placement,
        slot,
        sort_order,
        is_active,
        created_at,
        updated_at
      `
      )
      .order("placement", { ascending: true })
      .order("slot", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      setRows([]);
      Swal.fire("Load failed", friendlyError(error), "error");
    } else {
      setRows((data ?? []) as SponsorBannerRow[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesPlacement =
        placementFilter === "all" || row.placement === placementFilter;

      const matchesSlot = slotFilter === "all" || row.slot === slotFilter;

      const rowText = [
        row.title,
        row.image_url,
        row.link_url ?? "",
        row.placement,
        row.slot,
        row.sort_order,
        row.is_active ? "active" : "inactive",
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = !q || rowText.includes(q);

      return matchesPlacement && matchesSlot && matchesSearch;
    });
  }, [rows, search, placementFilter, slotFilter]);

  const activeCount = rows.filter((row) => row.is_active).length;
  const placementCount = new Set(rows.map((row) => row.placement)).size;
  const slotCount = new Set(rows.map((row) => row.slot)).size;

  function replacePreviewUrl(url: string) {
    setPreviewUrl((old) => {
      if (old.startsWith("blob:")) {
        URL.revokeObjectURL(old);
      }

      return url;
    });
  }

  function start(row?: SponsorBannerRow) {
    setEditing(row ?? null);

    setForm(
      row
        ? {
            title: row.title ?? "",
            image_url: row.image_url ?? "",
            link_url: row.link_url ?? "",
            placement: row.placement ?? "home",
            slot: row.slot ?? "top",
            sort_order: row.sort_order ?? 0,
            is_active: Boolean(row.is_active),
          }
        : emptyForm
    );

    setImageFile(null);
    setImageInfo("");
    replacePreviewUrl(row?.image_url ?? "");
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setEditing(null);
    setImageFile(null);
    setImageInfo("");
    replacePreviewUrl("");
    setForm(emptyForm);
  }

  function updateForm<K extends keyof BannerForm>(key: K, value: BannerForm[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));

    if (key === "image_url" && typeof value === "string" && !imageFile) {
      replacePreviewUrl(value);
    }
  }

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      Swal.fire("Invalid file", "Please upload an image file only.", "warning");
      return;
    }

    setCompressing(true);

    try {
      const optimized = await optimizeImageToMaxSize(file);

      setImageFile(optimized);
      setImageInfo(
        `Image ready: ${formatBytes(file.size)} → ${formatBytes(
          optimized.size
        )}`
      );

      replacePreviewUrl(URL.createObjectURL(optimized));
    } catch (error) {
      Swal.fire("Image failed", getErrorMessage(error), "error");
    } finally {
      setCompressing(false);
    }
  }

  async function uploadBannerImage(file: File) {
    const cleanTitle =
      form.title
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "banner";

    const cleanPlacement = form.placement || "home";
    const cleanSlot = form.slot.trim() || "top";
    const unique =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const ext = getFileExtension(file);
    const path = `${cleanPlacement}/${cleanSlot}/${Date.now()}-${unique}-${cleanTitle}.${ext}`;

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(path, file, {
        cacheControl: "31536000",
        contentType: file.type,
        upsert: false,
      });

    if (error) throw error;

    const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);

    return data.publicUrl;
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.title.trim()) {
      Swal.fire("Required", "Banner title is required.", "warning");
      return;
    }

    if (!form.placement) {
      Swal.fire("Required", "Placement is required.", "warning");
      return;
    }

    if (!form.slot.trim()) {
      Swal.fire("Required", "Slot is required.", "warning");
      return;
    }

    if (!imageFile && !form.image_url.trim()) {
      Swal.fire(
        "Required",
        "Please upload an image or paste an image URL.",
        "warning"
      );
      return;
    }

    setSaving(true);

    try {
      let imageUrl = form.image_url.trim();

      if (imageFile) {
        imageUrl = await uploadBannerImage(imageFile);
      }

      const payload = {
        title: form.title.trim(),
        image_url: imageUrl,
        link_url: nullableText(form.link_url),
        placement: form.placement,
        slot: form.slot.trim(),
        sort_order:
          form.sort_order === "" || form.sort_order === null
            ? 0
            : Number(form.sort_order),
        is_active: Boolean(form.is_active),
      };

      const result = editing?.id
        ? await supabase.from("sponsor_banners").update(payload).eq("id", editing.id)
        : await supabase.from("sponsor_banners").insert(payload);

      if (result.error) throw result.error;

      setSaving(false);
      closeModal();
      await load();

      Swal.fire({
        title: "Saved",
        text: "Banner saved successfully.",
        icon: "success",
        timer: 1300,
        showConfirmButton: false,
      });
    } catch (error) {
      setSaving(false);
      Swal.fire("Save failed", friendlyError(error), "error");
    }
  }

  async function toggleActive(row: SponsorBannerRow) {
    const { error } = await supabase
      .from("sponsor_banners")
      .update({
        is_active: !row.is_active,
      })
      .eq("id", row.id);

    if (error) {
      Swal.fire("Update failed", friendlyError(error), "error");
      return;
    }

    await load();
  }

  async function remove(row: SponsorBannerRow) {
    const ok = await Swal.fire({
      title: "Delete banner?",
      text: "This will remove the banner record. The uploaded image URL may still exist in storage.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#dc2626",
    });

    if (!ok.isConfirmed) return;

    const { error } = await supabase
      .from("sponsor_banners")
      .delete()
      .eq("id", row.id);

    if (error) {
      Swal.fire("Delete failed", friendlyError(error), "error");
      return;
    }

    await load();

    Swal.fire({
      title: "Deleted",
      text: "Banner removed successfully.",
      icon: "success",
      timer: 1200,
      showConfirmButton: false,
    });
  }

  return (
    <section className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 px-5 py-5 text-white">
          <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-emerald-400/20 blur-3xl" />
          <div className="absolute -bottom-20 left-20 h-44 w-44 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-medium text-emerald-100">
                <ImageIcon className="h-3.5 w-3.5" />
                Admin Banners
              </div>

              <h1 className="text-2xl font-semibold tracking-tight">
                Sponsor Banners
              </h1>

              <p className="mt-1 max-w-3xl text-sm text-slate-300">
                Create banners by page placement and slot. The app can fetch
                banners dynamically using placement + slot.
              </p>
            </div>

            <button
              onClick={() => start()}
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-xs font-medium text-white shadow-lg shadow-emerald-950/20 transition hover:bg-emerald-400"
            >
              <Plus className="h-4 w-4" />
              Add Banner
            </button>
          </div>
        </div>

        <div className="grid gap-3 bg-slate-50/80 p-4 sm:grid-cols-3">
          <InfoCard label="Total Banners" value={String(rows.length)} />
          <InfoCard label="Active" value={String(activeCount)} />
          <InfoCard
            label="Pages / Slots"
            value={`${placementCount} / ${slotCount}`}
          />
        </div>

        <div className="grid gap-3 border-y border-slate-100 bg-white px-4 py-3 lg:grid-cols-[1fr_180px_180px_auto] lg:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title, placement, slot, link..."
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
            value={placementFilter}
            onChange={(event) => setPlacementFilter(event.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          >
            <option value="all">All Placements</option>

            {placements.map((placement) => (
              <option key={placement.value} value={placement.value}>
                {placement.label}
              </option>
            ))}
          </select>

          <select
            value={slotFilter}
            onChange={(event) => setSlotFilter(event.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          >
            <option value="all">All Slots</option>

            {slots.map((slot) => (
              <option key={slot.value} value={slot.value}>
                {slot.label}
              </option>
            ))}
          </select>

          <button
            onClick={() => void load()}
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50">
              <LoadingSpinner />
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center">
              <div className="mb-3 rounded-xl bg-white p-3 shadow-sm">
                <ImageIcon className="h-7 w-7 text-slate-400" />
              </div>

              <h3 className="text-sm font-semibold text-slate-900">
                No banners found
              </h3>

              <p className="mt-1 max-w-md text-xs text-slate-500">
                Add banners for different pages and slots so the app can display
                them dynamically.
              </p>

              <button
                onClick={() => start()}
                type="button"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-emerald-700"
              >
                <Plus className="h-4 w-4" />
                Add Banner
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2.5">Banner</th>
                      <th className="px-3 py-2.5">Placement</th>
                      <th className="px-3 py-2.5">Slot</th>
                      <th className="px-3 py-2.5">Sort</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5">Created</th>
                      <th className="px-3 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredRows.map((row) => (
                      <tr key={row.id} className="transition hover:bg-slate-50">
                        <td className="px-3 py-2.5">
                          <div className="flex min-w-[300px] items-center gap-3">
                            <div className="h-14 w-24 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                              {row.image_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={row.image_url}
                                  alt={row.title}
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center">
                                  <ImageIcon className="h-5 w-5 text-slate-300" />
                                </div>
                              )}
                            </div>

                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium text-slate-950">
                                {row.title}
                              </p>

                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                {row.link_url ? (
                                  <a
                                    href={row.link_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:text-emerald-800"
                                  >
                                    Open Link
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                ) : (
                                  <span className="text-[11px] text-slate-400">
                                    No link
                                  </span>
                                )}

                                <a
                                  href={row.image_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-800"
                                >
                                  Image
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="whitespace-nowrap px-3 py-2.5">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200">
                            {labelForPlacement(row.placement)}
                          </span>
                        </td>

                        <td className="whitespace-nowrap px-3 py-2.5">
                          <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-[11px] font-medium text-cyan-700 ring-1 ring-cyan-100">
                            {labelForSlot(row.slot)}
                          </span>
                        </td>

                        <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                          {row.sort_order}
                        </td>

                        <td className="whitespace-nowrap px-3 py-2.5">
                          <button
                            onClick={() => void toggleActive(row)}
                            type="button"
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 transition ${
                              row.is_active
                                ? "bg-emerald-50 text-emerald-700 ring-emerald-100 hover:bg-emerald-100"
                                : "bg-rose-50 text-rose-700 ring-rose-100 hover:bg-rose-100"
                            }`}
                          >
                            {row.is_active ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : (
                              <Ban className="h-3 w-3" />
                            )}
                            {row.is_active ? "Active" : "Inactive"}
                          </button>
                        </td>

                        <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">
                          {formatDateTime(row.created_at)}
                        </td>

                        <td className="whitespace-nowrap px-3 py-2.5">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => start(row)}
                              type="button"
                              title="Edit"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>

                            <button
                              onClick={() => void remove(row)}
                              type="button"
                              title="Delete"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-100 bg-rose-50 text-rose-600 transition hover:bg-rose-100"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal
        title={`${editing ? "Edit" : "Add"} Sponsor Banner`}
        open={open}
        onClose={closeModal}
      >
        <form onSubmit={save} className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-700 sm:col-span-2">
              Title <span className="text-rose-600">*</span>
              <input
                required
                value={form.title}
                onChange={(event) => updateForm("title", event.target.value)}
                placeholder="Example: Official sponsor banner"
                className={inputClass}
              />
            </label>

            <label className="text-xs font-medium text-slate-700">
              Placement <span className="text-rose-600">*</span>
              <select
                required
                value={form.placement}
                onChange={(event) =>
                  updateForm("placement", event.target.value as Placement)
                }
                className={inputClass}
              >
                {placements.map((placement) => (
                  <option key={placement.value} value={placement.value}>
                    {placement.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-medium text-slate-700">
              Slot <span className="text-rose-600">*</span>
              <select
                required
                value={form.slot}
                onChange={(event) => updateForm("slot", event.target.value)}
                className={inputClass}
              >
                {slots.map((slot) => (
                  <option key={slot.value} value={slot.value}>
                    {slot.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-medium text-slate-700">
              Sort Order
              <input
                type="number"
                value={form.sort_order}
                onChange={(event) =>
                  updateForm(
                    "sort_order",
                    event.target.value === "" ? "" : Number(event.target.value)
                  )
                }
                className={inputClass}
              />
            </label>

            <label className="text-xs font-medium text-slate-700">
              Link URL
              <input
                value={form.link_url}
                onChange={(event) => updateForm("link_url", event.target.value)}
                placeholder="https://example.com"
                className={inputClass}
              />
            </label>

            <label className="text-xs font-medium text-slate-700 sm:col-span-2">
              Image URL
              <input
                value={form.image_url}
                onChange={(event) => updateForm("image_url", event.target.value)}
                placeholder="Paste image URL or upload image"
                className={inputClass}
              />
            </label>

            <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-medium text-slate-700 sm:col-span-2">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) =>
                  updateForm("is_active", event.currentTarget.checked)
                }
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              Active banner
            </label>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-xs font-semibold text-slate-800">
              Banner Image
            </p>

            <div className="overflow-hidden rounded-xl border border-dashed border-slate-300 bg-white">
              <div className="aspect-[16/7] w-full bg-slate-100">
                {previewUrl || form.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl || form.image_url}
                    alt="Banner preview"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center text-slate-400">
                    <ImageIcon className="h-8 w-8" />
                    <p className="mt-2 text-xs">No image selected</p>
                  </div>
                )}
              </div>
            </div>

            <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50">
              {compressing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {compressing ? "Optimizing..." : "Upload Image"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleImageChange}
                className="hidden"
              />
            </label>

            <p className="mt-2 text-[11px] leading-5 text-slate-500">
              Recommended: rectangle banner. File will be optimized to max{" "}
              {formatBytes(MAX_IMAGE_BYTES)}.
            </p>

            {imageInfo && (
              <p className="mt-2 rounded-lg bg-emerald-50 px-2 py-1.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-100">
                {imageInfo}
              </p>
            )}
          </div>

          <div className="flex flex-col-reverse gap-3 pt-2 lg:col-span-2 lg:flex-row lg:justify-end">
            <button
              type="button"
              onClick={closeModal}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving || compressing}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving..." : "Save Banner"}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p className="mt-1 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function labelForPlacement(value: string) {
  return placements.find((placement) => placement.value === value)?.label ?? value;
}

function labelForSlot(value: string) {
  return slots.find((slot) => slot.value === value)?.label ?? value;
}

function nullableText(value: string) {
  const text = value.trim();
  return text.length === 0 ? null : text;
}

function getFileExtension(file: File) {
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";

  const namePart = file.name.split(".").pop()?.toLowerCase();
  return namePart || "webp";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

async function optimizeImageToMaxSize(file: File): Promise<File> {
  if (file.size <= MAX_IMAGE_BYTES && file.type !== "image/gif") {
    return file;
  }

  const image = await loadImage(file);

  let width = image.width;
  let height = image.height;

  if (width > MAX_BANNER_WIDTH) {
    const ratio = MAX_BANNER_WIDTH / width;
    width = MAX_BANNER_WIDTH;
    height = Math.round(height * ratio);
  }

  for (let scaleTry = 0; scaleTry < 6; scaleTry += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Could not process image.");
    }

    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (let quality = 0.88; quality >= 0.42; quality -= 0.08) {
      const blob = await canvasToBlob(canvas, "image/webp", quality);

      if (blob.size <= MAX_IMAGE_BYTES) {
        return new File([blob], replaceFileExtension(file.name, "webp"), {
          type: "image/webp",
          lastModified: Date.now(),
        });
      }
    }

    width *= 0.85;
    height *= 0.85;
  }

  throw new Error(
    `Image is still larger than ${formatBytes(
      MAX_IMAGE_BYTES
    )}. Please upload a smaller image.`
  );
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Invalid image file."));
    };

    image.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not compress image."));
          return;
        }

        resolve(blob);
      },
      type,
      quality
    );
  });
}

function replaceFileExtension(fileName: string, extension: string) {
  const cleanName = fileName.replace(/\.[^/.]+$/, "");
  return `${cleanName}.${extension}`;
}

const inputClass =
  "mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";