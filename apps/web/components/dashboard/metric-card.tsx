export function MetricCard({
  label,
  value,
  delta
}: {
  label: string;
  value: string;
  delta?: string | null;
}) {
  return (
    <div className="law-surface-card law-elevate law-reveal law-sheen group relative min-w-0 overflow-hidden rounded-[30px] p-5">
      <div className="absolute right-[-1rem] top-[-1rem] h-20 w-20 rounded-full bg-law-gold/12 blur-3xl" />
      <div className="absolute left-[-2rem] bottom-[-2rem] h-20 w-20 rounded-full bg-sky-100/70 blur-3xl" />
      <div className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-law-gold/70 to-transparent" />

      <div className="relative flex min-h-[152px] min-w-0 flex-col justify-between">
        <div className="flex items-start justify-between gap-4">
          <div className="max-w-[16rem] text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            {label}
          </div>
          <div className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            KPI
          </div>
        </div>
        <div className="mt-5 max-w-full break-words text-[clamp(1.8rem,2.4vw,2.7rem)] font-semibold leading-[0.95] text-ink">
          {value}
        </div>

        <div className="mt-4 flex items-end justify-between gap-3">
          <div className="max-w-[18rem] text-[12px] leading-6 text-slate-500">
            {delta ?? "Sem variacao relevante no recorte atual."}
          </div>
          <div className="shrink-0 rounded-full border border-law-gold/20 bg-law-gold/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink">
            LAW
          </div>
        </div>
      </div>
    </div>
  );
}
