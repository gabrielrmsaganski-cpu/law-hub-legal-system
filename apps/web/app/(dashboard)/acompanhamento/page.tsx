"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  Activity,
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarClock,
  FileSpreadsheet,
  SearchX,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
  type LucideIcon
} from "lucide-react";

import { SectionCard } from "@/components/dashboard/section-card";
import { StatusPill } from "@/components/dashboard/status-pill";
import { apiFetch } from "@/lib/api";
import { cn, currency, formatDate } from "@/lib/utils";

type Summary = {
  total_cases: number;
  total_amount: number;
  high_priority_cases: number;
  pending_manual_review: number;
};

type Case = {
  id: string;
  source_book: string;
  cedente_name: string;
  sacado_name?: string | null;
  current_status: string;
  follow_up_status: string;
  priority: string;
  process_number?: string | null;
  action_amount?: number | null;
  legal_cost_amount?: number | null;
  latest_progress?: string | null;
  progress_updated_at?: string | null;
  internal_owner?: string | null;
  next_action?: string | null;
  next_action_due_date?: string | null;
  aging_days?: number | null;
  manual_review_required: boolean;
  internal_notes?: string | null;
};

type CaseEvent = {
  id: string;
  title: string;
  description?: string | null;
  source: string;
  created_by?: string | null;
  created_at: string;
};

type CaseDetail = Case & { events: CaseEvent[] };

type Analysis = {
  summary_executive: string;
  owner_recommendation: string;
  follow_up_recommendation: string;
  key_risks: string[];
  recommended_actions: string[];
  risk_score: number;
  match_confidence_score: number;
  generated_by: string;
};

type WorkbookPreview = {
  records_total: number;
  cases: {
    portfolio: string;
    row_id: string;
    cedente_name: string;
    priority: string;
    next_action?: string | null;
  }[];
  summary: {
    law_fundo?: number;
    law_sec?: number;
    high_priority?: number;
  };
};

const inputClassName =
  "w-full rounded-[22px] border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-law-gold";

export default function AcompanhamentoPage() {
  return (
    <Suspense fallback={<div className="h-48 animate-pulse rounded-[32px] bg-white/80 shadow-soft" />}>
      <AcompanhamentoPageContent />
    </Suspense>
  );
}

function AcompanhamentoPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [cases, setCases] = useState<Case[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [search, setSearch] = useState("");
  const [portfolioFilter, setPortfolioFilter] = useState("todos");
  const [priorityFilter, setPriorityFilter] = useState("todos");
  const [followUpFilter, setFollowUpFilter] = useState("todos");
  const [manualReviewOnly, setManualReviewOnly] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [activePanel, setActivePanel] = useState<"visao" | "analise" | "timeline">("visao");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<WorkbookPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadBase = useCallback(async () => {
    const [summaryResponse, casesResponse] = await Promise.all([
      apiFetch<Summary>("/operations/summary"),
      apiFetch<Case[]>("/operations/cases")
    ]);
    setSummary(summaryResponse);
    setCases(casesResponse);
  }, []);

  const loadDetail = useCallback(async (caseId: string) => {
    const [detailResponse, analysisResponse] = await Promise.all([
      apiFetch<CaseDetail>(`/operations/cases/${caseId}`),
      apiFetch<Analysis>(`/operations/cases/${caseId}/analysis`, { method: "POST" })
    ]);
    setDetail(detailResponse);
    setAnalysis(analysisResponse);
  }, []);

  useEffect(() => {
    loadBase().catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar."));
  }, [loadBase]);

  useEffect(() => {
    if (!selectedId) return;
    loadDetail(selectedId).catch((err) =>
      setError(err instanceof Error ? err.message : "Falha ao carregar o caso.")
    );
  }, [loadDetail, selectedId]);

  const portfolioOptions = useMemo(
    () => ["todos", ...new Set(cases.map((item) => item.source_book))],
    [cases]
  );
  const priorityOptions = useMemo(
    () => ["todos", ...new Set(cases.map((item) => item.priority))],
    [cases]
  );
  const followUpOptions = useMemo(
    () => ["todos", ...new Set(cases.map((item) => item.follow_up_status))],
    [cases]
  );

  const filteredCases = useMemo(
    () =>
      cases.filter((item) => {
        const matchesSearch = [
          item.cedente_name,
          item.sacado_name,
          item.current_status,
          item.process_number,
          item.latest_progress
        ]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase());
        const matchesPortfolio = portfolioFilter === "todos" || item.source_book === portfolioFilter;
        const matchesPriority = priorityFilter === "todos" || item.priority === priorityFilter;
        const matchesFollowUp = followUpFilter === "todos" || item.follow_up_status === followUpFilter;
        const matchesManualReview = !manualReviewOnly || item.manual_review_required;
        return matchesSearch && matchesPortfolio && matchesPriority && matchesFollowUp && matchesManualReview;
      }),
    [cases, followUpFilter, manualReviewOnly, portfolioFilter, priorityFilter, search]
  );

  const selectedCase = detail ?? cases.find((item) => item.id === selectedId) ?? null;
  const requestedCaseId = searchParams.get("case") ?? "";

  useEffect(() => {
    if (!requestedCaseId) return;
    if (!cases.some((item) => item.id === requestedCaseId)) return;
    if (selectedId === requestedCaseId) return;
    setSelectedId(requestedCaseId);
    setActivePanel("visao");
  }, [cases, requestedCaseId, selectedId]);

  function openCase(caseId: string) {
    setSelectedId(caseId);
    setActivePanel("visao");
    const params = new URLSearchParams(searchParams.toString());
    params.set("case", caseId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function closeCase() {
    setSelectedId("");
    setDetail(null);
    setAnalysis(null);
    setCommentDraft("");
    setActivePanel("visao");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("case");
    router.replace(params.size ? `${pathname}?${params.toString()}` : pathname, { scroll: false });
  }

  function saveCase() {
    if (!detail) return;
    startTransition(async () => {
      try {
        const updated = await apiFetch<Case>(`/operations/cases/${detail.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            current_status: detail.current_status,
            follow_up_status: detail.follow_up_status,
            priority: detail.priority,
            internal_owner: detail.internal_owner || null,
            process_number: detail.process_number || null,
            action_amount: detail.action_amount ?? null,
            legal_cost_amount: detail.legal_cost_amount ?? null,
            latest_progress: detail.latest_progress || null,
            next_action: detail.next_action || null,
            internal_notes: detail.internal_notes || null,
            manual_review_required: detail.manual_review_required
          })
        });
        setCases((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        await loadBase();
        await loadDetail(updated.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao salvar.");
      }
    });
  }

  function addComment() {
    if (!selectedId || !commentDraft.trim()) return;
    startTransition(async () => {
      try {
        await apiFetch(`/operations/cases/${selectedId}/comments`, {
          method: "POST",
          body: JSON.stringify({ message: commentDraft.trim() })
        });
        setCommentDraft("");
        await loadDetail(selectedId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao registrar comentario.");
      }
    });
  }

  function previewWorkbook() {
    if (!uploadFile) return;
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("file", uploadFile);
        const response = await apiFetch<WorkbookPreview>("/imports/workbook/preview-upload", {
          method: "POST",
          body: formData
        });
        setPreview(response);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao gerar preview da planilha.");
      }
    });
  }

  function commitWorkbook() {
    if (!uploadFile) return;
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("file", uploadFile);
        await apiFetch("/imports/workbook/commit-upload", {
          method: "POST",
          body: formData
        });
        await loadBase();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao importar a planilha.");
      }
    });
  }

  if (error) {
    return (
      <div className="rounded-[28px] border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!summary) {
    return <div className="h-48 animate-pulse rounded-[32px] bg-white/80 shadow-soft" />;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.16fr_0.84fr]">
        <section className="law-surface-card rounded-[36px] bg-[linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(245,241,234,0.94))] p-6 xl:p-7">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-law-gold/30 bg-law-gold/12 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-law-navy">
              Operacao
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Acompanhamento LAW
            </span>
          </div>
          <h1 className="mt-5 max-w-4xl font-serif text-[clamp(2.35rem,4vw,4rem)] leading-[0.92] text-ink">
            Acompanhamento juridico com ownership, risco e tratativas.
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600">
            A fila fica mais clara para a rotina da LAW, com filtros objetivos e abertura imediata
            do quadro do caso para acompanhamento, analise e timeline.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <TopSignal
              label="Carteira viva"
              value={`${summary.total_cases} casos`}
              hint="operacao consolidada"
              icon={BriefcaseBusiness}
            />
            <TopSignal
              label="Exposicao"
              value={currency(summary.total_amount)}
              hint="volume monitorado"
              icon={ShieldCheck}
            />
            <TopSignal
              label="Alta prioridade"
              value={`${summary.high_priority_cases} frentes`}
              hint="atencao imediata"
              icon={Sparkles}
            />
          </div>
        </section>

        <section className="law-surface-card rounded-[36px] p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                Resumo
              </div>
              <div className="mt-2 font-serif text-[clamp(1.85rem,3vw,2.5rem)] leading-none text-ink">
                Leitura mais clara da rotina.
              </div>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-slate-200 bg-white">
              <ArrowUpRight className="h-5 w-5 text-law-navy" />
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <SurfaceSignal
              label="Revisao manual"
              value={`${summary.pending_manual_review} casos`}
              hint="controle humano ativo"
              icon={Activity}
            />
            <SurfaceSignal
              label="Resposta"
              value={`${filteredCases.length} itens filtrados`}
              hint="lista pronta para acao"
              icon={Sparkles}
            />
            <SurfaceSignal
              label="Importacao"
              value="Planilha institucional"
              hint="preview e commit"
              icon={FileSpreadsheet}
            />
            <SurfaceSignal
              label="Cadencia"
              value="Mesa + timeline"
              hint="ownership e tratativas"
              icon={CalendarClock}
            />
          </div>
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric label="Casos monitorados" value={String(summary.total_cases)} />
        <SummaryMetric label="Exposicao consolidada" value={currency(summary.total_amount)} />
        <SummaryMetric label="Alta prioridade" value={String(summary.high_priority_cases)} />
        <SummaryMetric label="Revisao manual" value={String(summary.pending_manual_review)} />
      </div>

      <SectionCard
        title="Importacao da planilha"
        description="Suba uma nova planilha, veja o preview operacional e incorpore os dados na esteira."
        eyebrow="Workbook"
      >
        <div className="grid gap-5 xl:grid-cols-[0.88fr_1.12fr]">
          <div className="law-surface-card rounded-[30px] p-5">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              <Upload className="h-4 w-4 text-law-gold" />
              Upload da base
            </div>
            <div className="mt-4 rounded-[24px] border border-slate-200 bg-[rgba(245,241,234,0.52)] p-5">
              <div className="text-sm leading-7 text-slate-600">
                Carregue a planilha para validar registros, carteira e prioridade antes do commit
                operacional.
              </div>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                className="mt-5 block w-full rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 file:mr-4 file:rounded-full file:border-0 file:bg-law-gold file:px-4 file:py-2 file:text-sm file:font-semibold file:text-ink"
              />
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  onClick={previewWorkbook}
                  disabled={!uploadFile || isPending}
                  className="rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-law-gold/30 hover:bg-law-gold/10 hover:text-ink disabled:opacity-60"
                >
                  Gerar preview
                </button>
                <button
                  onClick={commitWorkbook}
                  disabled={!uploadFile || isPending}
                  className="rounded-[20px] bg-[linear-gradient(135deg,_#d3ae21,_#e6c95f)] px-4 py-3 text-sm font-semibold text-ink transition hover:brightness-95 disabled:opacity-60"
                >
                  {isPending ? "Processando..." : "Importar planilha"}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(245,241,234,0.92),_rgba(255,255,255,0.95))] p-5">
            {!preview ? (
              <div className="flex min-h-[280px] items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-white/70 px-6 text-center text-sm leading-7 text-slate-500">
                Nenhum preview carregado ainda. Gere uma leitura previa para validar volume, carteira e casos prioritarios.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <MiniMetric label="Registros" value={String(preview.records_total)} />
                  <MiniMetric label="LAW FUNDO" value={String(preview.summary.law_fundo ?? 0)} />
                  <MiniMetric label="Alta prioridade" value={String(preview.summary.high_priority ?? 0)} />
                </div>
                <div className="space-y-3">
                  {preview.cases.map((item) => (
                    <div key={item.row_id} className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill value={item.priority} />
                        <span className="rounded-full border border-slate-200 bg-law-cloud px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {item.portfolio.replace("_", " ")}
                        </span>
                      </div>
                      <div className="mt-3 break-words font-medium text-ink">{item.cedente_name}</div>
                      <div className="mt-2 text-sm leading-6 text-slate-500">
                        {item.next_action ?? "Sem proxima acao sugerida."}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title={`Fila operacional (${filteredCases.length})`}
        description="Cards amplos, filtros melhores e selecao imediata para abrir o quadro detalhado."
        eyebrow="Operations"
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(180px,0.7fr))_minmax(210px,0.8fr)]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Pesquisar por cedente, sacado, processo ou andamento"
            className={inputClassName}
          />
          <FilterSelect value={portfolioFilter} onChange={setPortfolioFilter} options={portfolioOptions} label="Portfolio" />
          <FilterSelect value={priorityFilter} onChange={setPriorityFilter} options={priorityOptions} label="Prioridade" />
          <FilterSelect value={followUpFilter} onChange={setFollowUpFilter} options={followUpOptions} label="Follow-up" />
          <label className="flex items-center gap-3 rounded-[22px] border border-slate-200 bg-[rgba(245,241,234,0.6)] px-4 py-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={manualReviewOnly}
              onChange={(event) => setManualReviewOnly(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Apenas revisao manual
          </label>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {!filteredCases.length ? (
            <div className="law-empty-state rounded-[30px] px-6 py-12 xl:col-span-2">
              <div className="mx-auto flex max-w-xl flex-col items-center text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-[20px] border border-slate-200 bg-white/90 text-law-navy">
                  <SearchX className="h-6 w-6" />
                </div>
                <div className="mt-4 font-serif text-[1.8rem] leading-none text-ink">
                  Nenhum caso encontrou este recorte.
                </div>
                <div className="mt-3 text-sm leading-7 text-slate-500">
                  Ajuste os filtros para retomar a leitura da fila operacional com o recorte desejado.
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setPortfolioFilter("todos");
                    setPriorityFilter("todos");
                    setFollowUpFilter("todos");
                    setManualReviewOnly(false);
                  }}
                  className="mt-5 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 transition hover:border-law-gold hover:text-ink"
                >
                  Limpar filtros
                </button>
              </div>
            </div>
          ) : null}

          {filteredCases.map((item) => (
            <button
              key={item.id}
              onClick={() => openCase(item.id)}
              className={cn(
                "law-elevate law-sheen w-full rounded-[30px] border p-5 text-left transition duration-200",
                item.id === selectedId
                  ? "border-law-gold/45 bg-[linear-gradient(180deg,_rgba(245,241,234,0.95),_rgba(255,255,255,0.98))] shadow-[0_22px_60px_rgba(211,174,33,0.14)]"
                  : "border-slate-200 bg-white hover:-translate-y-0.5 hover:shadow-[0_22px_60px_rgba(15,23,42,0.08)]"
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <StatusPill value={item.priority} />
                  <StatusPill value={item.follow_up_status} />
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {item.source_book.replace("_", " ")}
                  </span>
                </div>
                {item.manual_review_required ? (
                  <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-red-700">
                    Revisao manual
                  </span>
                ) : null}
              </div>
              <div className="mt-4 break-words font-serif text-[1.65rem] leading-tight text-ink">{item.cedente_name}</div>
              <div className="mt-2 break-words text-sm text-slate-500">
                {item.sacado_name ? `Contra ${item.sacado_name}` : "Sem contraparte registrada"}
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <MiniMetric label="Valor" value={currency(item.action_amount)} />
                <MiniMetric label="Aging" value={item.aging_days != null ? `${item.aging_days} dias` : "-"} />
                <MiniMetric label="Owner" value={item.internal_owner ?? "-"} />
              </div>
              <div className="mt-4 rounded-[22px] border border-slate-100 bg-[rgba(245,241,234,0.5)] px-4 py-4 text-sm leading-6 text-slate-600">
                {item.next_action ?? "Sem proxima acao registrada."}
              </div>
            </button>
          ))}
        </div>
      </SectionCard>

      {selectedId ? (
        <div className="fixed inset-0 z-50 bg-slate-950/55 px-3 py-4 backdrop-blur-sm lg:px-8">
          <div className="mx-auto flex h-full max-w-[1580px] flex-col overflow-hidden rounded-[36px] border border-white/10 bg-[linear-gradient(180deg,_#fbfaf7_0%,_#eef2f5_100%)] shadow-[0_36px_120px_rgba(2,6,23,0.4)]">
            <div className="border-b border-slate-200 bg-[linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(245,241,234,0.9))] px-5 py-5 sm:px-6">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">Quadro do caso</div>
                  <div className="mt-2 break-words font-serif text-[clamp(2rem,3.4vw,3rem)] leading-[0.95] text-ink">{selectedCase?.cedente_name ?? "Carregando caso"}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedCase ? (
                      <>
                        <StatusPill value={selectedCase.priority} />
                        <StatusPill value={selectedCase.follow_up_status} />
                        <StatusPill value={selectedCase.current_status} />
                      </>
                    ) : null}
                  </div>
                  <div className="mt-3 text-sm text-slate-500">{selectedCase?.sacado_name ? `Contra ${selectedCase.sacado_name}` : "Sem contraparte registrada"}</div>
                </div>
                <button
                  onClick={closeCase}
                  className="flex items-center gap-2 rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-law-gold/30 hover:text-ink"
                >
                  <X className="h-4 w-4" />
                  Fechar quadro
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <BoardMetric label="Portfolio" value={selectedCase?.source_book.replace("_", " ") ?? "-"} />
                <BoardMetric label="Valor da acao" value={currency(selectedCase?.action_amount)} />
                <BoardMetric label="Owner" value={selectedCase?.internal_owner ?? "-"} />
                <BoardMetric label="Aging" value={selectedCase?.aging_days != null ? `${selectedCase.aging_days} dias` : "-"} />
              </div>

              <div className="mt-5 flex flex-wrap gap-3 rounded-[26px] border border-slate-200 bg-white/90 p-3">
                {[
                  ["visao", "Visao do caso"],
                  ["analise", "Analise IA"],
                  ["timeline", "Timeline e tratativas"]
                ].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setActivePanel(key as "visao" | "analise" | "timeline")}
                    className={cn(
                      "rounded-[18px] px-4 py-3 text-sm font-semibold transition",
                      activePanel === key ? "bg-law-gold text-ink shadow-soft" : "bg-law-cloud text-slate-600 hover:bg-slate-100"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {activePanel === "visao" ? (
                <div className="mt-5 grid gap-6 xl:grid-cols-[1.18fr_0.82fr]">
                  <SectionCard title="Contexto operacional" description="Edicao ampla do caso, com ownership, status, observacoes e proximos passos." eyebrow="Case">
                    {!detail ? <LoadingBlock /> : (
                      <div className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                          <StatusPill value={detail.priority} />
                          <StatusPill value={detail.current_status} />
                          <StatusPill value={detail.follow_up_status} />
                        </div>
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <MiniMetric label="Processo" value={detail.process_number ?? "-"} wrap />
                          <MiniMetric label="Valor da acao" value={currency(detail.action_amount)} />
                          <MiniMetric label="Custas" value={currency(detail.legal_cost_amount)} />
                          <MiniMetric label="Ultima atualizacao" value={detail.progress_updated_at ? formatDate(detail.progress_updated_at) : "-"} wrap />
                        </div>
                        <Field label="Andamento atual">
                          <textarea
                            value={detail.latest_progress ?? ""}
                            onChange={(event) => setDetail((current) => current ? { ...current, latest_progress: event.target.value } : current)}
                            className="min-h-36 w-full rounded-[22px] border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-law-gold"
                          />
                        </Field>
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          <Field label="Status atual"><input value={detail.current_status} onChange={(event) => setDetail((current) => current ? { ...current, current_status: event.target.value } : current)} className={inputClassName} /></Field>
                          <Field label="Prioridade"><select value={detail.priority} onChange={(event) => setDetail((current) => current ? { ...current, priority: event.target.value } : current)} className={inputClassName}><option value="alta">Alta</option><option value="media">Media</option><option value="baixa">Baixa</option></select></Field>
                          <Field label="Follow-up"><select value={detail.follow_up_status} onChange={(event) => setDetail((current) => current ? { ...current, follow_up_status: event.target.value } : current)} className={inputClassName}><option value="pendente">Pendente</option><option value="em_andamento">Em andamento</option><option value="aguardando_retorno">Aguardando retorno</option><option value="concluido">Concluido</option></select></Field>
                          <Field label="Owner interno"><input value={detail.internal_owner ?? ""} onChange={(event) => setDetail((current) => current ? { ...current, internal_owner: event.target.value } : current)} className={inputClassName} /></Field>
                          <Field label="Numero do processo"><input value={detail.process_number ?? ""} onChange={(event) => setDetail((current) => current ? { ...current, process_number: event.target.value } : current)} className={inputClassName} /></Field>
                          <Field label="Proxima acao"><input value={detail.next_action ?? ""} onChange={(event) => setDetail((current) => current ? { ...current, next_action: event.target.value } : current)} className={inputClassName} /></Field>
                        </div>
                        <Field label="Observacoes internas"><input value={detail.internal_notes ?? ""} onChange={(event) => setDetail((current) => current ? { ...current, internal_notes: event.target.value } : current)} className={inputClassName} /></Field>
                        <label className="flex items-center gap-3 rounded-[22px] border border-slate-200 bg-[rgba(245,241,234,0.65)] px-4 py-3 text-sm text-slate-700">
                          <input type="checkbox" checked={detail.manual_review_required} onChange={(event) => setDetail((current) => current ? { ...current, manual_review_required: event.target.checked } : current)} className="h-4 w-4 rounded border-slate-300" />
                          Manter revisao manual obrigatoria
                        </label>
                        <div className="flex justify-end">
                          <button onClick={saveCase} disabled={isPending} className="rounded-[20px] bg-[linear-gradient(135deg,_#d3ae21,_#e6c95f)] px-5 py-3 text-sm font-semibold text-ink transition hover:brightness-95 disabled:opacity-60">
                            {isPending ? "Salvando..." : "Salvar alteracoes"}
                          </button>
                        </div>
                      </div>
                    )}
                  </SectionCard>

                  <div className="space-y-6">
                    <SectionCard title="Resumo do caso" description="Leitura curta para orientar mesa, governanca e decisao." eyebrow="Resumo">
                      {!detail ? <LoadingBlock /> : (
                        <div className="space-y-4">
                          <div className="rounded-[24px] border border-slate-200 bg-[rgba(245,241,234,0.6)] px-5 py-5 text-sm leading-7 text-slate-700">{analysis?.summary_executive ?? "Analise executiva indisponivel no momento."}</div>
                          <MiniMetric label="Owner sugerido" value={analysis?.owner_recommendation ?? detail.internal_owner ?? "-"} wrap />
                          <MiniMetric label="Follow-up recomendado" value={analysis?.follow_up_recommendation ?? detail.next_action ?? "-"} wrap />
                        </div>
                      )}
                    </SectionCard>
                    <SectionCard title="Leitura financeira" description="Valores, processo e postura operacional em uma unica superficie." eyebrow="Finance">
                      {!detail ? <LoadingBlock /> : (
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                          <BoardMetric label="Valor da acao" value={currency(detail.action_amount)} />
                          <BoardMetric label="Custas juridicas" value={currency(detail.legal_cost_amount)} />
                          <BoardMetric label="Processo" value={detail.process_number ?? "-"} />
                          <BoardMetric label="Ultima atualizacao" value={detail.progress_updated_at ? formatDate(detail.progress_updated_at) : "-"} />
                        </div>
                      )}
                    </SectionCard>
                  </div>
                </div>
              ) : null}

              {activePanel === "analise" ? (
                <div className="mt-5 grid gap-6 xl:grid-cols-[1fr_0.92fr]">
                  <SectionCard title="Analise estruturada" description="Motor analitico, riscos-chave, acoes recomendadas e owner sugerido." eyebrow="AI">
                    {!analysis ? (
                      <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-sm text-slate-500">Analise indisponivel para este caso.</div>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid gap-3 md:grid-cols-3">
                          <MiniMetric label="Risk score" value={`${analysis.risk_score}/100`} />
                          <MiniMetric label="Match score" value={`${analysis.match_confidence_score}/100`} />
                          <MiniMetric label="Motor" value={analysis.generated_by} wrap />
                        </div>
                        <div className="rounded-[24px] border border-slate-200 bg-[rgba(245,241,234,0.6)] px-5 py-5 text-sm leading-7 text-slate-700">{analysis.summary_executive}</div>
                        <ListCard title="Riscos-chave" items={analysis.key_risks} tone="border-red-100 bg-red-50/60" />
                        <ListCard title="Acoes recomendadas" items={analysis.recommended_actions} tone="border-emerald-100 bg-emerald-50/60" />
                      </div>
                    )}
                  </SectionCard>
                  <SectionCard title="Leitura financeira e operacional" description="Quadro compacto para decisao executiva sobre o caso selecionado." eyebrow="Board">
                    <div className="grid gap-3 md:grid-cols-2">
                      <BoardMetric label="Valor da acao" value={currency(selectedCase?.action_amount)} />
                      <BoardMetric label="Custas juridicas" value={currency(selectedCase?.legal_cost_amount)} />
                      <BoardMetric label="Match score" value={analysis ? `${analysis.match_confidence_score}/100` : "-"} />
                      <BoardMetric label="Risk score" value={analysis ? `${analysis.risk_score}/100` : "-"} />
                    </div>
                  </SectionCard>
                </div>
              ) : null}

              {activePanel === "timeline" ? (
                <div className="mt-5 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                  <SectionCard title="Timeline e tratativas" description="Historico completo do caso e eventos internos." eyebrow="Timeline">
                    {!detail ? <LoadingBlock /> : !detail.events.length ? (
                      <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-sm text-slate-500">Nenhum evento registrado.</div>
                    ) : (
                      <div className="space-y-3">
                        {detail.events.map((event) => (
                          <div key={event.id} className="rounded-[24px] border border-slate-200 bg-white px-5 py-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusPill value={event.source} />
                              <div className="text-sm font-semibold text-ink">{event.title}</div>
                            </div>
                            {event.description ? <div className="mt-3 break-words text-sm leading-7 text-slate-600">{event.description}</div> : null}
                            <div className="mt-3 text-xs uppercase tracking-[0.16em] text-slate-400">{formatDate(event.created_at)}{event.created_by ? ` | ${event.created_by}` : ""}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </SectionCard>
                  <SectionCard title="Nova tratativa" description="Registre comentario, decisao, validacao interna ou orientacao para escritorio." eyebrow="Notes">
                    <div className="rounded-[24px] border border-slate-200 bg-[rgba(245,241,234,0.6)] p-4">
                      <textarea value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} className="min-h-40 w-full rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-law-gold" placeholder="Registrar observacao, decisao, validacao interna ou pendencia." />
                      <div className="mt-4 flex justify-end">
                        <button onClick={addComment} disabled={!commentDraft.trim() || isPending} className="rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-law-gold disabled:opacity-60">Registrar comentario</button>
                      </div>
                    </div>
                  </SectionCard>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TopSignal({ label, value, hint, icon: Icon }: { label: string; value: string; hint: string; icon: LucideIcon }) {
  return (
    <div className="law-elevate rounded-[26px] border border-slate-200 bg-white/88 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">{label}</div>
          <div className="mt-3 break-words text-[clamp(1.45rem,2vw,2rem)] font-semibold leading-none text-ink">{value}</div>
          <div className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">{hint}</div>
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-slate-200 bg-law-cloud">
          <Icon className="h-5 w-5 text-law-navy" />
        </div>
      </div>
    </div>
  );
}

function SurfaceSignal({ label, value, hint, icon: Icon }: { label: string; value: string; hint: string; icon: LucideIcon }) {
  return (
    <div className="law-elevate rounded-[24px] border border-slate-200 bg-white/92 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">{label}</div>
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

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="law-surface-card law-elevate law-reveal rounded-[30px] p-5">
      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{label}</div>
      <div className="mt-4 break-words text-[clamp(1.7rem,2.4vw,2.4rem)] font-semibold leading-none text-ink">{value}</div>
    </div>
  );
}

function MiniMetric({ label, value, wrap = false }: { label: string; value: string; wrap?: boolean }) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white/90 px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className={cn("mt-2 font-semibold text-ink", wrap ? "break-words" : "truncate")}>{value}</div>
    </div>
  );
}

function BoardMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white px-5 py-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className="mt-2 break-words text-lg font-semibold text-ink">{value}</div>
    </div>
  );
}

function FilterSelect({ value, onChange, options, label }: { value: string; onChange: (value: string) => void; options: string[]; label: string }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className={inputClassName} aria-label={label}>
      {options.map((option) => (
        <option key={option} value={option}>
          {option === "todos" ? `Todos os ${label.toLowerCase()}s` : option.replace(/_/g, " ")}
        </option>
      ))}
    </select>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function LoadingBlock() {
  return <div className="law-shimmer h-40 rounded-[24px] bg-[linear-gradient(90deg,_rgba(241,245,249,1),_rgba(248,250,252,0.9),_rgba(241,245,249,1))]" />;
}

function ListCard({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  return (
    <div className={cn("rounded-[24px] border px-5 py-5", tone)}>
      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{title}</div>
      <div className="mt-3 space-y-3">
        {items.map((item) => (
          <div key={item} className="break-words rounded-[20px] border border-white/80 bg-white/80 px-4 py-3 text-sm text-slate-700">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
