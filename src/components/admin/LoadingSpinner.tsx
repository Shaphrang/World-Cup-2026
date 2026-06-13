export function LoadingSpinner({ label = "Loading" }: { label?: string }) {
  return <div className="flex items-center justify-center gap-3 p-8 text-slate-600"><span className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-700 border-t-transparent" /><span className="text-sm font-medium">{label}...</span></div>;
}
