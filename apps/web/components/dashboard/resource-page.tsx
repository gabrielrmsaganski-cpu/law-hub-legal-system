"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, DatabaseZap, Radar, SearchX, ShieldCheck } from "lucide-react";

import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { DataTable } from "./data-table";
import { SectionCard } from "./section-card";

type Column = {
  key: string;
  label: string;
  kind?: "date" | "status" | "severity" | "currency";
};

function latestDate(rows: Record<string, unknown>[], columns: Column[]) {
  const dateKeys = columns.filter((column) => column.kind === "date").map((column) => column.key);
  const timestamps = rows
    .flatMap((row) => dateKeys.map((key) => row[key]))
    .filter((value): value is string => typeof value === "string")
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));

  if (!timestamps.length) {
    return "-";
  }

  return formatDate(new Date(Math.max(...timestamps)).toISOString());
}

function leadingLabel(rows: Record<string, unknown>[], columns: Column[]) {
  const targetColumn = columns.find(
    (column) => column.kind === "status" || column.kind === "severity"
  );

  if (!targetColumn) {
    return "Leitura institucional";
  }

  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const value = String(row[targetColumn.key] ?? "-");
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });

  const winner = Array.from(counts.entries()).sort((left, right) => right[1] - left[1])[0];
  return winner ? `${winner[0].replace(/_/g, " ")} em destaque` : "Leitura institucional";
}

export function ResourcePage({
  title,
  description,
  endpoint,
  columns
}: {
  title: string;
  description: string;
  endpoint: string;
  columns: Column[];
}) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;
    apiFetch<Record<string, unknown>[]>(endpoint)
      .then((response) => {
        if (active) setRows(response);
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : "Falha ao carregar");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [endpoint]);

  const filteredRows = useMemo(() => {
    if (!search) return rows;
    return rows.filter((row) =>
      Object.values(row)
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  }, [rows, search]);

  const latestRefresh = useMemo(() => latestDate(rows, columns), [columns, rows]);
  const statusLead = useMemo(() => leadingLabel(filteredRows, columns), [columns, filteredRows]);

  return (
    <div className="space-y-6">
      <section className="law-surface-card law-reveal law-sheen relative overflow-hidden rounded-[34px] p-5 sm:p-6">
        <div className="absolute right-[-4rem] top-[-5rem] h-40 w-40 rounded-full bg-law-gold/10 blur-3xl" />
        <div className="absolute left-[-3rem] bottom-[-4rem] h-40 w-40 rounded-full bg-sky-100/70 blur-3xl" />

        <div className="relative flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,1.06fr)_minmax(320px,0.94fr)] xl:items-end">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-full border border-slate-200 bg-white/75 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
                Dataset LAW
              </div>
              <div className="rounded-full border border-law-gold/20 bg-law-gold/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-ink">
                Uso interno
              </div>
            </div>

            <h1 className="mt-5 max-w-4xl break-words font-serif text-[clamp(2.15rem,4vw,3.35rem)] leading-[0.95] text-ink">
              {title}
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600">{description}</p>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <div className="law-elevate rounded-[24px] border border-slate-200 bg-white/90 px-4 py-4">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  <DatabaseZap className="h-4 w-4 text-law-navy" />
                  Registros
                </div>
                <div className="mt-2 text-lg font-semibold text-ink">
                  {loading ? "Carregando" : filteredRows.length}
                </div>
                <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                  visao filtrada
                </div>
              </div>

              <div className="law-elevate rounded-[24px] border border-slate-200 bg-white/90 px-4 py-4">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  <Radar className="h-4 w-4 text-law-gold" />
                  Sinal dominante
                </div>
                <div className="mt-2 text-lg font-semibold text-ink">{loading ? "-" : statusLead}</div>
                <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                  leitura atual
                </div>
              </div>

              <div className="law-elevate rounded-[24px] border border-slate-200 bg-white/90 px-4 py-4">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  Ultima referencia
                </div>
                <div className="mt-2 text-lg font-semibold text-ink">{loading ? "-" : latestRefresh}</div>
                <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                  dado mais recente
                </div>
              </div>
            </div>
          </div>

          <div className="law-panel law-sheen rounded-[30px] p-5 text-white">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/44">
                  Resumo do dataset
                </div>
                <div className="mt-2 font-serif text-[clamp(1.7rem,2.6vw,2.2rem)] leading-none">
                  Leitura pronta para a rotina.
                </div>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-white/10 bg-white/[0.06]">
                <ArrowUpRight className="h-5 w-5 text-law-gold" />
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <div className="rounded-[22px] border border-white/8 bg-white/[0.05] p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/42">
                  Fonte
                </div>
                <div className="mt-2 text-sm font-semibold text-white">Stack LAW</div>
                <div className="mt-1 text-xs uppercase tracking-[0.18em] text-white/42">
                  monitoramento institucional
                </div>
              </div>
              <div className="rounded-[22px] border border-white/8 bg-white/[0.05] p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/42">
                  Colunas
                </div>
                <div className="mt-2 text-sm font-semibold text-white">{columns.length} sinais visiveis</div>
                <div className="mt-1 text-xs uppercase tracking-[0.18em] text-white/42">
                  estrutura da tela
                </div>
              </div>
              <div className="rounded-[22px] border border-white/8 bg-white/[0.05] p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/42">
                  Frame
                </div>
                <div className="mt-2 text-sm font-semibold text-white">Visao organizada</div>
                <div className="mt-1 text-xs uppercase tracking-[0.18em] text-white/42">
                  filtro e auditoria
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="relative mt-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-[minmax(0,1fr)_auto_auto]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Pesquisar por empresa, evento, status, documento ou referencia"
            className="w-full rounded-[22px] border border-slate-200 bg-white/85 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-law-gold"
          />
          <div className="rounded-full border border-law-gold/20 bg-law-gold/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-ink">
            {loading ? "Carregando" : `${filteredRows.length} registros`}
          </div>
          <div className="rounded-full border border-slate-200 bg-white/85 px-4 py-3 text-xs uppercase tracking-[0.2em] text-slate-500">
            Visao institucional
          </div>
        </div>
      </section>

      <SectionCard
        title={title}
        description="Estrutura organizada para leitura operacional, auditoria e decisao executiva."
        eyebrow="Dataset"
      >
        {loading ? (
          <div className="grid gap-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="law-shimmer h-14 rounded-[22px] bg-[linear-gradient(90deg,_rgba(241,245,249,1),_rgba(248,250,252,0.9),_rgba(241,245,249,1))]"
              />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-[24px] border border-red-200 bg-red-50 px-6 py-6 text-sm text-red-700">
            {error}
          </div>
        ) : !filteredRows.length ? (
          <div className="law-empty-state law-reveal rounded-[28px] px-6 py-12">
            <div className="mx-auto flex max-w-xl flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-[20px] border border-slate-200 bg-white/90 text-law-navy">
                <SearchX className="h-6 w-6" />
              </div>
              <div className="mt-4 font-serif text-[1.7rem] leading-none text-ink">
                Nenhum resultado para o filtro atual.
              </div>
              <div className="mt-3 text-sm leading-7 text-slate-500">
                Ajuste a busca para retomar a leitura do dataset com o recorte institucional correto.
              </div>
              <button
                type="button"
                onClick={() => setSearch("")}
                className="mt-5 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 transition hover:border-law-gold hover:text-ink"
              >
                Limpar busca
              </button>
            </div>
          </div>
        ) : (
          <DataTable rows={filteredRows} columns={columns} />
        )}
      </SectionCard>
    </div>
  );
}
