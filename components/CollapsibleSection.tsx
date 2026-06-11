"use client";

import { Card } from "@/components/ui/card";
import { ReactNode, useState } from "react";

export default function CollapsibleSection({
  title,
  description,
  summary,
  defaultOpen = false,
  className = "",
  badge,
  actions,
  children,
}: {
  title: string;
  description?: string;
  summary?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card className={`mb-6 overflow-hidden ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full p-4 flex items-start justify-between gap-3 text-left hover:bg-secondary/20 transition-colors"
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{title}</p>
            {badge}
          </div>
          {description ? (
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {description}
            </p>
          ) : null}
          {!open && summary ? (
            <div className="text-xs text-muted-foreground mt-2">{summary}</div>
          ) : null}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {actions ? (
            <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              {actions}
            </div>
          ) : null}
          <span className="text-muted-foreground text-sm mt-0.5" aria-hidden>
            {open ? "▼" : "▶"}
          </span>
        </div>
      </button>
      {open ? <div className="px-4 pb-4 pt-0 border-t border-border/50">{children}</div> : null}
    </Card>
  );
}
