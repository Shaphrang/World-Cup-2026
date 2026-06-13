//src\lib\supabaseHelpers.ts
import type { PostgrestError } from "@supabase/supabase-js";

export function friendlyError(error: PostgrestError | Error | null | unknown, fallback = "Something went wrong") {
  if (!error) return fallback;
  if (typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}

export function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function toInputDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}
