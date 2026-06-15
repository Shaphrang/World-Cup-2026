//src\components\admin\Modal.tsx
"use client";

import { X } from "lucide-react";

export function Modal({
  title,
  open,
  onClose,
  children,
  maxWidth = "max-w-5xl",
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div
        className={`max-h-[92vh] w-full ${maxWidth} overflow-hidden rounded-3xl bg-white shadow-2xl`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4">
          <h2 className="text-lg font-black text-slate-950">{title}</h2>

          <button
            onClick={onClose}
            type="button"
            className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(92vh-70px)] overflow-auto p-6">
          {children}
        </div>
      </div>
    </div>
  );
}