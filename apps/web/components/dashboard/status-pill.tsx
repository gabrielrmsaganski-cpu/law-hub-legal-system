import { cn } from "@/lib/utils";

const variants: Record<string, string> = {
  critico: "border-red-200/80 bg-red-50 text-red-700",
  alto: "border-amber-200/80 bg-amber-50 text-amber-700",
  alta: "border-red-200/80 bg-red-50 text-red-700",
  medio: "border-sky-200/80 bg-sky-50 text-sky-700",
  media: "border-sky-200/80 bg-sky-50 text-sky-700",
  baixo: "border-slate-200/90 bg-slate-100 text-slate-700",
  baixa: "border-slate-200/90 bg-slate-100 text-slate-700",
  online: "border-emerald-200/80 bg-emerald-50 text-emerald-700",
  pending: "border-slate-200/90 bg-slate-100 text-slate-700",
  pendente: "border-slate-200/90 bg-slate-100 text-slate-700",
  success: "border-emerald-200/80 bg-emerald-50 text-emerald-700",
  failed: "border-red-200/80 bg-red-50 text-red-700",
  novo: "border-amber-200/80 bg-amber-50 text-amber-700",
  em_analise: "border-sky-200/80 bg-sky-50 text-sky-700",
  confirmado: "border-emerald-200/80 bg-emerald-50 text-emerald-700",
  descartado: "border-slate-200/90 bg-slate-100 text-slate-700",
  em_andamento: "border-sky-200/80 bg-sky-50 text-sky-700",
  aguardando_retorno: "border-amber-200/80 bg-amber-50 text-amber-700",
  concluido: "border-emerald-200/80 bg-emerald-50 text-emerald-700",
  execucao: "border-red-200/80 bg-red-50 text-red-700",
  citacao: "border-amber-200/80 bg-amber-50 text-amber-700",
  notificacao: "border-sky-200/80 bg-sky-50 text-sky-700",
  julgamento: "border-indigo-200/80 bg-indigo-50 text-indigo-700",
  insolvencia: "border-red-200/80 bg-red-50 text-red-700",
  encerrado: "border-emerald-200/80 bg-emerald-50 text-emerald-700",
  pre_ajuizamento: "border-slate-200/90 bg-slate-100 text-slate-700",
  suspenso: "border-stone-200/90 bg-stone-100 text-stone-700"
};

export function StatusPill({ value }: { value: string }) {
  const normalized = value.toLowerCase().replace(/\s+/g, "_");
  const label = value.replace(/_/g, " ");

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em]",
        variants[normalized] ?? "border-slate-200/90 bg-slate-100 text-slate-700"
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {label}
    </span>
  );
}
