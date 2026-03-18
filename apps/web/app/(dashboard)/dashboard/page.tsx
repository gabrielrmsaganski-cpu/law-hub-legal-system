"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  Activity,
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  CircleDollarSign,
  Clock3,
  ShieldCheck,
  Sparkles,
  TriangleAlert
} from "lucide-react";

import { MetricCard } from "@/components/dashboard/metric-card";
import { SectionCard } from "@/components/dashboard/section-card";
import { StatusPill } from "@/components/dashboard/status-pill";
import { apiFetch } from "@/lib/api";
import { currency, formatDate } from "@/lib/utils";

type DashboardData = {
  metrics: { label: string; value: string; delta?: string }[];
  event_distribution: { name: string; value: number }[];
  severity_distribution: { name: string; value: number }[];
  recent_timeline: { id: string; title: string; company: string; date?: string | null }[];
  integrations: { name: string; status: string }[];
  scheduler_status: { last_run?: string | null; status: string; summary?: Record<string, unknown> | null };
  operational_queue: { label: string; value: number; hint: string }[];
  portfolio_breakdown: {
    portfolio: string;
    cases: number;
    amount: number;
    high_priority: number;
  }[];
  priority_distribution: { name: string; value: number }[];
  aging_buckets: { name: string; value: number }[];
  exposure_leaders: { name: string; value: number }[];
  recent_case_updates: {
    id: string;
    portfolio: string;
    cedente: string;
    sacado?: string | null;
    status: string;
    priority: string;
    next_action?: string | null;
  }[];
};

type TooltipPayload = {
  value?: number;
  color?: string;
  name?: string;
  payload?: {
    name?: string;
  };
};

const pieColors = ["#14263a", "#d3ae21", "#7393b3", "#b88034", "#8b5cf6"];

function ChartTooltip({
  active,
  payload,
  label
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const firstPoint = payload[0];
  const title = label ?? firstPoint.payload?.name ?? firstPoint.name ?? "Indicador";

  return (
    <div className="rounded-[20px] border border-slate-200 bg-white/95 px-4 py-3 shadow-[0_18px_50px_rgba(15,23,42,0.12)] backdrop-blur">
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
        {title}
      </div>
      <div className="mt-2 space-y-2">
        {payload.map((entry, index) => (
          <div key={`${title}-${index}`} className="flex items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-2 text-slate-500">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: entry.color ?? "#14263a" }}
              />
              <span>{entry.name ?? "Volume"}</span>
            </div>
            <span className="font-semibold text-ink">{entry.value ?? 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeroStat({
  label,
  value,
  hint,
  icon: Icon
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof CircleDollarSign;
}) {
  return (
    <div className="law-surface-card min-w-0 rounded-[28px] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
            {label}
          </div>
          <div className="mt-3 break-words text-[clamp(1.45rem,2vw,2.1rem)] font-semibold leading-[1] text-ink">
            {value}
          </div>
          <div className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-400">{hint}</div>
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-slate-200 bg-white text-law-navy">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<DashboardData>("/dashboard")
      .then(setData)
      .catch((requestError) => {
        setError(requestError instanceof Error ? requestError.message : "Falha ao carregar o dashboard.");
      });
  }, []);

  if (error) {
    return (
      <div className="rounded-[28px] border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="h-[280px] animate-pulse rounded-[34px] bg-white/70 shadow-soft" />
          <div className="h-[280px] animate-pulse rounded-[34px] bg-white/70 shadow-soft" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4 xl:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-40 animate-pulse rounded-[30px] bg-white/80 shadow-soft" />
          ))}
        </div>
      </div>
    );
  }

  const totalExposure = data.portfolio_breakdown.reduce((sum, item) => sum + item.amount, 0);
  const totalCases = data.portfolio_breakdown.reduce((sum, item) => sum + item.cases, 0);
  const highPriority = data.portfolio_breakdown.reduce((sum, item) => sum + item.high_priority, 0);
  const onlineIntegrations = data.integrations.filter((item) => item.status.toLowerCase() === "online").length;
  const agingMax = Math.max(...data.aging_buckets.map((bucket) => bucket.value), 1);
  const queueMax = Math.max(...data.operational_queue.map((item) => item.value), 1);
  const latestTimeline = data.recent_timeline[0];
  const priorityTotal = Math.max(
    data.priority_distribution.reduce((sum, item) => sum + item.value, 0),
    1
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.18fr_0.82fr]">
        <section className="law-surface-card relative overflow-hidden rounded-[36px] p-5 sm:p-6 xl:p-7">
          <div className="absolute right-[-4rem] top-[-5rem] h-48 w-48 rounded-full bg-law-gold/12 blur-3xl" />
          <div className="absolute left-[-3rem] bottom-[-5rem] h-44 w-44 rounded-full bg-sky-100/70 blur-3xl" />

          <div className="relative">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-slate-200 bg-white/85 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                Resumo geral
              </span>
              <span className="rounded-full border border-law-gold/20 bg-law-gold/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-ink">
                LAW
              </span>
            </div>

            <h2 className="mt-5 max-w-4xl font-serif text-[clamp(2.3rem,4.5vw,4.4rem)] leading-[0.92] text-ink">
              Carteira juridica, risco e rotina em uma unica visao.
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600">
              Exposicao, fila, severidade e atualizacoes recentes aparecem em hierarquia clara para leitura rapida da operacao interna.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <HeroStat
                label="Exposicao consolidada"
                value={currency(totalExposure)}
                hint="volume financeiro monitorado"
                icon={CircleDollarSign}
              />
              <HeroStat
                label="Carteira ativa"
                value={`${totalCases} casos`}
                hint="operacao consolidada"
                icon={BriefcaseBusiness}
              />
              <HeroStat
                label="Alta prioridade"
                value={`${highPriority} frentes`}
                hint="atencao imediata"
                icon={TriangleAlert}
              />
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {data.metrics.slice(0, 3).map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-[24px] border border-slate-200 bg-white/85 px-4 py-4"
                >
                  <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                    {metric.label}
                  </div>
                  <div className="mt-3 text-2xl font-semibold leading-none text-ink">{metric.value}</div>
                  <div className="mt-3 text-sm leading-6 text-slate-500">
                    {metric.delta ?? "Sem variacao relevante no recorte atual."}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="law-surface-card overflow-hidden rounded-[36px] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                Ambiente
              </div>
              <div className="mt-2 font-serif text-[clamp(1.8rem,3vw,2.5rem)] leading-none text-ink">
                Sinais centrais da rotina.
              </div>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] border border-slate-200 bg-white">
              <ArrowUpRight className="h-5 w-5 text-law-navy" />
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <div className="rounded-[24px] border border-slate-200 bg-[rgba(245,241,234,0.55)] p-4">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Scheduler status
              </div>
              <div className="mt-3 text-lg font-semibold text-ink">
                {formatDate(data.scheduler_status.last_run)}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <StatusPill value={data.scheduler_status.status} />
                <span className="text-sm text-slate-500">Job diario das 22:00 America/Sao_Paulo</span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                  <Activity className="h-4 w-4 text-law-gold" />
                  Integracoes online
                </div>
                <div className="mt-3 text-[2rem] font-semibold leading-none text-ink">
                  {onlineIntegrations}/{data.integrations.length}
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-500">
                  Saude do pipeline institucional e aderencia operacional.
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                  <Clock3 className="h-4 w-4 text-sky-500" />
                  Ultimo evento
                </div>
                <div className="mt-3 text-lg font-semibold text-ink">
                  {latestTimeline?.title ?? "Sem evento recente"}
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-500">
                  {latestTimeline?.company ?? "Nenhuma empresa identificada"}{" "}
                  {latestTimeline?.date ? `| ${formatDate(latestTimeline.date)}` : ""}
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(245,241,234,0.95),_rgba(255,255,255,0.95))] p-4">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                <Sparkles className="h-4 w-4 text-law-gold" />
                Prioridades
              </div>
              <div className="mt-4 space-y-3">
                {data.priority_distribution.map((item) => (
                  <div key={item.name}>
                    <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                      <span className="text-slate-600">{item.name}</span>
                      <span className="font-semibold text-ink">{item.value}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full bg-law-gold"
                        style={{ width: `${Math.max(10, (item.value / priorityTotal) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4 xl:grid-cols-2">
        {data.metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </div>

      <SectionCard
        title="Pulse operacional"
        description="Fila priorizada, necessidade de revisao manual e termometro institucional do acompanhamento."
        eyebrow="Operations"
      >
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="grid gap-4 md:grid-cols-3">
            {data.operational_queue.map((item) => (
              <div
                key={item.label}
                className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.95),_rgba(245,241,234,0.88))] px-5 py-5"
              >
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                  {item.label}
                </div>
                <div className="mt-3 break-words text-[clamp(1.8rem,2.7vw,2.5rem)] font-semibold leading-none text-ink">
                  {item.value}
                </div>
                <div className="mt-3 h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-law-navy"
                    style={{ width: `${Math.max(12, (item.value / queueMax) * 100)}%` }}
                  />
                </div>
                <div className="mt-3 line-clamp-3 text-sm leading-6 text-slate-500">{item.hint}</div>
              </div>
            ))}
          </div>

          <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.96),_rgba(245,241,234,0.94))] p-5 text-ink">
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
              Leitura da operacao
            </div>
            <div className="mt-3 font-serif text-[1.9rem] leading-none">
              Panorama rapido da rotina.
            </div>
            <p className="mt-4 text-sm leading-7 text-slate-600">
              Carteiras, fila e risco aparecem lado a lado para facilitar a leitura do dia sem excesso visual.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                  <Building2 className="h-4 w-4 text-law-gold" />
                  Carteiras
                </div>
                <div className="mt-3 text-lg font-semibold text-ink">
                  {data.portfolio_breakdown.length} frentes monitoradas
                </div>
              </div>
              <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                  <ShieldCheck className="h-4 w-4 text-emerald-300" />
                  Postura
                </div>
                <div className="mt-3 text-lg font-semibold text-ink">
                  Risco, fila e trilha em sincronia
                </div>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <SectionCard
          title="Distribuicao operacional"
          description="Status processual consolidado da carteira com leitura mais rapida para decisao."
          eyebrow="Flow"
        >
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.event_distribution} barGap={10}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "rgba(20,38,58,0.04)" }} content={<ChartTooltip />} />
                <Bar dataKey="value" radius={[14, 14, 4, 4]}>
                  {data.event_distribution.map((entry, index) => (
                    <Cell
                      key={entry.name}
                      fill={index % 2 === 0 ? "#14263a" : "#d3ae21"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard
          title="Risco por severidade"
          description="Concentracao dos alertas juridicos com acabamento visual mais estrategico."
          eyebrow="Risk"
        >
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.severity_distribution}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={80}
                  outerRadius={118}
                  paddingAngle={4}
                >
                  {data.severity_distribution.map((entry, index) => (
                    <Cell key={entry.name} fill={pieColors[index % pieColors.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <SectionCard
          title="Carteiras LAW"
          description="Comparativo entre frentes, volume financeiro e intensidade operacional."
          eyebrow="Portfolio"
        >
          <div className="space-y-4">
            {data.portfolio_breakdown.map((item) => (
              <div
                key={item.portfolio}
                className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,_rgba(245,241,234,0.94),_rgba(255,255,255,0.96))] px-5 py-5"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                      {item.portfolio.replace("_", " ")}
                    </div>
                    <div className="mt-2 break-words text-[clamp(1.4rem,2vw,1.9rem)] font-semibold text-ink">
                      {item.cases} casos ativos
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <StatusPill value="Em andamento" />
                      <span className="rounded-full border border-slate-200 bg-white/85 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        {item.high_priority} alta prioridade
                      </span>
                    </div>
                  </div>
                  <div className="min-w-0 text-sm leading-7 text-slate-600 md:text-right">
                    <div>Exposicao: <span className="font-semibold text-ink">{currency(item.amount)}</span></div>
                    <div>Foco executivo: carteira com monitoramento ativo</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Aging e concentracao"
          description="Envelhecimento da fila e maiores exposicoes em layout mais analitico."
          eyebrow="Aging"
        >
          <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(245,241,234,0.92),_rgba(255,255,255,0.94))] p-5">
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                Aging operacional
              </div>
              <div className="mt-5 space-y-4">
                {data.aging_buckets.map((bucket) => (
                  <div key={bucket.name}>
                    <div className="mb-2 flex items-center justify-between gap-4 text-sm text-slate-600">
                      <span className="min-w-0 break-words pr-4">{bucket.name}</span>
                      <span className="font-semibold text-ink">{bucket.value}</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-100">
                      <div
                        className="h-2.5 rounded-full bg-law-gold"
                        style={{ width: `${Math.max(10, (bucket.value / agingMax) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-5">
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                Cedentes com maior exposicao
              </div>
              <div className="mt-5 space-y-3">
                {data.exposure_leaders.map((item, index) => (
                  <div
                    key={item.name}
                    className="flex min-w-0 items-center justify-between gap-4 rounded-[22px] border border-slate-100 bg-[rgba(245,241,234,0.36)] px-4 py-4"
                  >
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400">
                        Leader #{index + 1}
                      </div>
                      <div className="mt-2 break-words text-sm font-medium leading-6 text-ink">
                        {item.name}
                      </div>
                    </div>
                    <div className="shrink-0 text-sm font-semibold text-ink">{currency(item.value)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.86fr_1.14fr]">
        <SectionCard
          title="Integracoes e scheduler"
          description="Saude do pipeline diario e aderencia operacional."
          eyebrow="Systems"
        >
          <div className="space-y-4">
            {data.integrations.map((integration) => (
              <div
                key={integration.name}
                className="flex min-w-0 items-center justify-between gap-3 rounded-[24px] border border-slate-100 bg-[rgba(245,241,234,0.4)] px-4 py-4"
              >
                <div className="min-w-0 break-words font-medium text-ink">{integration.name}</div>
                <StatusPill value={integration.status} />
              </div>
            ))}
            <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(245,241,234,0.95),_rgba(255,255,255,0.9))] px-4 py-4">
              <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400">Ultima execucao</div>
              <div className="mt-2 text-lg font-semibold text-ink">
                {formatDate(data.scheduler_status.last_run)}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-slate-500">Saude do job institucional</span>
                <StatusPill value={data.scheduler_status.status} />
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Atualizacoes recentes"
          description="Ultimos eventos juridicos e tratativas operacionais em leitura editorial."
          eyebrow="Timeline"
        >
          <div className="space-y-3">
            {data.recent_case_updates.map((item) => (
              <Link
                key={item.id}
                href={`/acompanhamento?case=${item.id}`}
                className="block rounded-[26px] border border-slate-100 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(245,241,234,0.88))] px-4 py-4 transition hover:border-law-gold/30 hover:shadow-[0_16px_40px_rgba(15,23,42,0.08)]"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill value={item.priority} />
                      <StatusPill value={item.status} />
                    </div>
                    <div className="break-words text-lg font-semibold text-ink">{item.cedente}</div>
                    <div className="break-words text-sm text-slate-500">
                      {item.sacado ? `Contra ${item.sacado}` : "Sem contraparte especificada"}
                    </div>
                    <div className="break-words text-sm leading-6 text-slate-600">
                      {item.next_action ?? "Sem proxima acao definida"}
                    </div>
                  </div>
                  <div className="rounded-full border border-slate-200 bg-white/85 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                    {item.portfolio.replace("_", " ")}
                  </div>
                </div>
              </Link>
            ))}

            <div className="grid gap-3 pt-2 md:grid-cols-2">
              {data.recent_timeline.map((item) => (
                <div
                  key={item.id}
                  className="rounded-[24px] border border-slate-100 bg-[rgba(245,241,234,0.45)] px-4 py-4"
                >
                  <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400">{item.title}</div>
                  <div className="mt-2 break-words font-medium text-ink">
                    {item.company ?? "Empresa nao identificada"}
                  </div>
                  <div className="mt-2 text-sm text-slate-500">{formatDate(item.date)}</div>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
