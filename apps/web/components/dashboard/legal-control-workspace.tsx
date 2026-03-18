"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, FolderKanban, Plus, RefreshCw, Save, Search } from "lucide-react";

import { apiFetch } from "@/lib/api";
import { cn, currency } from "@/lib/utils";
import { SectionCard } from "./section-card";
import { StatusPill } from "./status-pill";

const WORKBOOK_NAME = "Law Sistema Juridico (1).xlsx";
const inputClassName =
  "w-full rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-law-gold";

type ApiCase = {
  id: string;
  source_book: string;
  spreadsheet_row_id: string;
  cedente_name: string;
  sacado_name?: string | null;
  current_status: string;
  current_phase?: string | null;
  follow_up_status: string;
  priority: string;
  document_sent_date?: string | null;
  filing_date?: string | null;
  action_amount?: number | null;
  legal_cost_amount?: number | null;
  process_number?: string | null;
  latest_progress?: string | null;
  progress_updated_at?: string | null;
  internal_owner?: string | null;
  next_action?: string | null;
  next_action_due_date?: string | null;
  manual_review_required: boolean;
  internal_notes?: string | null;
};

type WorkbookPreview = {
  exists: boolean;
  records_total?: number;
};

type WorkbookCommit = {
  ok: boolean;
  records_total: number;
  created_count: number;
  updated_count: number;
};

type LegalControlRow = {
  id: string;
  spreadsheet_id: string;
  portfolio: string;
  cedente: string;
  sacado: string;
  status: string;
  fase: string;
  follow_up_status: string;
  prioridade: string;
  data_envio_docs: string;
  data_ajuizamento: string;
  valor_acao: number | null;
  custas_juridicas: number | null;
  processo: string;
  ultimo_andamento: string;
  data_atualizacao: string;
  responsavel: string;
  proxima_acao: string;
  proxima_acao_data: string;
  observacoes: string;
  manual_review_required: boolean;
  origin: "planilha" | "manual";
};

function formatDateOnly(value?: string | null) {
  if (!value) return "-";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date);
}

function toDateInput(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function buildEmptyRow(portfolio = "LAW_FUNDO"): LegalControlRow {
  return {
    id: "",
    spreadsheet_id: "",
    portfolio,
    cedente: "",
    sacado: "",
    status: "",
    fase: "",
    follow_up_status: "pendente",
    prioridade: "media",
    data_envio_docs: "",
    data_ajuizamento: "",
    valor_acao: null,
    custas_juridicas: null,
    processo: "",
    ultimo_andamento: "",
    data_atualizacao: "",
    responsavel: "",
    proxima_acao: "",
    proxima_acao_data: "",
    observacoes: "",
    manual_review_required: true,
    origin: "manual"
  };
}

function mapCaseToRow(item: ApiCase): LegalControlRow {
  const isManual = item.spreadsheet_row_id.toUpperCase().startsWith("MANUAL-");
  return {
    id: item.id,
    spreadsheet_id: item.spreadsheet_row_id,
    portfolio: item.source_book,
    cedente: item.cedente_name,
    sacado: item.sacado_name ?? "",
    status: item.current_status,
    fase: item.current_phase ?? "",
    follow_up_status: item.follow_up_status,
    prioridade: item.priority,
    data_envio_docs: toDateInput(item.document_sent_date),
    data_ajuizamento: toDateInput(item.filing_date),
    valor_acao: item.action_amount ?? null,
    custas_juridicas: item.legal_cost_amount ?? null,
    processo: item.process_number ?? "",
    ultimo_andamento: item.latest_progress ?? "",
    data_atualizacao: toDateInput(item.progress_updated_at),
    responsavel: item.internal_owner ?? "",
    proxima_acao: item.next_action ?? "",
    proxima_acao_data: toDateInput(item.next_action_due_date),
    observacoes: item.internal_notes ?? "",
    manual_review_required: item.manual_review_required,
    origin: isManual ? "manual" : "planilha"
  };
}

function toPatchPayload(row: LegalControlRow) {
  return {
    current_status: row.status || null,
    current_phase: row.fase || null,
    follow_up_status: row.follow_up_status,
    priority: row.prioridade,
    document_sent_date: row.data_envio_docs || null,
    filing_date: row.data_ajuizamento || null,
    action_amount: row.valor_acao,
    legal_cost_amount: row.custas_juridicas,
    process_number: row.processo || null,
    latest_progress: row.ultimo_andamento || null,
    progress_updated_at: row.data_atualizacao || null,
    internal_owner: row.responsavel || null,
    next_action: row.proxima_acao || null,
    next_action_due_date: row.proxima_acao_data || null,
    manual_review_required: row.manual_review_required,
    internal_notes: row.observacoes || null
  };
}

function toCreatePayload(row: LegalControlRow, totalRows: number) {
  return {
    source_book: row.portfolio,
    spreadsheet_row_id: row.spreadsheet_id || `MANUAL-${totalRows + 1}`,
    cedente_name: row.cedente,
    sacado_name: row.sacado || null,
    current_status: row.status,
    current_phase: row.fase || null,
    follow_up_status: row.follow_up_status,
    priority: row.prioridade,
    document_sent_date: row.data_envio_docs || null,
    filing_date: row.data_ajuizamento || null,
    action_amount: row.valor_acao,
    legal_cost_amount: row.custas_juridicas,
    process_number: row.processo || null,
    latest_progress: row.ultimo_andamento || null,
    progress_updated_at: row.data_atualizacao || null,
    internal_owner: row.responsavel || null,
    next_action: row.proxima_acao || null,
    next_action_due_date: row.proxima_acao_data || null,
    manual_review_required: row.manual_review_required,
    internal_notes: row.observacoes || null
  };
}

export function LegalControlWorkspace() {
  const [rows, setRows] = useState<LegalControlRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<LegalControlRow>(buildEmptyRow());
  const [isCreating, setIsCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [portfolioFilter, setPortfolioFilter] = useState("todos");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [workbookPreview, setWorkbookPreview] = useState<WorkbookPreview | null>(null);

  const loadRows = useCallback(
    async (focusId?: string) => {
      setLoading(true);
      setError(null);
      try {
        const [cases, preview] = await Promise.all([
          apiFetch<ApiCase[]>("/operations/cases"),
          apiFetch<WorkbookPreview>("/imports/workbook/preview")
        ]);
        const mapped = cases.map(mapCaseToRow);
        setRows(mapped);
        setWorkbookPreview(preview);
        const nextId =
          focusId && mapped.some((row) => row.id === focusId)
            ? focusId
            : mapped.some((row) => row.id === selectedId)
              ? selectedId
              : mapped[0]?.id ?? "";
        setSelectedId(nextId);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Nao foi possivel carregar o controle juridico."
        );
      } finally {
        setLoading(false);
      }
    },
    [selectedId]
  );

  useEffect(() => {
    loadRows().catch(() => undefined);
  }, [loadRows]);

  const portfolioOptions = useMemo(
    () => ["todos", ...new Set(rows.map((row) => row.portfolio))],
    [rows]
  );

  const statusOptions = useMemo(
    () => ["todos", ...new Set(rows.map((row) => row.status).filter(Boolean))],
    [rows]
  );

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const matchesSearch = [
          row.spreadsheet_id,
          row.portfolio,
          row.cedente,
          row.sacado,
          row.status,
          row.fase,
          row.responsavel,
          row.ultimo_andamento,
          row.observacoes
        ]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase());
        const matchesPortfolio =
          portfolioFilter === "todos" || row.portfolio === portfolioFilter;
        const matchesStatus = statusFilter === "todos" || row.status === statusFilter;
        return matchesSearch && matchesPortfolio && matchesStatus;
      }),
    [portfolioFilter, rows, search, statusFilter]
  );

  const selectedRow = useMemo(
    () => rows.find((row) => row.id === selectedId) ?? null,
    [rows, selectedId]
  );

  const totalValue = useMemo(
    () => rows.reduce((sum, row) => sum + (row.valor_acao ?? 0), 0),
    [rows]
  );

  useEffect(() => {
    if (!isCreating && selectedRow) {
      setDraft(selectedRow);
    }
  }, [isCreating, selectedRow]);

  function updateDraft<K extends keyof LegalControlRow>(field: K, value: LegalControlRow[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function saveDraft() {
    if (!draft.cedente.trim() || !draft.status.trim()) {
      setError("Cedente e status sao obrigatorios.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      if (isCreating) {
        const created = await apiFetch<ApiCase>("/operations/cases", {
          method: "POST",
          body: JSON.stringify(toCreatePayload(draft, rows.length))
        });
        await loadRows(created.id);
        setIsCreating(false);
        setMessage("Caso criado e salvo na base real.");
      } else {
        await apiFetch<ApiCase>(`/operations/cases/${draft.id}`, {
          method: "PATCH",
          body: JSON.stringify(toPatchPayload(draft))
        });
        await loadRows(draft.id);
        setMessage("Registro atualizado na base real.");
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Nao foi possivel salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function syncWorkbook() {
    setSyncing(true);
    setError(null);
    setMessage(null);
    try {
      const result = await apiFetch<WorkbookCommit>("/imports/workbook/commit", { method: "POST" });
      await loadRows();
      setMessage(
        `Planilha sincronizada: ${result.records_total} registros, ${result.created_count} criados e ${result.updated_count} atualizados.`
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Nao foi possivel sincronizar a planilha."
      );
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <section className="law-surface-card rounded-[36px] bg-[linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(245,241,234,0.94))] p-6 xl:p-7">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-law-gold/30 bg-law-gold/12 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-law-navy">
              Base persistente
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Controle juridico
            </span>
          </div>
          <h1 className="mt-5 max-w-4xl font-serif text-[clamp(2.2rem,4vw,3.8rem)] leading-[0.92] text-ink">
            Controle juridico com dados reais e salvamento em banco.
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600">
            A tela agora trabalha em cima da API real. Novos casos e ajustes ficam persistidos na
            base operacional, e a planilha oficial pode ser sincronizada a qualquer momento.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <TopSignal label="Casos" value={loading ? "..." : String(rows.length)} hint="persistidos" icon={FolderKanban} />
            <TopSignal label="Valor mapeado" value={loading ? "..." : currency(totalValue)} hint="base operacional" icon={FileSpreadsheet} />
            <TopSignal label="Planilha" value={WORKBOOK_NAME} hint={workbookPreview?.exists ? `${workbookPreview.records_total ?? 0} linhas no servidor` : "nao localizada"} icon={RefreshCw} />
          </div>
        </section>

        <section className="law-surface-card rounded-[36px] p-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">Resumo</div>
          <div className="mt-2 font-serif text-[clamp(1.75rem,3vw,2.4rem)] leading-none text-ink">
            Operacao, planilha e cadastro manual no mesmo fluxo.
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <SurfaceSignal label="Sem responsavel" value={`${rows.filter((row) => !row.responsavel).length} casos`} hint="ownership pendente" />
            <SurfaceSignal label="Manuais" value={`${rows.filter((row) => row.origin === "manual").length} casos`} hint="fora da planilha" />
            <SurfaceSignal label="Filtro atual" value={`${filteredRows.length} linhas`} hint="recorte visivel" />
            <SurfaceSignal label="Persistencia" value="Banco operacional" hint="sem armazenamento local" />
          </div>
        </section>
      </div>

      {error ? <Banner tone="error" message={error} /> : null}
      {message ? <Banner tone="success" message={message} /> : null}

      <div className="grid gap-6 xl:grid-cols-[1.18fr_0.82fr]">
        <SectionCard
          title="Base consolidada"
          description="Casos persistidos em banco com busca, filtros e sincronizacao da planilha oficial."
          eyebrow="Controle"
        >
          <div className="grid gap-3 md:grid-cols-[minmax(0,1.5fr)_repeat(2,minmax(180px,0.7fr))_auto_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Pesquisar por cedente, sacado, status ou andamento"
                className="w-full rounded-[22px] border border-slate-200 bg-white px-11 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-law-gold"
              />
            </div>
            <select value={portfolioFilter} onChange={(event) => setPortfolioFilter(event.target.value)} className={inputClassName}>
              {portfolioOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "todos" ? "Todas as carteiras" : option.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={inputClassName}>
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "todos" ? "Todos os status" : option}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => { setIsCreating(true); setDraft(buildEmptyRow(portfolioFilter === "todos" ? "LAW_FUNDO" : portfolioFilter)); }} className="flex items-center justify-center gap-2 rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-law-gold/35 hover:text-ink">
              <Plus className="h-4 w-4" />
              Novo caso
            </button>
            <button type="button" onClick={syncWorkbook} disabled={syncing} className="flex items-center justify-center gap-2 rounded-[20px] border border-slate-200 bg-[rgba(245,241,234,0.7)] px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-law-gold/35 hover:text-ink disabled:opacity-60">
              <RefreshCw className={cn("h-4 w-4", syncing ? "animate-spin" : "")} />
              {syncing ? "Sincronizando..." : "Sincronizar planilha"}
            </button>
          </div>

          {loading ? (
            <div className="mt-5 grid gap-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="law-shimmer h-14 rounded-[22px] bg-[linear-gradient(90deg,_rgba(241,245,249,1),_rgba(248,250,252,0.9),_rgba(241,245,249,1))]" />
              ))}
            </div>
          ) : !filteredRows.length ? (
            <div className="law-empty-state mt-5 rounded-[28px] px-6 py-12 text-center text-slate-500">
              Nenhum caso encontrado para o recorte atual.
            </div>
          ) : (
            <div className="mt-5 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_22px_60px_rgba(15,23,42,0.07)]">
              <div className="overflow-x-auto">
                <table className="min-w-[1120px] table-fixed text-left text-sm">
                  <thead className="bg-[linear-gradient(180deg,_rgba(245,241,234,0.92),_rgba(255,255,255,0.94))] text-xs uppercase tracking-[0.22em] text-slate-500">
                    <tr>
                      <th className="px-5 py-4 font-semibold">Carteira</th>
                      <th className="px-5 py-4 font-semibold">ID</th>
                      <th className="px-5 py-4 font-semibold">Cedente</th>
                      <th className="px-5 py-4 font-semibold">Sacado</th>
                      <th className="px-5 py-4 font-semibold">Status</th>
                      <th className="px-5 py-4 font-semibold">Valor</th>
                      <th className="px-5 py-4 font-semibold">Ajuizamento</th>
                      <th className="px-5 py-4 font-semibold">Responsavel</th>
                      <th className="px-5 py-4 font-semibold">Acao</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredRows.map((row) => (
                      <tr key={row.id} className={cn("transition-colors duration-150 hover:bg-[rgba(245,241,234,0.45)]", !isCreating && row.id === selectedId ? "bg-[rgba(245,241,234,0.65)]" : "")}>
                        <td className="px-5 py-4 align-top"><div className="space-y-2"><StatusPill value={row.portfolio.replace(/_/g, " ")} />{row.origin === "manual" ? <StatusPill value="manual" /> : null}</div></td>
                        <td className="px-5 py-4 align-top text-slate-700">{row.spreadsheet_id}</td>
                        <td className="px-5 py-4 align-top font-medium text-ink">{row.cedente}</td>
                        <td className="px-5 py-4 align-top text-slate-600">{row.sacado || "-"}</td>
                        <td className="px-5 py-4 align-top"><StatusPill value={row.status} /></td>
                        <td className="px-5 py-4 align-top text-slate-700">{currency(row.valor_acao)}</td>
                        <td className="px-5 py-4 align-top text-slate-600">{formatDateOnly(row.data_ajuizamento)}</td>
                        <td className="px-5 py-4 align-top text-slate-600">{row.responsavel || "-"}</td>
                        <td className="px-5 py-4 align-top">
                          <button type="button" onClick={() => { setIsCreating(false); setSelectedId(row.id); setDraft(row); }} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 transition hover:border-law-gold/35 hover:text-ink">
                            Abrir ficha
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title={isCreating ? "Novo caso" : "Ficha do caso"}
          description="Cadastro e edicao persistidos em banco."
          eyebrow="Ficha"
          className="xl:sticky xl:top-5"
        >
          <div className="space-y-4">
            <div className="rounded-[24px] border border-slate-200 bg-[rgba(245,241,234,0.6)] px-4 py-4 text-sm text-slate-600">
              {isCreating
                ? "Novo caso manual. Ao salvar, ele entra na base operacional real."
                : `${WORKBOOK_NAME} | referencia ${draft.spreadsheet_id || "-"}`}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Carteira"><select value={draft.portfolio} onChange={(event) => updateDraft("portfolio", event.target.value)} className={inputClassName}>{portfolioOptions.filter((option) => option !== "todos").map((option) => <option key={option} value={option}>{option.replace(/_/g, " ")}</option>)}</select></Field>
              <Field label="ID da planilha"><input value={draft.spreadsheet_id} onChange={(event) => updateDraft("spreadsheet_id", event.target.value)} className={inputClassName} placeholder="Ex.: 68 ou MANUAL-90" /></Field>
            </div>
            <Field label="Cedente"><input value={draft.cedente} onChange={(event) => updateDraft("cedente", event.target.value)} className={inputClassName} /></Field>
            <Field label="Sacado"><input value={draft.sacado} onChange={(event) => updateDraft("sacado", event.target.value)} className={inputClassName} /></Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Status"><input value={draft.status} onChange={(event) => updateDraft("status", event.target.value)} className={inputClassName} /></Field>
              <Field label="Fase"><input value={draft.fase} onChange={(event) => updateDraft("fase", event.target.value)} className={inputClassName} /></Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Follow-up"><select value={draft.follow_up_status} onChange={(event) => updateDraft("follow_up_status", event.target.value)} className={inputClassName}><option value="pendente">Pendente</option><option value="em_andamento">Em andamento</option><option value="aguardando_retorno">Aguardando retorno</option><option value="concluido">Concluido</option></select></Field>
              <Field label="Prioridade"><select value={draft.prioridade} onChange={(event) => updateDraft("prioridade", event.target.value)} className={inputClassName}><option value="alta">Alta</option><option value="media">Media</option><option value="baixa">Baixa</option></select></Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Data envio docs"><input type="date" value={draft.data_envio_docs} onChange={(event) => updateDraft("data_envio_docs", event.target.value)} className={inputClassName} /></Field>
              <Field label="Data ajuizamento"><input type="date" value={draft.data_ajuizamento} onChange={(event) => updateDraft("data_ajuizamento", event.target.value)} className={inputClassName} /></Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Valor da acao"><input type="number" step="0.01" value={draft.valor_acao ?? ""} onChange={(event) => updateDraft("valor_acao", event.target.value ? Number(event.target.value) : null)} className={inputClassName} /></Field>
              <Field label="Custas juridicas"><input type="number" step="0.01" value={draft.custas_juridicas ?? ""} onChange={(event) => updateDraft("custas_juridicas", event.target.value ? Number(event.target.value) : null)} className={inputClassName} /></Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Processo"><input value={draft.processo} onChange={(event) => updateDraft("processo", event.target.value)} className={inputClassName} /></Field>
              <Field label="Responsavel"><input value={draft.responsavel} onChange={(event) => updateDraft("responsavel", event.target.value)} className={inputClassName} /></Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Data atualizacao"><input type="date" value={draft.data_atualizacao} onChange={(event) => updateDraft("data_atualizacao", event.target.value)} className={inputClassName} /></Field>
              <Field label="Proxima acao em"><input type="date" value={draft.proxima_acao_data} onChange={(event) => updateDraft("proxima_acao_data", event.target.value)} className={inputClassName} /></Field>
            </div>
            <Field label="Proxima acao"><input value={draft.proxima_acao} onChange={(event) => updateDraft("proxima_acao", event.target.value)} className={inputClassName} /></Field>
            <Field label="Ultimo andamento"><textarea value={draft.ultimo_andamento} onChange={(event) => updateDraft("ultimo_andamento", event.target.value)} className="min-h-32 w-full rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-law-gold" /></Field>
            <Field label="Observacoes"><textarea value={draft.observacoes} onChange={(event) => updateDraft("observacoes", event.target.value)} className="min-h-24 w-full rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-law-gold" /></Field>
            <label className="flex items-center gap-3 rounded-[18px] border border-slate-200 bg-[rgba(245,241,234,0.55)] px-4 py-3 text-sm text-slate-700">
              <input type="checkbox" checked={draft.manual_review_required} onChange={(event) => updateDraft("manual_review_required", event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              Manter revisao manual obrigatoria
            </label>
            <div className="flex flex-wrap justify-end gap-3">
              {isCreating ? <button type="button" onClick={() => { setIsCreating(false); if (selectedRow) setDraft(selectedRow); }} className="rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-law-gold/35 hover:text-ink">Cancelar</button> : null}
              <button type="button" onClick={saveDraft} disabled={saving} className="flex items-center gap-2 rounded-[20px] bg-[linear-gradient(135deg,_#d3ae21,_#e6c95f)] px-5 py-3 text-sm font-semibold text-ink transition hover:brightness-95 disabled:opacity-60">
                <Save className="h-4 w-4" />
                {saving ? "Salvando..." : "Salvar registro"}
              </button>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function TopSignal({ label, value, hint, icon: Icon }: { label: string; value: string; hint: string; icon: typeof FolderKanban }) {
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

function SurfaceSignal({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white/92 px-4 py-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">{label}</div>
      <div className="mt-2 break-words text-sm font-semibold text-ink">{value}</div>
      <div className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">{hint}</div>
    </div>
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

function Banner({ tone, message }: { tone: "success" | "error"; message: string }) {
  return (
    <div className={cn("rounded-[24px] px-5 py-4 text-sm", tone === "success" ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "border border-red-200 bg-red-50 text-red-700")}>
      {message}
    </div>
  );
}
