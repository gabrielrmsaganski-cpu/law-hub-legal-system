import { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function SectionCard({
  title,
  description,
  children,
  eyebrow = "Insight",
  className,
  contentClassName
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  eyebrow?: string;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section
      className={cn(
        "law-surface-card law-elevate law-reveal law-sheen relative min-w-0 overflow-hidden rounded-[34px] p-5 sm:p-6",
        className
      )}
    >
      <div className="absolute right-[-2rem] top-[-4rem] h-32 w-32 rounded-full bg-law-gold/10 blur-3xl" />
      <div className="absolute left-[-2rem] bottom-[-4rem] h-32 w-32 rounded-full bg-sky-100/60 blur-3xl" />
      <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-law-gold/70 to-transparent" />

      <div className="relative mb-6 flex items-end justify-between gap-4 border-b border-slate-200/70 pb-5">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
            {eyebrow}
          </div>
          <h2 className="mt-2 max-w-[34rem] break-words font-serif text-[clamp(1.45rem,1.9vw,2rem)] leading-tight text-ink">
            {title}
          </h2>
          {description ? (
            <p className="mt-2 max-w-3xl break-words text-sm leading-7 text-slate-500">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      <div className={cn("relative", contentClassName)}>{children ? children : null}</div>
    </section>
  );
}
