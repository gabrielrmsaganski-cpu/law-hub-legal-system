"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, BellRing, Clock3, FileSpreadsheet, ShieldCheck, Sparkles } from "lucide-react";

import { SectionCard } from "@/components/dashboard/section-card";
import { apiFetch } from "@/lib/api";

type SettingsData = {
  brand_name?: string;
  timezone?: string;
  scheduler_hour?: number;
  scheduler_minute?: number;
  notification_matrix?: Record<string, string[]>;
  workbook_status?: string;
  frontend_status?: string;
};

export default function ConfiguracoesPage() {
  const [data, setData] = useState<SettingsData | null>(null);

  useEffect(() => {
    apiFetch<SettingsData>("/settings").then(setData).catch(() => setData(null));
  }, []);

  const schedulerWindow = useMemo(() => {
    if (!data) return "-";
    return `${String(data.scheduler_hour ?? 0).padStart(2, "0")}:${String(data.scheduler_minute ?? 0).padStart(2, "0")}`;
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <section className="law-panel rounded-[36px] p-6 text-white xl:p-7">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-law-gold/30 bg-law-gold/12 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-law-sand">
              Governanca
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/62">
              Configuracoes LAW
            </span>
          </div>
          <h1 className="mt-5 max-w-4xl font-serif text-[clamp(2.25rem,4vw,3.8rem)] leading-[0.92]">
            Parametros institucionais da operacao.
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-white/68">
            Branding, cadencia operacional, matriz de notificacao e postura do ambiente agora aparecem
            como camada de governanca, nao como pagina administrativa comum.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <TopSignal
              label="Marca ativa"
              value={data?.brand_name ?? "-"}
              hint="identidade institucional"
              icon={Sparkles}
            />
            <TopSignal
              label="Scheduler"
              value={schedulerWindow}
              hint="janela operacional"
              icon={Clock3}
            />
            <TopSignal
              label="Planilha LAW"
              value={data?.workbook_status ?? "Aguardando"}
              hint="estado da base"
              icon={FileSpreadsheet}
            />
          </div>
        </section>

        <section className="law-surface-card rounded-[36px] p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                Control brief
              </div>
              <div className="mt-2 font-serif text-[clamp(1.8rem,3vw,2.45rem)] leading-none text-ink">
                Configuracao com presenca institucional.
              </div>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-slate-200 bg-white">
              <ArrowUpRight className="h-5 w-5 text-law-navy" />
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <SurfaceSignal
              label="Timezone"
              value={data?.timezone ?? "-"}
              hint="referencia operacional"
              icon={Clock3}
            />
            <SurfaceSignal
              label="Frontend"
              value={data?.frontend_status ?? "Indisponivel"}
              hint="estado da camada web"
              icon={ShieldCheck}
            />
            <SurfaceSignal
              label="Notificacao"
              value={`${Object.keys(data?.notification_matrix ?? {}).length} niveis`}
              hint="escalonamento configurado"
              icon={BellRing}
            />
            <SurfaceSignal
              label="Frame"
              value="Uso interno LAW"
              hint="governanca"
              icon={Sparkles}
            />
          </div>
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ConfigCard label="Marca ativa" value={data?.brand_name ?? "-"} />
        <ConfigCard label="Timezone operacional" value={data?.timezone ?? "-"} />
        <ConfigCard label="Janela do scheduler" value={schedulerWindow} />
        <ConfigCard label="Frontend status" value={data?.frontend_status ?? "Aguardando"} />
      </div>

      <SectionCard
        title="Matriz de notificacao"
        description="Escalonamento por severidade para risco, juridico e operacoes."
        eyebrow="Notifications"
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Object.entries(data?.notification_matrix ?? {}).map(([severity, recipients]) => (
            <div
              key={severity}
              className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(245,241,234,0.92),_rgba(255,255,255,0.95))] px-5 py-5"
            >
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">{severity}</div>
              <div className="mt-4 space-y-3">
                {recipients.map((recipient) => (
                  <div
                    key={recipient}
                    className="break-words rounded-[20px] border border-slate-100 bg-white px-4 py-3 text-sm text-slate-600"
                  >
                    {recipient}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <SectionCard
          title="Postura operacional"
          description="Leitura rapida do ambiente para governanca, rotina e aderencia institucional."
          eyebrow="Environment"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <SurfaceMetric label="Marca" value={data?.brand_name ?? "-"} />
            <SurfaceMetric label="Timezone" value={data?.timezone ?? "-"} />
            <SurfaceMetric label="Scheduler" value={schedulerWindow} />
            <SurfaceMetric label="Workbook" value={data?.workbook_status ?? "Aguardando"} />
          </div>
        </SectionCard>

        <SectionCard
          title="Snapshot tecnico"
          description="Visao direta do estado do ambiente em formato legivel para auditoria."
          eyebrow="Snapshot"
        >
          <div className="overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,_rgba(20,38,58,0.98),_rgba(27,46,67,0.98))]">
            <div className="flex items-center justify-between gap-3 border-b border-white/8 px-5 py-4 text-white">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/46">
                Runtime state
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-law-sand">
                JSON view
              </div>
            </div>
            <div className="px-5 py-5 text-sm text-white/86">
              <pre className="overflow-x-auto whitespace-pre-wrap break-words">
                {JSON.stringify(data, null, 2)}
              </pre>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function TopSignal({
  label,
  value,
  hint,
  icon: Icon
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Sparkles;
}) {
  return (
    <div className="rounded-[26px] border border-white/8 bg-white/[0.05] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/42">
            {label}
          </div>
          <div className="mt-3 break-words text-[clamp(1.35rem,2vw,1.95rem)] font-semibold leading-none text-white">
            {value}
          </div>
          <div className="mt-2 text-xs uppercase tracking-[0.18em] text-white/42">{hint}</div>
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-white/10 bg-white/[0.06]">
          <Icon className="h-5 w-5 text-law-gold" />
        </div>
      </div>
    </div>
  );
}

function SurfaceSignal({
  label,
  value,
  hint,
  icon: Icon
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Clock3;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white/92 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
            {label}
          </div>
          <div className="mt-2 break-words text-sm font-semibold text-ink">{value}</div>
          <div className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">{hint}</div>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-law-navy">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function ConfigCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="law-surface-card min-w-0 rounded-[30px] p-5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
        {label}
      </div>
      <div className="mt-3 break-words text-[clamp(1.2rem,1.8vw,1.7rem)] font-semibold leading-tight text-ink">
        {value}
      </div>
    </div>
  );
}

function SurfaceMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className="mt-2 break-words text-sm font-semibold text-ink">{value}</div>
    </div>
  );
}
