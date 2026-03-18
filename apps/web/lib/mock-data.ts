type MockResponseMap = Record<string, unknown>;

type OperationalCase = {
  id: string;
  source_book: string;
  spreadsheet_row_id: string;
  cedente_name: string;
  sacado_name?: string | null;
  current_status: string;
  current_phase?: string | null;
  status_group: string;
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
  aging_days?: number | null;
  manual_review_required: boolean;
  internal_notes?: string | null;
  monitored_entity_name?: string | null;
  related_alert_id?: string | null;
  created_at: string;
  updated_at: string;
};

type OperationalCaseEvent = {
  id: string;
  event_type: string;
  title: string;
  description?: string | null;
  previous_status?: string | null;
  new_status?: string | null;
  previous_phase?: string | null;
  new_phase?: string | null;
  source: string;
  created_by?: string | null;
  payload_json?: Record<string, unknown> | null;
  created_at: string;
};

const baseCases: OperationalCase[] = [
  {
    id: "opc-1",
    source_book: "LAW_FUNDO",
    spreadsheet_row_id: "1",
    cedente_name: "CAPEZIO DO BRASIL CONFECCAO LTDA",
    sacado_name: null,
    current_status: "Em Tramitacao",
    current_phase: "Aguardando Citacao",
    status_group: "citacao",
    follow_up_status: "em_andamento",
    priority: "alta",
    document_sent_date: "2025-10-01",
    filing_date: "2024-09-03",
    action_amount: 97351.54,
    legal_cost_amount: 0,
    process_number: "5001234-11.2024.8.26.0100",
    latest_progress: "Processo distribuido, com pesquisa patrimonial em andamento.",
    progress_updated_at: "2026-03-10",
    internal_owner: "Juridico Contencioso",
    next_action: "Monitorar retorno das pesquisas patrimoniais.",
    next_action_due_date: "2026-03-18",
    aging_days: 2,
    manual_review_required: false,
    internal_notes: "Caso com bom historico documental.",
    monitored_entity_name: "CAPEZIO DO BRASIL CONFECCAO LTDA",
    related_alert_id: "alt-1",
    created_at: "2026-03-10T09:00:00-03:00",
    updated_at: "2026-03-11T08:40:00-03:00"
  },
  {
    id: "opc-2",
    source_book: "LAW_FUNDO",
    spreadsheet_row_id: "5",
    cedente_name: "PLASTQUIMICOS COMERCIO E TRANSPORTES",
    sacado_name: "CIA DO TRANSPORTE LTDA",
    current_status: "Nao iniciada",
    current_phase: null,
    status_group: "pre_ajuizamento",
    follow_up_status: "pendente",
    priority: "media",
    document_sent_date: "2025-06-17",
    filing_date: null,
    action_amount: 14629.71,
    legal_cost_amount: 0,
    process_number: null,
    latest_progress: "Embargos opostos; aguardando andamento e definicao de owner.",
    progress_updated_at: "2026-03-09",
    internal_owner: "Mesa FIDC",
    next_action: "Validar prazo para manifestacao nos embargos.",
    next_action_due_date: "2026-03-17",
    aging_days: 3,
    manual_review_required: false,
    internal_notes: "Fluxo precisa sair da planilha.",
    monitored_entity_name: "PLASTQUIMICOS COMERCIO E TRANSPORTES",
    related_alert_id: null,
    created_at: "2026-03-09T11:30:00-03:00",
    updated_at: "2026-03-10T15:20:00-03:00"
  },
  {
    id: "opc-3",
    source_book: "LAW_SEC",
    spreadsheet_row_id: "29",
    cedente_name: "GEO FOREST FLORESTAL LTDA",
    sacado_name: "FABRICA DE COMPENSADOS APECS EIRELI",
    current_status: "Aguardando julgamento",
    current_phase: null,
    status_group: "julgamento",
    follow_up_status: "aguardando_retorno",
    priority: "alta",
    document_sent_date: "2020-10-07",
    filing_date: "2020-07-07",
    action_amount: 51551.79,
    legal_cost_amount: 0,
    process_number: null,
    latest_progress: "Executada em recuperacao judicial; caso sensivel por insolvencia.",
    progress_updated_at: "2026-03-07",
    internal_owner: "Comite de Risco",
    next_action: "Avaliar habilitacao e consolidar exposicao por grupo.",
    next_action_due_date: "2026-03-14",
    aging_days: 5,
    manual_review_required: false,
    internal_notes: "Relacionar com alertas de insolvencia.",
    monitored_entity_name: "GEO FOREST FLORESTAL LTDA",
    related_alert_id: "alt-3",
    created_at: "2026-03-07T13:00:00-03:00",
    updated_at: "2026-03-10T09:45:00-03:00"
  },
  {
    id: "opc-4",
    source_book: "LAW_SEC",
    spreadsheet_row_id: "28",
    cedente_name: "CRISMERAK CONFECCOES LTDA",
    sacado_name: null,
    current_status: "Citacao",
    current_phase: null,
    status_group: "citacao",
    follow_up_status: "pendente",
    priority: "media",
    document_sent_date: "2023-07-07",
    filing_date: "2023-07-07",
    action_amount: 62278.82,
    legal_cost_amount: 0,
    process_number: null,
    latest_progress: "Processo suspenso; aguardando cumprimento de oficio.",
    progress_updated_at: "2026-03-04",
    internal_owner: null,
    next_action: "Definir owner e monitorar cumprimento do oficio.",
    next_action_due_date: "2026-03-19",
    aging_days: 8,
    manual_review_required: true,
    internal_notes: "Sem responsavel definido na planilha.",
    monitored_entity_name: null,
    related_alert_id: null,
    created_at: "2026-03-04T14:00:00-03:00",
    updated_at: "2026-03-10T07:50:00-03:00"
  }
];

const operationalCasesState = JSON.parse(JSON.stringify(baseCases)) as OperationalCase[];
const operationalCaseEventsState: Record<string, OperationalCaseEvent[]> = {
  "opc-1": [
    {
      id: "evt-opc-1-a",
      event_type: "spreadsheet_sync",
      title: "Caso importado da planilha LAW",
      description: "Importacao inicial do caso para acompanhamento operacional.",
      previous_status: null,
      new_status: "Em Tramitacao",
      previous_phase: null,
      new_phase: "Aguardando Citacao",
      source: "spreadsheet",
      created_by: "system@lawmonitor.local",
      payload_json: { portfolio: "LAW_FUNDO" },
      created_at: "2026-03-10T09:00:00-03:00"
    }
  ]
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nowIso() {
  return new Date().toISOString();
}

function toUrl(path: string) {
  return new URL(path, "http://demo.local");
}

function riskScore(item: OperationalCase) {
  let score = 35;
  if (item.priority === "alta") score += 25;
  else if (item.priority === "media") score += 12;
  if (item.status_group === "execucao" || item.status_group === "insolvencia") score += 20;
  else if (item.status_group === "citacao" || item.status_group === "julgamento") score += 10;
  if (item.manual_review_required) score += 8;
  if ((item.action_amount ?? 0) >= 50000) score += 5;
  return Math.min(score, 100);
}

function matchScore(item: OperationalCase) {
  let score = 45;
  if (item.monitored_entity_name) score += 25;
  if (item.sacado_name) score += 10;
  if (item.process_number) score += 8;
  if (item.latest_progress) score += 7;
  if (item.manual_review_required) score -= 15;
  return Math.max(Math.min(score, 100), 0);
}

function buildOperationsSummary() {
  const totalAmount = operationalCasesState.reduce((sum, item) => sum + (item.action_amount ?? 0), 0);
  return {
    total_cases: 67,
    total_amount: totalAmount || 1624073.78,
    high_priority_cases: operationalCasesState.filter((item) => item.priority === "alta").length,
    pending_manual_review: operationalCasesState.filter((item) => item.manual_review_required).length,
    by_portfolio: [
      { portfolio: "LAW_FUNDO", cases: 26, amount: 684113.54, high_priority: 5 },
      { portfolio: "LAW_SEC", cases: 41, amount: 939960.24, high_priority: 9 }
    ],
    by_status: [
      { name: "Execucao", value: 18 },
      { name: "Citacao", value: 12 },
      { name: "Aguardando julgamento", value: 6 },
      { name: "Nao iniciada", value: 9 }
    ],
    by_priority: [
      { name: "alta", value: 14 },
      { name: "media", value: 31 },
      { name: "baixa", value: 22 }
    ],
    aging_buckets: [
      { name: "0-15 dias", value: 12 },
      { name: "16-30 dias", value: 18 },
      { name: "31-60 dias", value: 15 },
      { name: "60+ dias", value: 22 }
    ],
    top_cedentes: [
      { name: "PLASTQUIMICOS COMERCIO E TRANSPORTES", value: 173737.25 },
      { name: "GEO FOREST FLORESTAL LTDA", value: 393960.24 },
      { name: "CAPEZIO DO BRASIL CONFECCAO LTDA", value: 97351.54 }
    ],
    recent_updates: operationalCasesState.map((item) => ({
      id: item.id,
      portfolio: item.source_book,
      cedente: item.cedente_name,
      sacado: item.sacado_name,
      status: item.current_status,
      priority: item.priority,
      next_action: item.next_action
    }))
  };
}

function buildDashboardData() {
  const summary = buildOperationsSummary();
  return {
    metrics: [
      { label: "Alertas criticos", value: "12", delta: "8 em alta pressao" },
      { label: "Empresas monitoradas", value: "67", delta: "LAW FUNDO e LAW SEC" },
      { label: "Execucoes concluidas", value: "98,7%", delta: "janela de 30 dias" },
      { label: "Exposicao potencial", value: "R$ 1,62 mi", delta: "carteira em cobranca" }
    ],
    event_distribution: [
      { name: "Execucao", value: 18 },
      { name: "Citacao", value: 12 },
      { name: "Julgamento", value: 6 },
      { name: "Insolvencia", value: 5 }
    ],
    severity_distribution: [
      { name: "Critico", value: 5 },
      { name: "Alto", value: 9 },
      { name: "Medio", value: 15 },
      { name: "Baixo", value: 21 }
    ],
    recent_timeline: [
      { id: "evt-1", title: "Pedido de recuperacao judicial", company: "Metalurgica Aurora S.A.", date: "2026-03-11T08:30:00-03:00" },
      { id: "evt-2", title: "Bloqueio BacenJud", company: "Transportes Vale Norte Ltda.", date: "2026-03-10T16:10:00-03:00" }
    ],
    integrations: [
      { name: "Escavador", status: "online" },
      { name: "OpenAI", status: "online" },
      { name: "Notificacoes", status: "pending" },
      { name: "Webhook corporativo", status: "online" }
    ],
    scheduler_status: {
      last_run: "2026-03-10T22:00:00-03:00",
      status: "success",
      summary: { entities_processed: 67, events_detected: 39, alerts_generated: 12 }
    },
    operational_queue: [
      { label: "Fila operacional", value: 67, hint: "casos ativos importados da planilha LAW" },
      { label: "Alta prioridade", value: 14, hint: "exigem resposta juridica ou decisao interna" },
      { label: "Revisao manual", value: 9, hint: "sem owner definido ou contexto incompleto" }
    ],
    portfolio_breakdown: summary.by_portfolio,
    priority_distribution: summary.by_priority,
    aging_buckets: summary.aging_buckets,
    exposure_leaders: summary.top_cedentes,
    recent_case_updates: summary.recent_updates
  };
}

function parseBody(init?: RequestInit) {
  if (!init?.body) return {};
  return JSON.parse(String(init.body)) as Partial<OperationalCase>;
}

function buildAnalysis(item: OperationalCase) {
  return {
    summary_executive:
      `${item.cedente_name} esta em ${item.current_status.toLowerCase()} no portfolio ${item.source_book.replace("_", " ")} e deve ser operado integralmente no sistema.`,
    priority_justification: `Prioridade ${item.priority} sustentada por status ${item.current_status.toLowerCase()}.`,
    owner_recommendation: item.internal_owner ?? "Definir owner juridico-financeiro para assumir o caso.",
    follow_up_recommendation: item.next_action ?? "Atualizar andamento e registrar proxima tratativa.",
    key_risks: [
      item.manual_review_required
        ? "Caso depende de revisao manual para consolidar contexto."
        : "Caso com base operacional consistente, mas ainda sensivel.",
      "Exige alinhamento entre juridico, operacoes e risco."
    ],
    recommended_actions: [
      item.next_action ?? "Registrar proxima acao com prazo.",
      "Manter timeline interna atualizada no sistema."
    ],
    risk_score: riskScore(item),
    match_confidence_score: matchScore(item),
    confidence_score: 0.78,
    structured_facts: {
      portfolio: item.source_book,
      cedente: item.cedente_name,
      sacado: item.sacado_name,
      status_atual: item.current_status,
      fase_atual: item.current_phase,
      follow_up_status: item.follow_up_status,
      prioridade: item.priority,
      owner: item.internal_owner,
      aging_days: item.aging_days,
      valor_acao: item.action_amount,
      custas_juridicas: item.legal_cost_amount,
      process_number: item.process_number,
      manual_review_required: item.manual_review_required
    },
    generated_by: "heuristic-fallback"
  };
}

const staticMockResponses: MockResponseMap = {
  "/settings": {
    brand_name: "LAW FIDC Risk Shield",
    timezone: "America/Sao_Paulo",
    scheduler_hour: 22,
    scheduler_minute: 0,
    workbook_status: "sincronizado com a estrutura da planilha LAW",
    frontend_status: "operando com dados simulados",
    notification_matrix: {
      critico: ["risk@lawmonitor.com", "juridico@lawmonitor.com"],
      alto: ["risk@lawmonitor.com"],
      medio: ["operacoes@lawmonitor.com"]
    }
  },
  "/users": [
    { id: "usr-1", full_name: "Ana Beatriz Costa", email: "ana.costa@lawmonitor.com", role: "admin", is_active: true },
    { id: "usr-2", full_name: "Marcos Teles", email: "marcos.teles@lawmonitor.com", role: "risco", is_active: true }
  ],
  "/alerts": [
    { id: "alt-1", severity: "Critico", status: "em_analise", title: "Recuperacao judicial com exposicao relevante", monitored_entity: "Metalurgica Aurora S.A.", found_cnpj: "12.345.678/0001-90", event_type: "Recuperacao judicial", created_at: "2026-03-11T08:40:00-03:00" },
    { id: "alt-2", severity: "Alto", status: "confirmado", title: "Execucao com pedido de penhora online", monitored_entity: "Distribuidora Prisma Ltda.", found_cnpj: "98.765.432/0001-10", event_type: "Execucao", created_at: "2026-03-10T15:50:00-03:00" }
  ],
  "/events": [
    { id: "evt-1", event_type: "Recuperacao judicial", principal_company: "Metalurgica Aurora S.A.", principal_company_cnpj: "12.345.678/0001-90", process_number: "5001234-11.2026.8.26.0100", court: "TJSP", publication_date: "2026-03-11T08:30:00-03:00" }
  ],
  "/events/documents": [
    { id: "doc-1", title: "Despacho inicial", process_number: "5001234-11.2026.8.26.0100", court: "TJSP", excerpt: "Deferido o processamento da recuperacao judicial.", publication_date: "2026-03-11T09:00:00-03:00" }
  ],
  "/matches": [
    { id: "mat-1", match_type: "CNPJ exato", company: "Metalurgica Aurora S.A.", cnpj: "12.345.678/0001-90", event_type: "Recuperacao judicial", match_score: 100, risk_score: 98 }
  ],
  "/audit/logs": [
    { id: "aud-1", actor_email: "ana.costa@lawmonitor.com", entity_name: "risk_alert", entity_id: "alt-1", action: "status_updated", created_at: "2026-03-11T09:10:00-03:00" }
  ],
  "/entities": [
    { id: "ent-1", entity_type: "Cedente", corporate_name: "Metalurgica Aurora S.A.", trade_name: "Aurora Metais", cnpj: "12.345.678/0001-90", internal_owner: "Mesa FIDC", updated_at: "2026-03-08T13:30:00-03:00" }
  ],
  "/executions": [
    { id: "run-1", run_type: "Diaria", status: "success", requested_by: "scheduler", started_at: "2026-03-10T22:00:00-03:00", finished_at: "2026-03-10T22:14:00-03:00", manual: false }
  ]
};

function getCaseId(path: string, suffix = "") {
  const pathname = toUrl(path).pathname;
  const pattern = suffix
    ? new RegExp(`^/operations/cases/([^/]+)/${suffix}$`)
    : /^\/operations\/cases\/([^/]+)$/;
  const match = pathname.match(pattern);
  return match?.[1] ?? null;
}

function addEvent(caseId: string, event: Omit<OperationalCaseEvent, "id" | "created_at">) {
  operationalCaseEventsState[caseId] ??= [];
  operationalCaseEventsState[caseId].unshift({
    ...event,
    id: `evt-${caseId}-${Date.now()}`,
    created_at: nowIso()
  });
}

export function getMockResponse<T>(path: string, init?: RequestInit): T | null {
  const pathname = toUrl(path).pathname;
  const method = (init?.method ?? "GET").toUpperCase();

  if (pathname === "/auth/login") {
    return clone({
      access_token: "offline-demo-token",
      refresh_token: "offline-demo-refresh-token"
    } as T);
  }

  if (pathname === "/dashboard") return clone(buildDashboardData() as T);
  if (pathname === "/operations/summary") return clone(buildOperationsSummary() as T);
  if (pathname === "/operations/cases" && method === "GET") return clone(operationalCasesState as T);

  const caseId = getCaseId(path);
  if (caseId) {
    const item = operationalCasesState.find((entry) => entry.id === caseId);
    if (!item) return null;
    if (method === "GET") {
      return clone({ ...item, events: operationalCaseEventsState[caseId] ?? [] } as T);
    }
    if (method === "PATCH") {
      const changes = parseBody(init);
      const previousStatus = item.current_status;
      const previousPhase = item.current_phase;
      Object.assign(item, changes, { updated_at: nowIso() });
      addEvent(caseId, {
        event_type: "manual_edit",
        title: "Caso operacional atualizado",
        description: changes.internal_notes ?? changes.latest_progress ?? changes.next_action ?? "Edicao manual do caso operacional.",
        previous_status: previousStatus,
        new_status: item.current_status,
        previous_phase: previousPhase,
        new_phase: item.current_phase,
        source: "manual",
        created_by: "admin@lawmonitor.com",
        payload_json: { changes }
      });
      return clone(item as T);
    }
  }

  const analysisCaseId = getCaseId(path, "analysis");
  if (analysisCaseId && method === "POST") {
    const item = operationalCasesState.find((entry) => entry.id === analysisCaseId);
    return item ? clone(buildAnalysis(item) as T) : null;
  }

  const followUpCaseId = getCaseId(path, "follow-up");
  if (followUpCaseId && method === "POST") {
    const item = operationalCasesState.find((entry) => entry.id === followUpCaseId);
    if (!item) return null;
    const changes = parseBody(init);
    const previousStatus = item.follow_up_status;
    const previousPriority = item.priority;
    Object.assign(item, changes, { updated_at: nowIso() });
    addEvent(followUpCaseId, {
      event_type: "follow_up_update",
      title: "Atualizacao operacional",
      description: changes.internal_notes ?? changes.next_action ?? "Atualizacao de follow-up.",
      previous_status: previousStatus,
      new_status: item.follow_up_status,
      previous_phase: previousPriority,
      new_phase: item.priority,
      source: "manual",
      created_by: "admin@lawmonitor.com",
      payload_json: { changes }
    });
    return clone({ ok: true } as T);
  }

  const commentCaseId = getCaseId(path, "comments");
  if (commentCaseId && method === "POST") {
    const item = operationalCasesState.find((entry) => entry.id === commentCaseId);
    if (!item) return null;
    const body = init?.body ? JSON.parse(String(init.body)) as { message?: string } : {};
    addEvent(commentCaseId, {
      event_type: "comment",
      title: "Comentario operacional",
      description: body.message ?? "Comentario registrado no caso.",
      previous_status: null,
      new_status: item.follow_up_status,
      previous_phase: null,
      new_phase: item.priority,
      source: "manual",
      created_by: "admin@lawmonitor.com",
      payload_json: { message: body.message ?? "" }
    });
    return clone({ ok: true } as T);
  }

  if (pathname === "/operations/sync" && method === "POST") {
    return clone({
      source_name: "Law Sistema Juridico (1).xlsx",
      records_total: 67,
      created_count: 0,
      updated_count: 67,
      summary: buildOperationsSummary()
    } as T);
  }

  if ((pathname === "/imports/workbook/preview-upload" || pathname === "/imports/workbook/preview") && method === "POST") {
    return clone({
      exists: true,
      records_total: 67,
      cases: operationalCasesState.slice(0, 4).map((item) => ({
        portfolio: item.source_book,
        row_id: item.id,
        cedente_name: item.cedente_name,
        sacado_name: item.sacado_name,
        current_status: item.current_status,
        priority: item.priority,
        next_action: item.next_action,
        action_amount: item.action_amount
      })),
      summary: {
        law_fundo: 26,
        law_sec: 41,
        high_priority: 14
      }
    } as T);
  }

  if (pathname === "/imports/workbook/commit-upload" && method === "POST") {
    return clone({
      ok: true,
      source_name: "Law Sistema Juridico (1).xlsx",
      records_total: 67,
      created_count: 0,
      updated_count: 67,
      summary: buildOperationsSummary()
    } as T);
  }

  const response = staticMockResponses[pathname];
  return response ? clone(response as T) : null;
}
