require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const fetch = require('node-fetch');
const {
  computeFollowupDate,
  resolveReplyOutcome,
  scoreOutreachQueue,
  shouldBlockOutreach,
} = require('./outreach-utils');
const {
  BUSINESS_TIMEZONE,
  getBusinessDateString,
  compareDateOnly,
  isDateBefore,
  isDateOnOrBefore,
} = require('./date-utils');
const {
  safeEqual,
  buildCorsOptions,
  createApiAuthMiddleware,
  applySecurityHeaders,
} = require('./security');

const app = express();
app.use(applySecurityHeaders);
app.use(cors(buildCorsOptions(process.env.CORS_ALLOWED_ORIGINS)));
app.use(express.json({ limit: '1mb' }));

// ═══════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════
const CONFIG = {
  pipedrive: {
    token: process.env.PIPEDRIVE_API_TOKEN || '',
    domain: process.env.PIPEDRIVE_COMPANY_DOMAIN || 'lawfinancas',
    pipelineId: process.env.PIPEDRIVE_PIPELINE_ID || '14',
  },
  openai: {
    key: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-5.2',
    classifierModel: process.env.OPENAI_MODEL_CLASSIFIER || process.env.OPENAI_MODEL || 'gpt-5.2-mini',
    messageModel: process.env.OPENAI_MODEL_MESSAGE || process.env.OPENAI_MODEL || 'gpt-5.2',
    reasoningEffort: process.env.OPENAI_REASONING_EFFORT || 'medium',
  },
  unipile: {
    baseUrl: (process.env.UNIPILE_BASE_URL || 'https://api.unipile.com/api/v1').replace(/\/+$/, ''),
    apiKey: process.env.UNIPILE_API_KEY || '',
    linkedinAccountId: process.env.UNIPILE_LINKEDIN_ACCOUNT_ID || '',
    webhookSecret: process.env.UNIPILE_WEBHOOK_SECRET || '',
  },
  port: process.env.PORT || 5050,
  host: process.env.HOST || '0.0.0.0',
  syncInterval: parseInt(process.env.SYNC_INTERVAL || '5'),
  outreach: {
    senderAccountId: process.env.LINKEDIN_SENDER_ACCOUNT_ID || process.env.UNIPILE_LINKEDIN_ACCOUNT_ID || '',
    dailyConnectionLimit: parseInt(process.env.LINKEDIN_DAILY_CONNECTION_LIMIT || '25'),
    dailyMessageLimit: parseInt(process.env.LINKEDIN_DAILY_MESSAGE_LIMIT || '40'),
    autoSend: String(process.env.AI_ENABLE_AUTO_SEND || 'true').toLowerCase() === 'true',
    requireHumanApproval: String(process.env.AI_REQUIRE_HUMAN_APPROVAL || 'false').toLowerCase() === 'true',
    language: process.env.AI_DEFAULT_LANGUAGE || 'pt-BR',
  },
  security: {
    corsAllowedOrigins: process.env.CORS_ALLOWED_ORIGINS || '',
    apiBearerToken: process.env.APP_API_BEARER_TOKEN || '',
    basicAuthUser: process.env.APP_BASIC_AUTH_USER || '',
    basicAuthPassword: process.env.APP_BASIC_AUTH_PASSWORD || '',
    allowLegacyWebhookQuerySecret: String(process.env.UNIPILE_ALLOW_QUERY_SECRET || 'false').toLowerCase() === 'true',
    businessTimezone: process.env.BUSINESS_TIMEZONE || BUSINESS_TIMEZONE,
  },
};
const OPENAI_BASE = 'https://api.openai.com/v1/responses';
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const ENRICHMENT_HISTORY_FILE = path.join(DATA_DIR, 'enrichment-history.json');
const LINKEDIN_MEMORY_FILE = path.join(DATA_DIR, 'linkedin-memory.json');
const OUTREACH_STATE_FILE = path.join(DATA_DIR, 'outreach-state.json');
const PROJECT_LOG_FILES = [
  path.join(ROOT_DIR, 'server-run.log'),
  path.join(ROOT_DIR, 'server-start.log'),
  path.join(ROOT_DIR, 'server-run.err.log'),
  path.join(ROOT_DIR, 'server-start.err.log'),
];
const REUSABLE_ENRICHMENT_STATUSES = new Set(['processed', 'approved', 'seeded_from_logs']);
const apiAuthMiddleware = createApiAuthMiddleware({
  bearerToken: CONFIG.security.apiBearerToken,
  basicUser: CONFIG.security.basicAuthUser,
  basicPassword: CONFIG.security.basicAuthPassword,
});

app.use('/api', (req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  if (req.path === '/status' || req.path === '/unipile/webhook') return next();
  return apiAuthMiddleware(req, res, next);
});

// ═══ PIPEDRIVE CUSTOM FIELD KEYS ═══
const PD_DEAL_FIELDS = {
  cnpj: 'de557c560a8cefcd16781232f686eae7b49893e6',
  faturamento_anual: 'd74ce29ce49628400272d13678fb80d21bab3aa2',
  num_funcionarios: '7f0f029edef25c828f490cfe0b305da20d210e96',
  data_abertura: '5451f0464e89d56e78e2fec19cfbc91a7431c8ed',
  num_filiais: '6be3208b8bc0f7ccd611027ecf69e623244af28a',
  segmento: '8c5fb6debc0844200a296edc178bf20675e7ab45',
  cnae_primario: 'b29cd9a836035a2f6e1099649e5cdbe1294dcd7f',
  emails_empresa: '9a01cc0c603fe67cf2414af7db01c4b6923c7a92',
  telefones_empresa: '8aff4deed3092e7058e39fe9c2a33d13e3d807ce',
  facebook: 'a5ffa654e9a1268dbbeb174180986f52436df700',
  instagram: '91be7d95cf2f3aab6a72849e5a4251fc8af6ece1',
  linkedin: 'bb8c531c7f4094379473962ed730737df6d15b7c',
  site: 'b4954360817186fee09bbe05190d543ae27989cf',
  cidade: '9c87fb92410979fb03b2601ca9dc576093f4c94d',
  estado: 'fc4d84e887c50ca6b4edba2ffdd3df04d35cc12a',
  whatsapp: '85ee74d011e291a1a0ae2fc307740cbf4d7b90c5',
  nome_fantasia: '369a288d34e38c4d9715e92c0dfb7365a2eb7036',
};

const PD_PERSON_FIELDS = {
  cargo: '7290d643c67632bae717f6705f5318d146d2cc50',
  linkedin_url: '321ad966c353e5d941cfbd342b219511cee68a6c',
  cpf_cnpj: '4f899eedf25f48b0ac612dc3dfdf048b55a86b1c',
  informacoes: 'aaac1dad50c5fa6bc904d8fef58a07baa5c151dd',
};
const PD_BASE = `https://${CONFIG.pipedrive.domain}.pipedrive.com/api/v1`;

// ═══════════════════════════════════════════════════════════
// IN-MEMORY CACHE
// ═══════════════════════════════════════════════════════════
let cache = {
  deals: [],
  activities: [],
  stages: [],
  persons: {},
  organizations: {},
  lastSync: null,
  syncing: false,
  syncError: null,
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeCnpj(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 14 ? digits : '';
}

function buildCompanyHistoryKey({ cnpj, company, orgId, dealId }) {
  const normalizedCnpj = normalizeCnpj(cnpj);
  if (normalizedCnpj) return `cnpj:${normalizedCnpj}`;
  const normalizedCompany = normalizeText(company);
  if (normalizedCompany) return `company:${normalizedCompany}`;
  if (orgId) return `org:${orgId}`;
  return `deal:${dealId}`;
}

function loadEnrichmentHistory() {
  try {
    ensureDataDir();
    if (!fs.existsSync(ENRICHMENT_HISTORY_FILE)) {
      fs.writeFileSync(ENRICHMENT_HISTORY_FILE, JSON.stringify({ items: {} }, null, 2));
      return {};
    }
    const raw = fs.readFileSync(ENRICHMENT_HISTORY_FILE, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return parsed.items || {};
  } catch (err) {
    console.error('[HISTORY] Load error:', err.message);
    return {};
  }
}

function isReusableEnrichmentEntry(entry) {
  if (!entry) return false;
  if (!REUSABLE_ENRICHMENT_STATUSES.has(entry.status)) return false;
  if (entry.status === 'seeded_from_logs') return true;
  return !!(
    entry.lastApprovedAt ||
    entry.summary ||
    (Array.isArray(entry.fieldsUpdated) && entry.fieldsUpdated.length > 0) ||
    entry.score != null
  );
}

function extractEnrichmentSeedsFromLog(content, filePath) {
  const seeds = [];
  const patterns = [
    /Dossier IA -\s*([^<\r\n]+)/gi,
    /Enriquecimento IA -\s*([^<\r\n]+)/gi,
    /"companyName"\s*:\s*"([^"]+)"/gi,
    /"razao_social"\s*:\s*"([^"]+)"/gi,
    /"nome_fantasia"\s*:\s*"([^"]+)"/gi,
  ];

  for (const pattern of patterns) {
    let match = null;
    while ((match = pattern.exec(content))) {
      const companyName = String(match[1] || '').trim();
      if (!companyName || companyName.length < 4) continue;
      seeds.push({
        companyName,
        companyKey: buildCompanyHistoryKey({ company: companyName }),
        source: `log:${path.basename(filePath)}`,
      });
    }
  }

  return seeds;
}

let enrichmentHistory = loadEnrichmentHistory();

function backfillEnrichmentHistoryFromLogs() {
  let scannedFiles = 0;
  let seedsCreated = 0;

  for (const logFile of PROJECT_LOG_FILES) {
    if (!fs.existsSync(logFile)) continue;
    scannedFiles += 1;

    try {
      const content = fs.readFileSync(logFile, 'utf8');
      const seeds = extractEnrichmentSeedsFromLog(content, logFile);
      for (const seed of seeds) {
        if (enrichmentHistory[seed.companyKey]) continue;
        enrichmentHistory[seed.companyKey] = {
          companyKey: seed.companyKey,
          companyName: seed.companyName,
          cnpj: null,
          dealId: null,
          orgId: null,
          personId: null,
          status: 'seeded_from_logs',
          model: null,
          provider: 'log',
          lastAttemptAt: new Date(fs.statSync(logFile).mtime).toISOString(),
          lastApprovedAt: null,
          fieldsUpdated: [],
          summary: 'Backfill gerado a partir de log historico',
          score: null,
          source: seed.source,
        };
        seedsCreated += 1;
      }
    } catch (err) {
      console.error('[HISTORY] Log backfill error:', err.message);
    }
  }

  if (seedsCreated > 0) saveEnrichmentHistory();
  return { scannedFiles, seedsCreated };
}

const enrichmentLogBackfill = backfillEnrichmentHistoryFromLogs();

function saveEnrichmentHistory() {
  try {
    ensureDataDir();
    fs.writeFileSync(ENRICHMENT_HISTORY_FILE, JSON.stringify({ items: enrichmentHistory }, null, 2));
  } catch (err) {
    console.error('[HISTORY] Save error:', err.message);
  }
}

function loadLinkedinMemory() {
  try {
    ensureDataDir();
    if (!fs.existsSync(LINKEDIN_MEMORY_FILE)) {
      fs.writeFileSync(LINKEDIN_MEMORY_FILE, JSON.stringify({ items: {} }, null, 2));
      return {};
    }
    const raw = fs.readFileSync(LINKEDIN_MEMORY_FILE, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return parsed.items || {};
  } catch (err) {
    console.error('[UNIPILE] Memory load error:', err.message);
    return {};
  }
}

let linkedinMemory = loadLinkedinMemory();

function saveLinkedinMemory() {
  try {
    ensureDataDir();
    fs.writeFileSync(LINKEDIN_MEMORY_FILE, JSON.stringify({ items: linkedinMemory }, null, 2));
  } catch (err) {
    console.error('[UNIPILE] Memory save error:', err.message);
  }
}

function loadOutreachState() {
  try {
    ensureDataDir();
    if (!fs.existsSync(OUTREACH_STATE_FILE)) {
      fs.writeFileSync(OUTREACH_STATE_FILE, JSON.stringify({ items: {} }, null, 2));
      return {};
    }
    const raw = fs.readFileSync(OUTREACH_STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return parsed.items || {};
  } catch (err) {
    console.error('[OUTREACH] State load error:', err.message);
    return {};
  }
}

let outreachState = loadOutreachState();

function saveOutreachState() {
  try {
    ensureDataDir();
    fs.writeFileSync(OUTREACH_STATE_FILE, JSON.stringify({ items: outreachState }, null, 2));
  } catch (err) {
    console.error('[OUTREACH] State save error:', err.message);
  }
}

const OUTREACH_STATES = {
  NEW_LEAD: 'NEW_LEAD',
  PROFILE_ENRICHED: 'PROFILE_ENRICHED',
  QUALIFIED: 'QUALIFIED',
  DISQUALIFIED: 'DISQUALIFIED',
  CONNECTION_NOTE_PENDING: 'CONNECTION_NOTE_PENDING',
  CONNECTION_REQUEST_SENT: 'CONNECTION_REQUEST_SENT',
  CONNECTION_ACCEPTED: 'CONNECTION_ACCEPTED',
  FIRST_MESSAGE_PENDING: 'FIRST_MESSAGE_PENDING',
  FIRST_MESSAGE_SENT: 'FIRST_MESSAGE_SENT',
  AWAITING_REPLY: 'AWAITING_REPLY',
  LEAD_REPLIED: 'LEAD_REPLIED',
  FOLLOWUP_PENDING: 'FOLLOWUP_PENDING',
  MEETING_INTENT_DETECTED: 'MEETING_INTENT_DETECTED',
  HANDOFF_TO_HUMAN: 'HANDOFF_TO_HUMAN',
  DO_NOT_CONTACT: 'DO_NOT_CONTACT',
  CLOSED_NO_INTEREST: 'CLOSED_NO_INTEREST',
  MEETING_BOOKED: 'MEETING_BOOKED',
};

const OUTREACH_ALLOWED_TRANSITIONS = {
  [OUTREACH_STATES.NEW_LEAD]: [OUTREACH_STATES.PROFILE_ENRICHED, OUTREACH_STATES.QUALIFIED, OUTREACH_STATES.DISQUALIFIED, OUTREACH_STATES.DO_NOT_CONTACT],
  [OUTREACH_STATES.PROFILE_ENRICHED]: [OUTREACH_STATES.QUALIFIED, OUTREACH_STATES.DISQUALIFIED, OUTREACH_STATES.DO_NOT_CONTACT],
  [OUTREACH_STATES.QUALIFIED]: [OUTREACH_STATES.CONNECTION_NOTE_PENDING, OUTREACH_STATES.DO_NOT_CONTACT],
  [OUTREACH_STATES.CONNECTION_NOTE_PENDING]: [OUTREACH_STATES.CONNECTION_REQUEST_SENT, OUTREACH_STATES.DO_NOT_CONTACT],
  [OUTREACH_STATES.CONNECTION_REQUEST_SENT]: [OUTREACH_STATES.CONNECTION_ACCEPTED, OUTREACH_STATES.CLOSED_NO_INTEREST, OUTREACH_STATES.FOLLOWUP_PENDING],
  [OUTREACH_STATES.CONNECTION_ACCEPTED]: [OUTREACH_STATES.FIRST_MESSAGE_PENDING, OUTREACH_STATES.HANDOFF_TO_HUMAN],
  [OUTREACH_STATES.FIRST_MESSAGE_PENDING]: [OUTREACH_STATES.FIRST_MESSAGE_SENT, OUTREACH_STATES.HANDOFF_TO_HUMAN],
  [OUTREACH_STATES.FIRST_MESSAGE_SENT]: [OUTREACH_STATES.AWAITING_REPLY, OUTREACH_STATES.LEAD_REPLIED],
  [OUTREACH_STATES.AWAITING_REPLY]: [OUTREACH_STATES.LEAD_REPLIED, OUTREACH_STATES.FOLLOWUP_PENDING, OUTREACH_STATES.CLOSED_NO_INTEREST],
  [OUTREACH_STATES.LEAD_REPLIED]: [OUTREACH_STATES.MEETING_INTENT_DETECTED, OUTREACH_STATES.HANDOFF_TO_HUMAN, OUTREACH_STATES.FOLLOWUP_PENDING, OUTREACH_STATES.CLOSED_NO_INTEREST],
  [OUTREACH_STATES.FOLLOWUP_PENDING]: [OUTREACH_STATES.AWAITING_REPLY, OUTREACH_STATES.LEAD_REPLIED, OUTREACH_STATES.CLOSED_NO_INTEREST],
  [OUTREACH_STATES.MEETING_INTENT_DETECTED]: [OUTREACH_STATES.HANDOFF_TO_HUMAN, OUTREACH_STATES.MEETING_BOOKED],
  [OUTREACH_STATES.HANDOFF_TO_HUMAN]: [OUTREACH_STATES.MEETING_BOOKED, OUTREACH_STATES.CLOSED_NO_INTEREST],
};

function getOutreachRecord(deal) {
  return outreachState[`deal:${deal.id}`] || null;
}

function defaultOutreachStateForDeal(deal) {
  return {
    key: `deal:${deal.id}`,
    dealId: deal.id,
    orgId: deal.orgId || null,
    personId: deal.personId || null,
    company: deal.company || deal.title || '',
    contact: deal.contact || '',
    state: OUTREACH_STATES.NEW_LEAD,
    fitClassification: null,
    leadScore: null,
    personaType: null,
    decisionPower: null,
    reasons: [],
    risks: [],
    recommendedApproach: null,
    connectionNoteAngle: null,
    firstMessageAngle: null,
    ctaStrategy: null,
    tags: [],
    rationaleShort: null,
    classifierConfidence: null,
    selectedConnectionVariant: null,
    selectedMessageVariant: null,
    followupDays: null,
    escalateToHuman: false,
    logs: [],
    messageHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function transitionOutreachState(deal, nextState, meta = {}) {
  const key = `deal:${deal.id}`;
  const current = outreachState[key] || defaultOutreachStateForDeal(deal);
  const allowed = OUTREACH_ALLOWED_TRANSITIONS[current.state] || [];
  const isSame = current.state === nextState;
  if (!isSame && current.state && allowed.length && !allowed.includes(nextState)) {
    current.logs.push({
      at: new Date().toISOString(),
      type: 'transition_rejected',
      from: current.state,
      to: nextState,
      reason: meta.reason || 'transition_not_allowed',
    });
    current.updatedAt = new Date().toISOString();
    outreachState[key] = current;
    saveOutreachState();
    return current;
  }

  const updated = {
    ...current,
    ...meta.patch,
    key,
    dealId: deal.id,
    orgId: deal.orgId || current.orgId || null,
    personId: deal.personId || current.personId || null,
    company: deal.company || deal.title || current.company || '',
    contact: deal.contact || current.contact || '',
    state: nextState,
    updatedAt: new Date().toISOString(),
  };

  updated.logs = [
    ...(current.logs || []),
    {
      at: new Date().toISOString(),
      type: 'transition',
      from: current.state,
      to: nextState,
      promptType: meta.promptType || null,
      rationale: meta.rationale || null,
      output: meta.output || null,
    },
  ].slice(-120);

  outreachState[key] = updated;
  saveOutreachState();
  return updated;
}

function appendOutreachMessage(deal, message) {
  const key = `deal:${deal.id}`;
  const current = outreachState[key] || defaultOutreachStateForDeal(deal);
  current.messageHistory = [...(current.messageHistory || []), { ...message, at: new Date().toISOString() }].slice(-50);
  current.updatedAt = new Date().toISOString();
  outreachState[key] = current;
  saveOutreachState();
  return current;
}

function countOutreachTransitionsToday(targetState, now = new Date()) {
  const today = getBusinessDateString(now);
  return Object.values(outreachState).reduce((total, record) => {
    const hits = (record?.logs || []).filter(log => log?.type === 'transition' && log?.to === targetState && String(log?.at || '').startsWith(today)).length;
    return total + hits;
  }, 0);
}

function canExecuteOutreachSend(action) {
  if (action === 'connection_note') {
    const used = countOutreachTransitionsToday(OUTREACH_STATES.CONNECTION_REQUEST_SENT);
    return { allowed: used < CONFIG.outreach.dailyConnectionLimit, used, limit: CONFIG.outreach.dailyConnectionLimit };
  }
  const used = countOutreachTransitionsToday(OUTREACH_STATES.FIRST_MESSAGE_SENT);
  return { allowed: used < CONFIG.outreach.dailyMessageLimit, used, limit: CONFIG.outreach.dailyMessageLimit };
}

async function createPipedriveOutreachActivity(deal, { subject, note, dueDate, type = 'task' }) {
  if (!deal?.id) return null;
  try {
    const result = await pdPost('/activities', {
      subject,
      type,
      deal_id: deal.id,
      person_id: deal.personId || undefined,
      org_id: deal.orgId || undefined,
      due_date: dueDate,
      note: note || undefined,
    });
    return result?.data || null;
  } catch (err) {
    console.error('[OUTREACH] Activity create error:', err.message);
    return null;
  }
}

async function updatePipedriveActivity(activityId, fields = {}) {
  if (!activityId) return null;
  try {
    const result = await pdPut(`/activities/${activityId}`, fields);
    if (result?.success && result?.data) {
      const idx = cache.activities.findIndex(item => item.id === Number(activityId));
      if (idx !== -1) cache.activities[idx] = { ...cache.activities[idx], ...result.data };
      return result.data;
    }
    return null;
  } catch (err) {
    console.error('[OUTREACH] Activity update error:', err.message);
    return null;
  }
}

function getOutreachQueueItems(now = new Date()) {
  const today = getBusinessDateString(now);
  return Object.values(outreachState)
    .filter(record => record?.dealId)
    .map(record => ({
      ...record,
      queueScore: scoreOutreachQueue(record, now),
      dueNow: !!record.followupDueDate && isDateOnOrBefore(record.followupDueDate, today),
    }))
    .sort((a, b) => b.queueScore - a.queueScore);
}

function buildLinkedinMemoryKey({ company, personName, orgId, dealId }) {
  const person = normalizeText(personName);
  const comp = normalizeText(company);
  if (person && comp) return `person:${person}|company:${comp}`;
  if (person) return `person:${person}`;
  if (comp) return `company:${comp}`;
  if (orgId) return `org:${orgId}`;
  return `deal:${dealId}`;
}

function getLinkedinMemoryForDeal(deal, overrides = {}) {
  const company = overrides.company || deal.company || deal.title;
  const personName = overrides.personName || deal.contact;
  const keys = [
    buildLinkedinMemoryKey({ company, personName, orgId: deal.orgId, dealId: deal.id }),
    personName ? buildLinkedinMemoryKey({ personName, orgId: deal.orgId, dealId: deal.id }) : null,
    company ? buildLinkedinMemoryKey({ company, orgId: deal.orgId, dealId: deal.id }) : null,
    deal.orgId ? `org:${deal.orgId}` : null,
    `deal:${deal.id}`,
  ].filter(Boolean);

  for (const key of keys) {
    if (linkedinMemory[key]) return { key, entry: linkedinMemory[key] };
  }
  return { key: keys[0], entry: null };
}

function hasAcceptedLinkedinConnection(deal, linkedinEntry = null, outreachRecord = null) {
  const linkedin = linkedinEntry || getLinkedinMemoryForDeal(deal)?.entry || null;
  const outreach = outreachRecord || getOutreachRecord(deal);
  const connectionStates = new Set([
    OUTREACH_STATES.CONNECTION_ACCEPTED,
    OUTREACH_STATES.FIRST_MESSAGE_PENDING,
    OUTREACH_STATES.FIRST_MESSAGE_SENT,
    OUTREACH_STATES.AWAITING_REPLY,
    OUTREACH_STATES.LEAD_REPLIED,
    OUTREACH_STATES.FOLLOWUP_PENDING,
    OUTREACH_STATES.MEETING_INTENT_DETECTED,
    OUTREACH_STATES.HANDOFF_TO_HUMAN,
    OUTREACH_STATES.MEETING_BOOKED,
  ]);
  return ['connected', 'messaged'].includes(linkedin?.status) || connectionStates.has(outreach?.state);
}

function upsertLinkedinMemory(deal, payload = {}) {
  const company = payload.company || deal.company || deal.title || '';
  const personName = payload.personName || deal.contact || '';
  const key = buildLinkedinMemoryKey({ company, personName, orgId: deal.orgId, dealId: deal.id });
  const previous = linkedinMemory[key] || {};
  const record = {
    key,
    dealId: deal.id,
    orgId: deal.orgId || null,
    personId: deal.personId || null,
    company,
    personName,
    linkedinUrl: payload.linkedinUrl || previous.linkedinUrl || null,
    companyLinkedinUrl: payload.companyLinkedinUrl || previous.companyLinkedinUrl || null,
    providerId: payload.providerId || previous.providerId || null,
    companyProviderId: payload.companyProviderId || previous.companyProviderId || null,
    occupation: payload.occupation || previous.occupation || null,
    profileHeadline: payload.profileHeadline || previous.profileHeadline || null,
    status: payload.status || previous.status || 'identified',
    source: payload.source || previous.source || 'unipile',
    lastSeenAt: new Date().toISOString(),
    invitationSentAt: payload.invitationSent ? new Date().toISOString() : previous.invitationSentAt || null,
    messageSentAt: payload.messageSent ? new Date().toISOString() : previous.messageSentAt || null,
    lastInviteMessage: payload.inviteMessage || previous.lastInviteMessage || null,
    lastDmMessage: payload.dmMessage || previous.lastDmMessage || null,
  };

  linkedinMemory[key] = { ...previous, ...record };
  if (deal.orgId) linkedinMemory[`org:${deal.orgId}`] = linkedinMemory[key];
  linkedinMemory[`deal:${deal.id}`] = linkedinMemory[key];
  saveLinkedinMemory();
  return linkedinMemory[key];
}

function getHistoryEntryForDeal(deal) {
  const keys = [
    buildCompanyHistoryKey({ cnpj: deal.cnpj, company: deal.company || deal.title, orgId: deal.orgId, dealId: deal.id }),
    deal.orgId ? `org:${deal.orgId}` : null,
    `deal:${deal.id}`,
  ].filter(Boolean);

  for (const key of keys) {
    if (enrichmentHistory[key]) return { key, entry: enrichmentHistory[key] };
  }
  return { key: keys[0], entry: null };
}

function upsertEnrichmentHistory(deal, payload = {}) {
  const companyKey = buildCompanyHistoryKey({
    cnpj: payload.cnpj || deal.cnpj,
    company: payload.companyName || deal.company || deal.title,
    orgId: deal.orgId,
    dealId: deal.id,
  });

  const record = {
    companyKey,
    companyName: payload.companyName || deal.company || deal.title || 'Empresa sem nome',
    cnpj: normalizeCnpj(payload.cnpj || deal.cnpj) || null,
    dealId: deal.id,
    orgId: deal.orgId || null,
    personId: deal.personId || null,
    status: payload.status || 'processed',
    model: CONFIG.openai.model,
    provider: 'openai',
    lastAttemptAt: new Date().toISOString(),
    lastApprovedAt: payload.status === 'approved' ? new Date().toISOString() : null,
    fieldsUpdated: payload.fieldsUpdated || [],
    summary: payload.summary || null,
    score: payload.score ?? null,
    source: payload.source || 'enrichment',
  };

  const previous = enrichmentHistory[companyKey] || {};
  const merged = {
    ...previous,
    ...record,
    lastApprovedAt: payload.status === 'approved'
      ? new Date().toISOString()
      : previous.lastApprovedAt || record.lastApprovedAt,
  };

  enrichmentHistory[companyKey] = merged;
  if (deal.orgId) enrichmentHistory[`org:${deal.orgId}`] = merged;
  enrichmentHistory[`deal:${deal.id}`] = merged;
  saveEnrichmentHistory();
  return merged;
}

// ═══════════════════════════════════════════════════════════
// PIPEDRIVE API HELPERS
// ═══════════════════════════════════════════════════════════
async function pdGet(endpoint, params = {}) {
  const url = new URL(`${PD_BASE}${endpoint}`);
  url.searchParams.set('api_token', CONFIG.pipedrive.token);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  try {
    const res = await fetch(url.toString());
    const data = await res.json();
    if (!data.success) {
      console.error(`[PD] Error on ${endpoint}:`, data.error || 'Unknown');
      return { data: null, additional_data: null };
    }
    return data;
  } catch (err) {
    console.error(`[PD] Fetch error on ${endpoint}:`, err.message);
    return { data: null, additional_data: null };
  }
}

async function pdPost(endpoint, body) {
  const url = `${PD_BASE}${endpoint}?api_token=${CONFIG.pipedrive.token}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch (err) {
    console.error(`[PD] POST error on ${endpoint}:`, err.message);
    return { success: false };
  }
}

async function pdPut(endpoint, body) {
  const url = `${PD_BASE}${endpoint}?api_token=${CONFIG.pipedrive.token}`;
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch (err) {
    console.error(`[PD] PUT error on ${endpoint}:`, err.message);
    return { success: false };
  }
}

async function pdDelete(endpoint) {
  const url = `${PD_BASE}${endpoint}?api_token=${CONFIG.pipedrive.token}`;
  try {
    const res = await fetch(url, { method: 'DELETE' });
    return await res.json();
  } catch (err) {
    console.error(`[PD] DELETE error on ${endpoint}:`, err.message);
    return { success: false };
  }
}

async function pdGetAll(endpoint, params = {}) {
  let allData = [];
  let start = 0;
  const limit = 500;

  while (true) {
    const result = await pdGet(endpoint, { ...params, start: String(start), limit: String(limit) });
    if (!result.data) break;

    allData = allData.concat(Array.isArray(result.data) ? result.data : [result.data]);

    if (result.additional_data?.pagination?.more_items_in_collection) {
      start = result.additional_data.pagination.next_start;
    } else {
      break;
    }
  }
  return allData;
}

function isUnipileConfigured() {
  return !!CONFIG.unipile.apiKey;
}

function getUnipileAccountId(explicitAccountId) {
  return explicitAccountId || CONFIG.unipile.linkedinAccountId || '';
}

function buildMultipartBody(fields = {}) {
  const boundary = `----LAWHub${Date.now().toString(16)}`;
  const parts = [];

  const appendField = (name, value) => {
    if (value == null || value === '') return;
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
  };

  for (const [key, rawValue] of Object.entries(fields)) {
    if (Array.isArray(rawValue)) {
      rawValue.forEach(value => appendField(key, value));
    } else if (typeof rawValue === 'object') {
      appendField(key, JSON.stringify(rawValue));
    } else {
      appendField(key, rawValue);
    }
  }

  parts.push(`--${boundary}--\r\n`);
  return {
    body: parts.join(''),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function unipileRequest(method, endpoint, { query = {}, body, headers = {}, multipart = false } = {}) {
  if (!isUnipileConfigured()) throw new Error('UNIPILE_API_KEY nao configurada');

  const url = new URL(`${CONFIG.unipile.baseUrl}${endpoint}`);
  Object.entries(query).forEach(([key, value]) => {
    if (value != null && value !== '') url.searchParams.set(key, String(value));
  });

  const requestHeaders = {
    Accept: 'application/json',
    'X-API-KEY': CONFIG.unipile.apiKey,
    ...headers,
  };

  const options = { method, headers: requestHeaders };
  if (body != null) {
    if (multipart) {
      const form = buildMultipartBody(body);
      options.body = form.body;
      options.headers['Content-Type'] = form.contentType;
    } else {
      options.body = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
    }
  }

  const res = await fetch(url.toString(), options);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const message = data?.message || data?.error || (typeof data === 'string' ? data : 'Unipile API error');
    throw new Error(message);
  }

  return data;
}

async function unipileListAccounts() {
  return await unipileRequest('GET', '/accounts');
}

async function unipileSearchLinkedinUsers({ accountId, query, limit = 5 }) {
  const resolvedAccountId = getUnipileAccountId(accountId);
  if (!resolvedAccountId) throw new Error('UNIPILE_LINKEDIN_ACCOUNT_ID nao configurado');
  return await unipileRequest('GET', '/users/search', {
    query: {
      account_id: resolvedAccountId,
      query,
      limit,
    },
  });
}

async function unipileGetCompanyProfile({ accountId, identifier }) {
  const resolvedAccountId = getUnipileAccountId(accountId);
  if (!resolvedAccountId) throw new Error('UNIPILE_LINKEDIN_ACCOUNT_ID nao configurado');
  return await unipileRequest('GET', `/companies/${encodeURIComponent(identifier)}`, {
    query: { account_id: resolvedAccountId },
  });
}

function normalizeUnipileUser(user = {}) {
  return {
    providerId: user.provider_id || user.id || user.profile_id || null,
    publicIdentifier: user.public_identifier || user.username || null,
    fullName: user.name || [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || null,
    occupation: user.occupation || user.headline || null,
    company: user.company || user.company_name || null,
    linkedinUrl: user.profile_url || user.linkedin_url || user.public_profile_url || null,
    connectionStatus: user.connection_status || user.relationship_status || null,
    raw: user,
  };
}

function scoreLinkedinCandidate(candidate, { company = '', personName = '', titleHint = '' } = {}) {
  const companyNorm = normalizeText(company);
  const nameNorm = normalizeText(personName);
  const titleNorm = normalizeText(titleHint);
  const candName = normalizeText(candidate.fullName);
  const candCompany = normalizeText(candidate.company);
  const candOcc = normalizeText(candidate.occupation);
  let score = 0;

  if (nameNorm && candName.includes(nameNorm)) score += 35;
  if (companyNorm && candCompany.includes(companyNorm)) score += 30;
  if (titleNorm && candOcc.includes(titleNorm)) score += 18;
  if (/(cfo|diretor financeiro|gerente financeiro|controller|finance|tesour|fp&a|administrativo financeiro|head of finance)/.test(candOcc)) score += 28;
  if (candidate.linkedinUrl) score += 8;
  if (candidate.providerId) score += 8;
  return score;
}

async function resolveLinkedinProspect(deal, options = {}) {
  const existing = getLinkedinMemoryForDeal(deal, options);
  if (existing.entry?.providerId || existing.entry?.linkedinUrl) return existing.entry;

  if (!isUnipileConfigured()) return null;

  const company = options.company || deal.company || deal.title || '';
  const personName = options.personName || deal.contact || '';
  const query = [personName, options.titleHint || '', company].filter(Boolean).join(' ').trim();
  if (!query) return null;

  const response = await unipileSearchLinkedinUsers({
    accountId: options.accountId,
    query,
    limit: options.limit || 5,
  });

  const candidates = Array.isArray(response?.items)
    ? response.items
    : Array.isArray(response?.data)
      ? response.data
      : Array.isArray(response)
        ? response
        : [];

  const normalizedCandidates = candidates.map(normalizeUnipileUser);
  const best = normalizedCandidates
    .map(item => ({ ...item, _score: scoreLinkedinCandidate(item, { company, personName, titleHint: options.titleHint || '' }) }))
    .sort((a, b) => b._score - a._score)[0] || null;
  if (!best) return null;

  return upsertLinkedinMemory(deal, {
    company,
    personName: best.fullName || personName,
    linkedinUrl: best.linkedinUrl,
    providerId: best.providerId,
    occupation: best.occupation,
    profileHeadline: best.occupation,
    status: 'identified',
    source: 'unipile_search',
  });
}

async function unipileInviteLinkedinProspect({ accountId, providerId, note }) {
  const resolvedAccountId = getUnipileAccountId(accountId);
  if (!resolvedAccountId) throw new Error('UNIPILE_LINKEDIN_ACCOUNT_ID nao configurado');
  if (!providerId) throw new Error('provider_id do LinkedIn nao informado');
  return await unipileRequest('POST', '/users/invite', {
    body: {
      account_id: resolvedAccountId,
      provider_id: providerId,
      message: note || undefined,
    },
  });
}

async function unipileSendLinkedinMessage({ accountId, providerId, message }) {
  const resolvedAccountId = getUnipileAccountId(accountId);
  if (!resolvedAccountId) throw new Error('UNIPILE_LINKEDIN_ACCOUNT_ID nao configurado');
  if (!providerId) throw new Error('provider_id do LinkedIn nao informado');
  return await unipileRequest('POST', '/chats', {
    multipart: true,
    body: {
      account_id: resolvedAccountId,
      text: message,
      attendees_provider_id: providerId,
    },
  });
}

// ═══════════════════════════════════════════════════════════
// DATA SYNC
// ═══════════════════════════════════════════════════════════
async function syncAll() {
  if (cache.syncing) return;
  if (!CONFIG.pipedrive.token) {
    console.log('[SYNC] No Pipedrive token configured. Skipping sync.');
    cache.syncError = 'No token configured';
    return;
  }

  cache.syncing = true;
  cache.syncError = null;
  console.log(`[SYNC] Starting full sync at ${new Date().toISOString()}`);

  try {
    const stagesRes = await pdGet(`/stages`, { pipeline_id: CONFIG.pipedrive.pipelineId });
    if (stagesRes.data) {
      cache.stages = stagesRes.data.sort((a, b) => a.order_nr - b.order_nr);
      console.log(`[SYNC] ${cache.stages.length} stages loaded`);
    }

    const deals = await pdGetAll('/deals', {
      pipeline_id: CONFIG.pipedrive.pipelineId,
      everyone: '1',
      status: 'open',
    });
    cache.deals = deals;
    console.log(`[SYNC] ${deals.length} deals loaded`);

    const activities = await pdGetAll('/activities', {
      everyone: '1',
      done: '0',
    });
    cache.activities = activities;
    console.log(`[SYNC] ${activities.length} activities loaded`);

    const personIds = [...new Set(deals.filter(d => d.person_id).map(d =>
      typeof d.person_id === 'object' ? d.person_id.value : d.person_id
    ))];
    const orgIds = [...new Set(deals.filter(d => d.org_id).map(d =>
      typeof d.org_id === 'object' ? d.org_id.value : d.org_id
    ))];

    for (let i = 0; i < personIds.length; i += 100) {
      const batch = personIds.slice(i, i + 100);
      const personsRes = await pdGet('/persons', { ids: batch.join(',') });
      if (personsRes.data) {
        personsRes.data.forEach(p => { cache.persons[p.id] = p; });
      }
    }
    console.log(`[SYNC] ${Object.keys(cache.persons).length} persons cached`);

    for (let i = 0; i < orgIds.length; i += 100) {
      const batch = orgIds.slice(i, i + 100);
      const orgsRes = await pdGet('/organizations', { ids: batch.join(',') });
      if (orgsRes.data) {
        orgsRes.data.forEach(o => { cache.organizations[o.id] = o; });
      }
    }
    console.log(`[SYNC] ${Object.keys(cache.organizations).length} organizations cached`);

    cache.lastSync = new Date().toISOString();
    console.log(`[SYNC] Complete at ${cache.lastSync}`);
  } catch (err) {
    console.error('[SYNC] Error:', err.message);
    cache.syncError = err.message;
  } finally {
    cache.syncing = false;
  }
}

// ═══════════════════════════════════════════════════════════
// ENRICHMENT HELPERS
// ═══════════════════════════════════════════════════════════
function enrichDeal(deal) {
  const personId = typeof deal.person_id === 'object' ? deal.person_id?.value : deal.person_id;
  const orgId = typeof deal.org_id === 'object' ? deal.org_id?.value : deal.org_id;
  const person = cache.persons[personId] || null;
  const org = cache.organizations[orgId] || null;
  const stage = cache.stages.find(s => s.id === deal.stage_id);

  const contactName = person
    ? person.name
    : (typeof deal.person_id === 'object' ? deal.person_id?.name || '' : '');

  const emails = person?.email?.filter(e => e.value) || [];
  const phones = person?.phone?.filter(p => p.value) || [];
  const orgName = org?.name || (typeof deal.org_id === 'object' ? deal.org_id?.name || '' : '') || deal.org_name || '';

  const dealActivities = cache.activities.filter(a => a.deal_id === deal.id);
  const pendingActivities = dealActivities.filter(a => !a.done);
  const today = getBusinessDateString();
  const overdueActivities = dealActivities.filter(a => !a.done && a.due_date && isDateBefore(a.due_date, today));

  const stageChangeTime = deal.stage_change_time || deal.add_time;
  const daysInStage = stageChangeTime ? Math.floor((Date.now() - new Date(stageChangeTime)) / 86400000) : 0;
  const lastActivityDate = deal.last_activity_date;
  const daysSinceActivity = lastActivityDate ? Math.floor((Date.now() - new Date(lastActivityDate)) / 86400000) : 999;

  return {
    id: deal.id,
    title: deal.title || orgName || 'Sem titulo',
    company: orgName,
    orgId,
    personId,
    contact: contactName,
    email: emails[0]?.value || '',
    emails: emails.map(e => e.value),
    phone: phones[0]?.value || '',
    phones: phones.map(p => p.value),
    stageId: deal.stage_id,
    stageName: stage?.name || 'Desconhecido',
    stageOrder: stage?.order_nr || 0,
    pipelineId: deal.pipeline_id,
    value: deal.value || 0,
    currency: deal.currency || 'BRL',
    status: deal.status,
    addTime: deal.add_time,
    updateTime: deal.update_time,
    wonTime: deal.won_time,
    lostTime: deal.lost_time,
    ownerId: deal.user_id?.id || deal.user_id,
    ownerName: deal.user_id?.name || '',
    daysInStage,
    daysSinceActivity,
    activities: {
      total: dealActivities.length,
      pending: pendingActivities.length,
      overdue: overdueActivities.length,
      next: pendingActivities.sort((a, b) =>
        compareDateOnly(a.due_date || '9999-12-31', b.due_date || '9999-12-31')
      )[0] || null,
    },
    labels: deal.label || [],
    notes_count: deal.notes_count || 0,
    raw: deal,
  };
}

function buildOutreachSnapshot(deal, extras = {}) {
  const org = cache.organizations[deal.orgId] || {};
  const person = cache.persons[deal.personId] || {};
  const enrichment = getHistoryEntryForDeal(deal)?.entry || null;
  const linkedin = getLinkedinMemoryForDeal(deal)?.entry || null;
  const outreach = getOutreachRecord(deal);

  return {
    lead_full_name: extras.contact || deal.contact || person.name || null,
    headline: extras.headline || linkedin?.profileHeadline || linkedin?.occupation || null,
    current_role: extras.current_role || person[PD_PERSON_FIELDS.cargo] || linkedin?.occupation || null,
    company_name: extras.company || deal.company || deal.title || null,
    company_industry: extras.company_industry || enrichment?.segmento || null,
    company_description: extras.company_description || org.visible_to || null,
    company_size: extras.company_size || enrichment?.num_funcionarios || null,
    about_section: extras.about_section || null,
    recent_posts: extras.recent_posts || [],
    mutual_context: extras.mutual_context || null,
    website: extras.website || enrichment?.site || null,
    crm_enrichment_notes: extras.crm_enrichment_notes || enrichment?.summary || null,
    internal_tags: extras.internal_tags || deal.labels || [],
    previous_interaction_history: outreach?.messageHistory || [],
    accepted_connection: extras.accepted_connection ?? (outreach?.state === OUTREACH_STATES.CONNECTION_ACCEPTED || outreach?.state === OUTREACH_STATES.FIRST_MESSAGE_PENDING || outreach?.state === OUTREACH_STATES.FIRST_MESSAGE_SENT || outreach?.state === OUTREACH_STATES.AWAITING_REPLY || outreach?.state === OUTREACH_STATES.LEAD_REPLIED),
    message_history: outreach?.messageHistory || [],
    company_phone: deal.phone || null,
    company_email: deal.email || null,
    linkedin_url: linkedin?.linkedinUrl || null,
    fit_history: outreach ? {
      state: outreach.state,
      fit_classification: outreach.fitClassification,
      lead_score: outreach.leadScore,
      rationale_short: outreach.rationaleShort,
    } : null,
  };
}

function normalizeConnectionVariants(raw) {
  if (Array.isArray(raw)) {
    return raw.map(item => ({ label: item.label || 'Variante', text: item.text || '' })).filter(item => item.text);
  }
  if (!raw || typeof raw !== 'object') return [];
  return [
    { label: 'Conservador', text: raw.variant_conservative || '' },
    { label: 'Consultivo', text: raw.variant_consultative || '' },
    { label: 'Direto', text: raw.variant_direct || '' },
  ].filter(item => item.text);
}

function normalizeFirstMessageVariants(raw) {
  if (Array.isArray(raw)) {
    return raw.map(item => ({ label: item.label || 'Variante', text: item.text || '' })).filter(item => item.text);
  }
  if (!raw || typeof raw !== 'object') return [];
  return [
    { label: 'Soft', text: raw.variant_soft || '' },
    { label: 'Balanced', text: raw.variant_balanced || '' },
    { label: 'Direct', text: raw.variant_direct || '' },
  ].filter(item => item.text);
}

// ═══════════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════════

// --- Status ---
app.get('/api/status', (req, res) => {
  res.json({
    ok: true,
    pipedrive: !!CONFIG.pipedrive.token && CONFIG.pipedrive.token.length > 5,
    openai: !!CONFIG.openai.key,
    unipile: {
      configured: isUnipileConfigured(),
      base_url: CONFIG.unipile.baseUrl,
      linkedin_account_id: CONFIG.unipile.linkedinAccountId || null,
      memory_items: Object.keys(linkedinMemory).length,
    },
    ai: {
      provider: 'openai',
      connected: !!CONFIG.openai.key,
      model: CONFIG.openai.model,
      classifier_model: CONFIG.openai.classifierModel,
      message_model: CONFIG.openai.messageModel,
      reasoning_effort: CONFIG.openai.reasoningEffort,
    },
    outreach: {
      auto_send: CONFIG.outreach.autoSend,
      require_human_approval: CONFIG.outreach.requireHumanApproval,
      daily_connection_limit: CONFIG.outreach.dailyConnectionLimit,
      daily_message_limit: CONFIG.outreach.dailyMessageLimit,
      sender_account_id: CONFIG.outreach.senderAccountId || null,
      records: Object.keys(outreachState).filter(key => key.startsWith('deal:')).length,
      queue: {
        handoff: getOutreachQueueItems().filter(item => item.state === OUTREACH_STATES.HANDOFF_TO_HUMAN).length,
        meeting_intent: getOutreachQueueItems().filter(item => item.state === OUTREACH_STATES.MEETING_INTENT_DETECTED).length,
        followup_due: getOutreachQueueItems().filter(item => item.followupDueDate && isDateOnOrBefore(item.followupDueDate, getBusinessDateString())).length,
      },
    },
    security: {
      authentication_enabled: !!(CONFIG.security.apiBearerToken || (CONFIG.security.basicAuthUser && CONFIG.security.basicAuthPassword)),
      cors_restricted: !!CONFIG.security.corsAllowedOrigins,
      timezone: CONFIG.security.businessTimezone,
    },
    lastSync: cache.lastSync,
    syncing: cache.syncing,
    syncError: cache.syncError,
    counts: {
      deals: cache.deals.length,
      activities: cache.activities.length,
      stages: cache.stages.length,
      persons: Object.keys(cache.persons).length,
      organizations: Object.keys(cache.organizations).length,
      enrichedCompanies: Object.values(enrichmentHistory).filter((entry, index, arr) =>
        entry?.companyKey && arr.findIndex(item => item?.companyKey === entry.companyKey) === index
      ).length,
    },
    enrichment: {
      reusable_records: Object.values(enrichmentHistory).filter((entry, index, arr) =>
        entry?.companyKey &&
        arr.findIndex(item => item?.companyKey === entry.companyKey) === index &&
        isReusableEnrichmentEntry(entry)
      ).length,
      log_backfill: enrichmentLogBackfill,
    },
  });
});

// --- Force sync ---
app.post('/api/sync', async (req, res) => {
  await syncAll();
  res.json({ ok: true, lastSync: cache.lastSync, error: cache.syncError });
});

// --- Stages ---
app.get('/api/stages', (req, res) => {
  res.json(cache.stages);
});

// --- Deals (enriched) ---
app.get('/api/deals', (req, res) => {
  const { stage_id, search, sort_by, sort_dir, limit, offset } = req.query;

  let deals;
  try { deals = cache.deals.map(enrichDeal); } catch (e) { console.error('[DEALS] enrichDeal error:', e.message); deals = []; }

  if (stage_id) deals = deals.filter(d => d.stageId === parseInt(stage_id));
  if (search) {
    const q = search.toLowerCase();
    deals = deals.filter(d =>
      d.company.toLowerCase().includes(q) ||
      d.contact.toLowerCase().includes(q) ||
      d.title.toLowerCase().includes(q) ||
      d.email.toLowerCase().includes(q) ||
      d.phone.includes(q)
    );
  }

  const sortField = sort_by || 'updateTime';
  const dir = sort_dir === 'asc' ? 1 : -1;
  deals.sort((a, b) => {
    const av = a[sortField] || '';
    const bv = b[sortField] || '';
    if (typeof av === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });

  const total = deals.length;
  const off = parseInt(offset) || 0;
  const lim = parseInt(limit) || 500;
  deals = deals.slice(off, off + lim);

  res.json({ deals, total, offset: off, limit: lim });
});

// --- Single Deal ---
app.get('/api/deals/:id', async (req, res) => {
  const deal = cache.deals.find(d => d.id === parseInt(req.params.id));
  if (!deal) return res.status(404).json({ error: 'Deal not found' });

  const notesRes = await pdGet(`/deals/${deal.id}/flow`, { items_per_page: '20' });
  const enriched = enrichDeal(deal);
  enriched.flow = notesRes.data || [];

  res.json(enriched);
});

// --- Deal Notes ---
app.get('/api/deals/:id/notes', async (req, res) => {
  try {
    const notesRes = await pdGetAll(`/deals/${req.params.id}/notes`);
    res.json({ notes: notesRes || [] });
  } catch (err) {
    console.error('[NOTES] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- Deal Activities ---
app.get('/api/deals/:id/activities', (req, res) => {
  const dealId = parseInt(req.params.id);
  const acts = cache.activities
    .filter(a => a.deal_id === dealId)
    .sort((a, b) => compareDateOnly(a.due_date || '9999-12-31', b.due_date || '9999-12-31'));
  res.json(acts);
});

// --- All Activities ---
app.get('/api/activities', (req, res) => {
  const { filter, date, user_id } = req.query;
  let acts = [...cache.activities];

  if (user_id) acts = acts.filter(a => a.user_id === parseInt(user_id));
  if (date === 'today') {
    const today = getBusinessDateString();
    acts = acts.filter(a => a.due_date === today);
  } else if (date === 'overdue') {
    const today = getBusinessDateString();
    acts = acts.filter(a => a.due_date && isDateBefore(a.due_date, today) && !a.done);
  }

  if (filter) {
    acts = acts.filter(a => a.type === filter);
  }

  acts.sort((a, b) => compareDateOnly(a.due_date || '9999-12-31', b.due_date || '9999-12-31'));
  res.json({ activities: acts, total: acts.length });
});

// --- Complete Activity ---
app.put('/api/activities/:id/complete', async (req, res) => {
  const result = await pdPut(`/activities/${req.params.id}`, { done: 1 });
  if (result.success) {
    const idx = cache.activities.findIndex(a => a.id === parseInt(req.params.id));
    if (idx !== -1) cache.activities.splice(idx, 1);
  }
  res.json(result);
});

// --- Move Deal to Stage ---
app.put('/api/deals/:id/stage', async (req, res) => {
  const { stage_id } = req.body;
  const result = await pdPut(`/deals/${req.params.id}`, { stage_id });
  if (result.success) {
    const idx = cache.deals.findIndex(d => d.id === parseInt(req.params.id));
    if (idx !== -1) cache.deals[idx].stage_id = stage_id;
  }
  res.json(result);
});

// --- Update Deal (generic) ---
app.put('/api/deals/:id', async (req, res) => {
  try {
    const result = await pdPut(`/deals/${req.params.id}`, req.body);
    if (result.success && result.data) {
      const idx = cache.deals.findIndex(d => d.id === parseInt(req.params.id));
      if (idx !== -1) cache.deals[idx] = { ...cache.deals[idx], ...result.data };
    }
    res.json(result);
  } catch (err) {
    console.error('[DEAL UPDATE] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Mark deal won/lost ---
app.put('/api/deals/:id/status', async (req, res) => {
  const { status, lost_reason } = req.body;
  const body = { status };
  if (lost_reason) body.lost_reason = lost_reason;
  const result = await pdPut(`/deals/${req.params.id}`, body);
  if (result.success) {
    const idx = cache.deals.findIndex(d => d.id === parseInt(req.params.id));
    if (idx !== -1) {
      if (status === 'won' || status === 'lost') {
        cache.deals.splice(idx, 1);
      }
    }
  }
  res.json(result);
});

// --- Mark deal lost (shortcut) ---
app.put('/api/deals/:id/lost', async (req, res) => {
  const { lost_reason } = req.body || {};
  const result = await pdPut(`/deals/${req.params.id}`, { status: 'lost', lost_reason: lost_reason || '' });
  if (result.success) {
    const idx = cache.deals.findIndex(d => d.id === parseInt(req.params.id));
    if (idx !== -1) cache.deals.splice(idx, 1);
  }
  res.json(result);
});

// --- Mark deal won (shortcut) ---
app.put('/api/deals/:id/won', async (req, res) => {
  const result = await pdPut(`/deals/${req.params.id}`, { status: 'won' });
  if (result.success) {
    const idx = cache.deals.findIndex(d => d.id === parseInt(req.params.id));
    if (idx !== -1) cache.deals.splice(idx, 1);
  }
  res.json(result);
});

// --- Add Note to Deal ---
app.post('/api/deals/:id/notes', async (req, res) => {
  const { content } = req.body;
  const result = await pdPost('/notes', {
    deal_id: parseInt(req.params.id),
    content,
  });
  res.json(result);
});

// --- Add Activity to Deal ---
app.post('/api/deals/:id/activities', async (req, res) => {
  const { subject, type, due_date, due_time, note } = req.body;
  const result = await pdPost('/activities', {
    deal_id: parseInt(req.params.id),
    subject,
    type: type || 'call',
    due_date: due_date || getBusinessDateString(),
    due_time,
    note,
  });
  if (result.success && result.data) {
    cache.activities.push(result.data);
  }
  res.json(result);
});

// --- Dashboard Stats ---
app.get('/api/dashboard', (req, res) => {
  let deals;
  try { deals = cache.deals.map(enrichDeal); } catch (e) { console.error('[DASHBOARD] enrichDeal error:', e.message); deals = []; }
  const today = getBusinessDateString();

  const stageDistribution = cache.stages.map(s => ({
    id: s.id,
    name: s.name,
    order: s.order_nr,
    count: deals.filter(d => d.stageId === s.id).length,
    value: deals.filter(d => d.stageId === s.id).reduce((sum, d) => sum + d.value, 0),
  }));

  const todayActivities = cache.activities.filter(a => a.due_date === today);
  const overdueActivities = cache.activities.filter(a => a.due_date && a.due_date < today && !a.done);

  const activityTypes = {};
  cache.activities.forEach(a => {
    activityTypes[a.type] = (activityTypes[a.type] || 0) + 1;
  });

  const coldLeads = deals.filter(d => d.daysSinceActivity > 7).length;
  const stuckDeals = deals.filter(d => d.daysInStage > 14).length;
  const totalValue = deals.reduce((sum, d) => sum + d.value, 0);

  // Conversion funnel
  const funnel = stageDistribution.map((s, i) => {
    const next = stageDistribution[i + 1];
    return {
      ...s,
      conversionRate: next ? (next.count / Math.max(s.count, 1) * 100).toFixed(1) : null,
    };
  });

  // Average days in each stage
  const stageVelocity = cache.stages.map(s => {
    const stageDeals = deals.filter(d => d.stageId === s.id);
    const avgDays = stageDeals.length > 0
      ? Math.round(stageDeals.reduce((sum, d) => sum + d.daysInStage, 0) / stageDeals.length)
      : 0;
    return { id: s.id, name: s.name, avgDays, count: stageDeals.length };
  });

  res.json({
    totalDeals: deals.length,
    totalValue,
    coldLeads,
    stuckDeals,
    stageDistribution,
    funnel,
    stageVelocity,
    activities: {
      today: todayActivities.length,
      overdue: overdueActivities.length,
      total: cache.activities.length,
      byType: activityTypes,
    },
    lastSync: cache.lastSync,
  });
});

// --- Enrichment scan: find deals with missing data ---
app.get('/api/deals/scan/incomplete', (req, res) => {
  try {
    const { stage_id, limit: qLimit } = req.query;
    let deals = cache.deals.map(enrichDeal);

    // Filter by stage if provided
    if (stage_id) {
      deals = deals.filter(d => d.stageId === parseInt(stage_id));
    }

    let skippedHistory = 0;
    const incomplete = deals.map(d => {
      const missing = [];
      if (!d.phone) missing.push('phone');
      if (!d.email) missing.push('email');
      if (!d.contact || d.contact === '') missing.push('contact');
      if (!d.company || d.company === '') missing.push('organization');
      const org = cache.organizations[d.orgId];
      if (!org?.address && !org?.address_street_number) missing.push('address');
      const history = getHistoryEntryForDeal(d).entry;
      return {
        ...d,
        missing,
        missingCount: missing.length,
        enrichmentHistory: history ? {
          status: history.status,
          lastAttemptAt: history.lastAttemptAt,
          lastApprovedAt: history.lastApprovedAt,
          companyKey: history.companyKey,
          model: history.model,
        } : null,
      };
    }).filter(d => d.missingCount > 0)
      .filter(d => {
        const reusable = isReusableEnrichmentEntry(d.enrichmentHistory);
        if (reusable) skippedHistory += 1;
        return !reusable;
      })
      .sort((a, b) => b.missingCount - a.missingCount);

    const lim = qLimit ? parseInt(qLimit) : incomplete.length;
    const limited = incomplete.slice(0, lim);

    res.json({
      deals: limited,
      total: incomplete.length,
      showing: limited.length,
      skipped_history: skippedHistory,
    });
  } catch (err) {
    console.error('[SCAN] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/enrichment/history', (req, res) => {
  const items = Object.values(enrichmentHistory)
    .filter((entry, index, arr) => entry?.companyKey && arr.findIndex(item => item?.companyKey === entry.companyKey) === index)
    .sort((a, b) => new Date(b.lastAttemptAt || 0).getTime() - new Date(a.lastAttemptAt || 0).getTime());

  res.json({
    items,
    total: items.length,
    provider: 'openai',
    model: CONFIG.openai.model,
  });
});

app.get('/api/outreach/state/:dealId', (req, res) => {
  const dealRaw = cache.deals.find(item => item.id === Number(req.params.dealId));
  if (!dealRaw) return res.status(404).json({ error: 'Deal not found' });
  const deal = enrichDeal(dealRaw);
  res.json({
    deal_id: deal.id,
    state: getOutreachRecord(deal) || defaultOutreachStateForDeal(deal),
    linkedin: getLinkedinMemoryForDeal(deal)?.entry || null,
    enrichment: getHistoryEntryForDeal(deal)?.entry || null,
  });
});

app.post('/api/outreach/analyze', async (req, res) => {
  try {
    const { deal_id, ...extras } = req.body || {};
    const dealRaw = cache.deals.find(item => item.id === Number(deal_id));
    if (!dealRaw) return res.status(404).json({ error: 'Deal not found' });
    const deal = enrichDeal(dealRaw);
    const analysis = await analyzeLeadForOutreach(deal, extras);
    const nextState = ['DO_NOT_CONTACT', 'LOW_FIT'].includes(analysis.fitClassification)
      ? OUTREACH_STATES.DISQUALIFIED
      : OUTREACH_STATES.QUALIFIED;
    const state = transitionOutreachState(deal, nextState, {
      promptType: 'leadAnalyzer',
      rationale: analysis.rationaleShort,
      output: analysis.raw,
      patch: {
        fitClassification: analysis.fitClassification,
        leadScore: analysis.leadScore,
        personaType: analysis.personaType,
        decisionPower: analysis.decisionPower,
        reasons: analysis.whyRelevant,
        risks: analysis.risks,
        recommendedApproach: analysis.recommendedApproach,
        connectionNoteAngle: analysis.connectionNoteAngle,
        firstMessageAngle: analysis.firstMessageAngle,
        ctaStrategy: analysis.ctaStrategy,
        classifierConfidence: analysis.confidence,
        followupDays: analysis.followupDays,
        escalateToHuman: analysis.escalateToHuman,
        tags: analysis.tags,
        rationaleShort: analysis.rationaleShort,
      },
    });
    res.json({ success: true, analysis, state });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/outreach/queue', (req, res) => {
  const items = getOutreachQueueItems().map(record => ({
    deal_id: record.dealId,
    company: record.company,
    contact: record.contact,
    state: record.state,
    fit_classification: record.fitClassification,
    lead_score: record.leadScore,
    queue_score: record.queueScore,
    followup_due_date: record.followupDueDate || null,
    escalate_to_human: !!record.escalateToHuman,
    rationale_short: record.rationaleShort || null,
    tags: record.tags || [],
  }));
  res.json({
    items,
    total: items.length,
    stats: {
      handoff: items.filter(item => item.state === OUTREACH_STATES.HANDOFF_TO_HUMAN).length,
      meeting_intent: items.filter(item => item.state === OUTREACH_STATES.MEETING_INTENT_DETECTED).length,
      followup_due: items.filter(item => item.followup_due_date && isDateOnOrBefore(item.followup_due_date, getBusinessDateString())).length,
    },
  });
});

app.post('/api/outreach/execute', async (req, res) => {
  try {
    const { deal_id, action, force_send, account_id, ...extras } = req.body || {};
    const dealRaw = cache.deals.find(item => item.id === Number(deal_id));
    if (!dealRaw) return res.status(404).json({ error: 'Deal not found' });
    if (!['connection_note', 'first_message'].includes(action)) {
      return res.status(400).json({ error: 'action deve ser connection_note ou first_message' });
    }
    const deal = enrichDeal(dealRaw);
    const result = await executeOutreachAction(deal, action, {
      forceSend: !!force_send,
      accountId: account_id,
      extras,
    });

    await pdPost('/notes', {
      deal_id: deal.id,
      content: (result.executedAction || action) === 'connection_note'
        ? `<h3>LinkedIn Connection Note (IA)</h3><p>${result.draft}</p>${result.prospect?.linkedinUrl ? `<p><b>Perfil:</b> ${result.prospect.linkedinUrl}</p>` : ''}`
        : `<h3>LinkedIn First Message (IA)</h3><p>${result.draft}</p>${result.prospect?.linkedinUrl ? `<p><b>Perfil:</b> ${result.prospect.linkedinUrl}</p>` : ''}`,
    });

    res.json({
      success: true,
      action,
      executed_action: result.executedAction || action,
      sent: !!result.sent,
      blocked: !!result.blocked,
      reason: result.reason || result.pendingReason || null,
      connection_required: !!result.connectionRequired,
      draft: result.draft,
      package: result.draftPackage,
      analysis: result.analysis,
      state: result.state,
      prospect: result.prospect || null,
      action_result: result.actionResult || null,
      limit: result.limit || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/outreach/reply', async (req, res) => {
  try {
    const { deal_id, reply_text } = req.body || {};
    const dealRaw = cache.deals.find(item => item.id === Number(deal_id));
    if (!dealRaw) return res.status(404).json({ error: 'Deal not found' });
    if (!reply_text) return res.status(400).json({ error: 'reply_text obrigatorio' });
    const deal = enrichDeal(dealRaw);
    const classification = await classifyLinkedinReply(deal, reply_text);
    const response = await generateLinkedinResponse(deal, reply_text, classification);
    appendOutreachMessage(deal, { role: 'lead', text: reply_text, classification: classification.classification });
    appendOutreachMessage(deal, { role: 'assistant', text: response.messageText, classification: response.classification });

    const nextState = resolveReplyOutcome(response);
    const followupDueDate = response.followupDays > 0 ? computeFollowupDate(response.followupDays) : null;

    const state = transitionOutreachState(deal, nextState, {
      promptType: 'conversationResponder',
      rationale: response.rationaleShort,
      output: { classification, response },
      patch: {
        followupDays: response.followupDays,
        followupDueDate,
        escalateToHuman: response.escalateToHuman,
        tags: [...new Set([...(getOutreachRecord(deal)?.tags || []), ...response.tags])],
        rationaleShort: response.rationaleShort,
      },
    });

    let activity = null;
    if (nextState === OUTREACH_STATES.HANDOFF_TO_HUMAN || nextState === OUTREACH_STATES.MEETING_INTENT_DETECTED) {
      activity = await createPipedriveOutreachActivity(deal, {
        subject: nextState === OUTREACH_STATES.MEETING_INTENT_DETECTED ? 'Lead quente LinkedIn - avaliar reuniao' : 'Lead precisa de handoff humano',
        note: response.messageText,
        dueDate: computeFollowupDate(0),
      });
    } else if (nextState === OUTREACH_STATES.FOLLOWUP_PENDING && followupDueDate) {
      activity = await createPipedriveOutreachActivity(deal, {
        subject: 'Follow-up LinkedIn sugerido pela IA',
        note: `Classificacao: ${classification.classification}${classification.subtype ? ` (${classification.subtype})` : ''}`,
        dueDate: followupDueDate,
      });
    }

    res.json({ success: true, classification, response, state, activity });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/unipile/accounts', async (req, res) => {
  try {
    const data = await unipileListAccounts();
    const items = Array.isArray(data?.items) ? data.items : Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
    res.json({
      items,
      total: items.length,
      configured_account_id: CONFIG.unipile.linkedinAccountId || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/unipile/linkedin/search', async (req, res) => {
  try {
    const { deal_id, query, account_id, limit } = req.query;
    let deal = null;
    if (deal_id) {
      const dealRaw = cache.deals.find(item => item.id === Number(deal_id));
      if (dealRaw) deal = enrichDeal(dealRaw);
    }

    const prospect = deal
      ? await resolveLinkedinProspect(deal, { accountId: account_id, limit: Number(limit) || 5 })
      : null;

    if (prospect) {
      return res.json({ success: true, from_memory: false, prospect });
    }

    if (!query) {
      return res.status(400).json({ error: 'Informe deal_id ou query' });
    }

    const data = await unipileSearchLinkedinUsers({
      accountId: account_id,
      query,
      limit: Number(limit) || 5,
    });
    const items = Array.isArray(data?.items) ? data.items : Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
    res.json({
      success: true,
      items: items.map(normalizeUnipileUser),
      total: items.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/unipile/linkedin/invite', async (req, res) => {
  try {
    const { deal_id, provider_id, note, account_id, company, person_name } = req.body || {};
    const dealRaw = cache.deals.find(item => item.id === Number(deal_id));
    if (!dealRaw) return res.status(404).json({ error: 'Deal not found' });
    const deal = enrichDeal(dealRaw);
    const prospect = provider_id
      ? { providerId: provider_id, linkedinUrl: null, personName: person_name || deal.contact }
      : await resolveLinkedinProspect(deal, { accountId: account_id, company, personName: person_name });

    if (!prospect?.providerId) {
      return res.status(400).json({ error: 'Nao foi possivel identificar o profile_id do LinkedIn' });
    }

    const data = await unipileInviteLinkedinProspect({
      accountId: account_id,
      providerId: prospect.providerId,
      note,
    });

    const memory = upsertLinkedinMemory(deal, {
      company: company || deal.company,
      personName: person_name || prospect.personName || deal.contact,
      providerId: prospect.providerId,
      linkedinUrl: prospect.linkedinUrl,
      status: 'invited',
      invitationSent: true,
      inviteMessage: note || null,
      source: 'unipile_invite',
    });

    res.json({ success: true, data, prospect: memory });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/unipile/linkedin/message', async (req, res) => {
  try {
    const { deal_id, provider_id, message, account_id, company, person_name } = req.body || {};
    const dealRaw = cache.deals.find(item => item.id === Number(deal_id));
    if (!dealRaw) return res.status(404).json({ error: 'Deal not found' });
    const deal = enrichDeal(dealRaw);
    const prospect = provider_id
      ? { providerId: provider_id, linkedinUrl: null, personName: person_name || deal.contact }
      : await resolveLinkedinProspect(deal, { accountId: account_id, company, personName: person_name });

    if (!prospect?.providerId) {
      return res.status(400).json({ error: 'Nao foi possivel identificar o profile_id do LinkedIn' });
    }

    const data = await unipileSendLinkedinMessage({
      accountId: account_id,
      providerId: prospect.providerId,
      message,
    });

    const memory = upsertLinkedinMemory(deal, {
      company: company || deal.company,
      personName: person_name || prospect.personName || deal.contact,
      providerId: prospect.providerId,
      linkedinUrl: prospect.linkedinUrl,
      status: 'messaged',
      messageSent: true,
      dmMessage: message || null,
      source: 'unipile_message',
    });

    res.json({ success: true, data, prospect: memory });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/unipile/webhook', async (req, res) => {
  const headerSecret = req.headers['x-unipile-signature'] || req.headers['x-webhook-secret'];
  const querySecret = CONFIG.security.allowLegacyWebhookQuerySecret ? req.query.secret : null;
  const secret = headerSecret || querySecret || '';
  if (CONFIG.unipile.webhookSecret && !safeEqual(secret, CONFIG.unipile.webhookSecret)) {
    return res.status(401).json({ error: 'Invalid webhook secret' });
  }

  try {
    const payload = req.body || {};
    const providerId = payload?.provider_id || payload?.user?.provider_id || payload?.attendee?.provider_id || null;
    const eventType = payload?.event || payload?.type || payload?.name || 'unknown';

    if (providerId) {
      const entry = Object.values(linkedinMemory).find(item => item?.providerId === providerId);
      if (entry) {
        const dealRaw = cache.deals.find(item => item.id === entry.dealId);
        if (dealRaw) {
          const deal = enrichDeal(dealRaw);
          const normalizedType = String(eventType).toLowerCase();
          const inboundText = payload?.message?.text || payload?.text || payload?.body || null;
          upsertLinkedinMemory(deal, {
            company: entry.company,
            personName: entry.personName,
            providerId,
            linkedinUrl: entry.linkedinUrl,
            status: normalizedType.includes('accept') ? 'connected' : normalizedType.includes('message') ? 'messaged' : entry.status,
            source: `webhook:${eventType}`,
          });
          if (normalizedType.includes('accept') || normalizedType.includes('connect')) {
            transitionOutreachState(deal, OUTREACH_STATES.CONNECTION_ACCEPTED, {
              promptType: 'unipileWebhook',
              rationale: `Webhook Unipile: ${eventType}`,
              output: payload,
            });
          }
          if ((normalizedType.includes('message') || normalizedType.includes('reply') || normalizedType.includes('inbound')) && inboundText) {
            appendOutreachMessage(deal, { role: 'lead', channel: 'linkedin', text: inboundText, classification: 'UNKNOWN' });
            transitionOutreachState(deal, OUTREACH_STATES.LEAD_REPLIED, {
              promptType: 'unipileWebhook',
              rationale: `Inbound LinkedIn detectado: ${eventType}`,
              output: payload,
            });
          }
        }
      }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
// AI ENDPOINTS (OpenAI Responses API)
// ═══════════════════════════════════════════════════════════
function extractOpenAIText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();

  const texts = (data?.output || [])
    .flatMap(item => item?.content || [])
    .filter(item => item?.type === 'output_text' && item.text)
    .map(item => item.text);

  return texts.join('\n').trim();
}

function tryParseJSON(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    try {
      const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
      return JSON.parse(cleaned);
    } catch {
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
        const arrMatch = raw.match(/\[[\s\S]*\]/);
        if (arrMatch) return JSON.parse(arrMatch[0]);
      } catch {}
    }
  }
  return null;
}

async function callOpenAI(prompt, systemInstruction, options = {}) {
  if (!CONFIG.openai.key) throw new Error('OpenAI API key not configured');

  const { useSearch = false, jsonMode = false, model } = options;
  const body = {
    model: model || CONFIG.openai.model,
    reasoning: { effort: CONFIG.openai.reasoningEffort },
    input: [
      ...(systemInstruction ? [{ role: 'system', content: [{ type: 'input_text', text: systemInstruction }] }] : []),
      { role: 'user', content: [{ type: 'input_text', text: prompt }] },
    ],
    max_output_tokens: jsonMode ? 6000 : 8000,
  };

  if (useSearch) body.tools = [{ type: 'web_search_preview' }];
  if (jsonMode) body.text = { format: { type: 'json_object' } };

  const response = await fetch(OPENAI_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${CONFIG.openai.key}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data?.error?.message || 'OpenAI API error');

  const text = extractOpenAIText(data);
  if (!text) throw new Error('Sem resposta da OpenAI.');
  return text;
}

async function callOpenAIJSON(prompt, systemInstruction, useSearch = false) {
  const raw = await callOpenAI(prompt, systemInstruction, { useSearch, jsonMode: !useSearch });
  return tryParseJSON(raw);
}

async function callOpenAIJSONWithModel(prompt, systemInstruction, { useSearch = false, model } = {}) {
  const raw = await callOpenAI(prompt, systemInstruction, { useSearch, jsonMode: !useSearch, model });
  return tryParseJSON(raw);
}

// ── SYSTEM PROMPTS (upgraded) ──

const SYSTEM_PROMPTS = {
  generate: `Voce e o Chief Revenue Officer virtual da LAW Solucoes Financeiras. Voce tem acesso ao pipeline completo de prospeccao FIDC e pensa estrategicamente sobre conversao, priorizacao e cadencia. Voce responde com dados, nao com generalidades. Sempre que possivel, sugere acoes concretas com deadlines. Responda em portugues brasileiro.`,
  leadAnalyzer: `Voce e um analista comercial senior da LAW Financas especializado em prospeccao consultiva B2B via LinkedIn. Avalie apenas os dados fornecidos. Nunca invente fatos. Sempre priorize qualidade, relevancia e seguranca comercial. Retorne APENAS um JSON com os campos: fit_classification, lead_score, persona_type, decision_power, why_relevant, risks, recommended_approach, connection_note_angle, first_message_angle, cta_strategy, confidence, recommended_action, followup_days, escalate_to_human, tags, rationale_short.`,

  linkedinNote: `Voce e um copywriter B2B de elite especializado em social selling no LinkedIn para o mercado financeiro brasileiro. Voce domina gatilhos mentais, personalizacao profunda e tecnicas de conexao que geram taxas de aceite acima de 40%. Seu estilo e sofisticado, nunca generico. Voce deve retornar APENAS um JSON valido com um array de 3 variacoes. Cada variacao deve ter: "label" (ex: "Direto", "Consultivo", "Provocador"), "text" (a nota de conexao, max 280 chars). Formato: [{"label":"...","text":"..."},{"label":"...","text":"..."},{"label":"...","text":"..."}]`,

  linkedinMessage: `Voce e um especialista em social selling B2B que converte conexoes do LinkedIn em reunioes qualificadas. Sua taxa de conversao de mensagem para reuniao e 12% — 4x acima da media de mercado. Voce sabe que a primeira mensagem apos aceite e o momento mais critico. Retorne APENAS um JSON valido com um array de 3 variacoes. Cada variacao deve ter: "label" e "text" (max 600 chars). NAO mencione "LAW" pelo nome. Formato: [{"label":"...","text":"..."},{"label":"...","text":"..."},{"label":"...","text":"..."}]`,
  replyClassifier: `Voce classifica respostas recebidas no LinkedIn para a LAW Financas. Use somente o texto fornecido e o contexto informado. Nao invente intencoes. Retorne APENAS JSON com: classification, subtype, confidence, recommended_action, followup_days, escalate_to_human, tags, rationale_short.`,
  conversationResponder: `Voce responde mensagens de LinkedIn para a LAW Financas com tom executivo, consultivo, breve e comercialmente inteligente. Nao invente numeros, nao prometa economia fiscal, nao fale como especialista juridico/tributario. Retorne APENAS JSON com: classification, confidence, recommended_action, message_text, followup_days, escalate_to_human, tags, rationale_short.`,

  research: `Voce e um analista de inteligencia competitiva senior com 15 anos de experiencia no mercado financeiro brasileiro. Sua especialidade e mapear empresas para originacao de FIDC. Voce pensa como um CFO e identifica sinais de necessidade de capital de giro. Voce DEVE usar Google Search para buscar dados atuais.`,

  callScript: `Voce e um coach de vendas consultivas B2B com expertise em venda de solucoes financeiras complexas (FIDC, FIDCs proprietarios, securitizacao). Voce treinou centenas de SDRs e sabe exatamente como abrir portas com decisores financeiros. Retorne APENAS um JSON valido com um array de 3 variacoes de roteiro. Cada variacao deve ter: "label" (ex: "Consultivo", "Direto", "Challenger") e "text" (o roteiro completo). Formato: [{"label":"...","text":"..."},{"label":"...","text":"..."},{"label":"...","text":"..."}]`,

  email: `Voce e um copywriter de emails B2B de alta performance para o mercado financeiro brasileiro. Seus emails tem taxa de abertura de 45% e resposta de 12%. Retorne APENAS um JSON valido com um array de 3 variacoes. Cada variacao deve ter: "label" e "text" (o email completo). Formato: [{"label":"...","text":"..."},{"label":"...","text":"..."},{"label":"...","text":"..."}]`,

  executeResearch: `Voce e um pesquisador de inteligencia comercial senior. Sua missao e encontrar TODAS as informacoes possiveis sobre uma empresa brasileira para preparar uma prospeccao B2B de FIDC. Voce DEVE usar Google Search para buscar dados atuais. Retorne APENAS um JSON valido no formato especificado, sem nenhum texto adicional.`,
};

function sanitizeJsonArray(value) {
  return Array.isArray(value) ? value.filter(Boolean).map(item => String(item)) : [];
}

async function analyzeLeadForOutreach(deal, extras = {}) {
  const snapshot = buildOutreachSnapshot(deal, extras);
  const prompt = `Analise o lead e a empresa abaixo para outreach consultivo da LAW Financas.

SNAPSHOT:
${JSON.stringify(snapshot, null, 2)}

Regras:
- Priorize decisores financeiros.
- Classifique HIGH_FIT, MEDIUM_FIT, LOW_FIT ou DO_NOT_CONTACT.
- Score de 0 a 100.
- Nunca invente fatos nao presentes no snapshot.
- Se faltar dado, reduza confianca.
- Se o lead nao for relevante para decisao financeira, sinalize DO_NOT_CONTACT ou LOW_FIT.
- recommended_action deve ser um dentre: ENRICH_MORE, PREPARE_CONNECTION_NOTE, DO_NOT_CONTACT, HANDOFF_TO_HUMAN.
- tags deve ser lista curta.
- rationale_short em 1 frase curta.`;

  const raw = await callOpenAIJSONWithModel(prompt, SYSTEM_PROMPTS.leadAnalyzer, {
    model: CONFIG.openai.classifierModel,
  });

  if (!raw || typeof raw !== 'object') throw new Error('Lead analyzer sem JSON valido');

  return {
    fitClassification: raw.fit_classification || 'LOW_FIT',
    leadScore: Math.max(0, Math.min(100, Number(raw.lead_score || 0))),
    personaType: raw.persona_type || null,
    decisionPower: raw.decision_power || 'LOW',
    whyRelevant: sanitizeJsonArray(raw.why_relevant),
    risks: sanitizeJsonArray(raw.risks),
    recommendedApproach: raw.recommended_approach || null,
    connectionNoteAngle: raw.connection_note_angle || null,
    firstMessageAngle: raw.first_message_angle || null,
    ctaStrategy: raw.cta_strategy || 'SOFT',
    confidence: Number(raw.confidence || 0) || null,
    recommendedAction: raw.recommended_action || 'ENRICH_MORE',
    followupDays: Number(raw.followup_days || 0) || 0,
    escalateToHuman: !!raw.escalate_to_human,
    tags: sanitizeJsonArray(raw.tags),
    rationaleShort: raw.rationale_short || null,
    snapshot,
    raw,
  };
}

async function generateConnectionNotePackage(deal, analysis, extras = {}) {
  const prompt = `Crie notas de conexao LinkedIn para este lead.

LEAD:
${JSON.stringify({
  company: deal.company || deal.title,
  contact: extras.contact || deal.contact,
  analysis,
  snapshot: buildOutreachSnapshot(deal, extras),
}, null, 2)}

Regras:
- Maximo 300 caracteres.
- Sem emojis.
- Sem pitch agressivo.
- Sem inventar contexto.
- 3 variantes: conservadora, consultiva e direta.
- recommended_variant deve indicar o nome da melhor variante.
- rationale_short em 1 frase.`;

  const raw = await callOpenAIJSONWithModel(prompt, SYSTEM_PROMPTS.linkedinNote, {
    model: CONFIG.openai.messageModel,
  });
  if (!raw || typeof raw !== 'object') throw new Error('Connection note sem JSON valido');
  const variations = normalizeConnectionVariants(raw);
  return {
    variations,
    recommendedVariant: raw.recommended_variant || variations[0]?.label || null,
    rationaleShort: raw.rationale_short || null,
    raw,
  };
}

async function generateFirstMessagePackage(deal, analysis, extras = {}) {
  const prompt = `Crie a primeira mensagem apos aceite de conexao para este lead.

LEAD:
${JSON.stringify({
  company: deal.company || deal.title,
  contact: extras.contact || deal.contact,
  analysis,
  snapshot: buildOutreachSnapshot(deal, extras),
}, null, 2)}

Regras:
- 350 a 600 caracteres idealmente.
- Tom executivo, consultivo, humano.
- Citar LAW Financas com sobriedade.
- Sem promessa fiscal.
- Encerrar com CTA leve.
- 3 variantes: soft, balanced, direct.
- Retorne rationale_short, followup_days, escalate_to_human.`;

  const raw = await callOpenAIJSONWithModel(prompt, SYSTEM_PROMPTS.linkedinMessage, {
    model: CONFIG.openai.messageModel,
  });
  if (!raw || typeof raw !== 'object') throw new Error('First message sem JSON valido');
  const variations = normalizeFirstMessageVariants(raw);
  return {
    variations,
    recommendedVariant: raw.recommended_variant || variations[0]?.label || null,
    rationaleShort: raw.rationale_short || null,
    followupDays: Number(raw.followup_days || 3) || 3,
    escalateToHuman: !!raw.escalate_to_human,
    raw,
  };
}

async function classifyLinkedinReply(deal, replyText) {
  const outreach = getOutreachRecord(deal);
  const prompt = `Classifique a resposta abaixo no contexto de outreach consultivo da LAW Financas.

CONTEXTO:
${JSON.stringify({
  company: deal.company || deal.title,
  contact: deal.contact,
  state: outreach?.state || OUTREACH_STATES.AWAITING_REPLY,
  history: outreach?.messageHistory || [],
  reply: replyText,
}, null, 2)}

Categorias permitidas:
INTEREST, SOFT_INTEREST, ASKING_FOR_DETAILS, OBJECTION, NOT_NOW, NO_INTEREST, DELEGATION, AUTOREPLY, UNKNOWN

Subtipos quando aplicavel:
no_time, already_have_solution, not_relevant, send_material, not_priority, distrust, tax_topic_sensitive, wants_meeting, wants_summary, wants_understanding, wants_case_example`;

  const raw = await callOpenAIJSONWithModel(prompt, SYSTEM_PROMPTS.replyClassifier, {
    model: CONFIG.openai.classifierModel,
  });
  if (!raw || typeof raw !== 'object') throw new Error('Reply classifier sem JSON valido');
  return {
    classification: raw.classification || 'UNKNOWN',
    subtype: raw.subtype || null,
    confidence: Number(raw.confidence || 0) || null,
    recommendedAction: raw.recommended_action || 'REVIEW',
    followupDays: Number(raw.followup_days || 0) || 0,
    escalateToHuman: !!raw.escalate_to_human,
    tags: sanitizeJsonArray(raw.tags),
    rationaleShort: raw.rationale_short || null,
    raw,
  };
}

async function generateLinkedinResponse(deal, replyText, replyClassification) {
  const outreach = getOutreachRecord(deal);
  const prompt = `Gere a proxima resposta para esta conversa LinkedIn da LAW Financas.

CONTEXTO:
${JSON.stringify({
  company: deal.company || deal.title,
  contact: deal.contact,
  classification: replyClassification,
  history: outreach?.messageHistory || [],
  reply: replyText,
}, null, 2)}

Regras:
- Responder de forma breve e clara.
- Se houver sinal de reuniao, conduzir para agendamento.
- Se houver tema tecnico/fiscal/regulatorio sensivel, escalar para humano.
- Nao repetir CTA anterior se houver.
- recommended_action deve ser um dentre: MOVE_TO_MEETING, ANSWER_AND_ADVANCE, SEND_SUMMARY, FOLLOW_UP_LATER, CLOSE_RESPECTFULLY, HANDOFF_TO_HUMAN.`;

  const raw = await callOpenAIJSONWithModel(prompt, SYSTEM_PROMPTS.conversationResponder, {
    model: CONFIG.openai.messageModel,
  });
  if (!raw || typeof raw !== 'object') throw new Error('Conversation responder sem JSON valido');
  return {
    classification: raw.classification || replyClassification.classification || 'UNKNOWN',
    confidence: Number(raw.confidence || 0) || null,
    recommendedAction: raw.recommended_action || 'ANSWER_AND_ADVANCE',
    messageText: raw.message_text || '',
    followupDays: Number(raw.followup_days || 0) || 0,
    escalateToHuman: !!raw.escalate_to_human,
    tags: sanitizeJsonArray(raw.tags),
    rationaleShort: raw.rationale_short || null,
    raw,
  };
}

async function executeOutreachAction(deal, action, options = {}) {
  const analysis = await analyzeLeadForOutreach(deal, options.extras || {});
  const sendIntent = !!options.forceSend || (CONFIG.outreach.autoSend && !CONFIG.outreach.requireHumanApproval);
  const sendWindow = canExecuteOutreachSend(action);
  const prospect = await resolveLinkedinProspect(deal, { accountId: options.accountId });

  if (action === 'connection_note') {
    const draftPackage = await generateConnectionNotePackage(deal, analysis, options.extras || {});
    const draft = draftPackage.variations.find(item => item.label === draftPackage.recommendedVariant)?.text || draftPackage.variations[0]?.text || '';

    if (shouldBlockOutreach(analysis.fitClassification)) {
      const state = transitionOutreachState(deal, OUTREACH_STATES.DO_NOT_CONTACT, {
        promptType: 'linkedinNote',
        rationale: draftPackage.rationaleShort || analysis.rationaleShort,
        output: { analysis: analysis.raw, note_package: draftPackage.raw },
        patch: {
          fitClassification: analysis.fitClassification,
          leadScore: analysis.leadScore,
          personaType: analysis.personaType,
          decisionPower: analysis.decisionPower,
          reasons: analysis.whyRelevant,
          risks: analysis.risks,
          tags: analysis.tags,
          rationaleShort: draftPackage.rationaleShort || analysis.rationaleShort,
        },
      });
      return { analysis, draftPackage, draft, prospect, sent: false, state, blocked: true, reason: analysis.fitClassification, executedAction: 'connection_note' };
    }

    if (!prospect?.providerId) {
      const state = transitionOutreachState(deal, OUTREACH_STATES.CONNECTION_NOTE_PENDING, {
        promptType: 'linkedinNote',
        rationale: 'Lead qualificado, mas ainda sem profile_id resolvido no LinkedIn.',
        output: { analysis: analysis.raw, note_package: draftPackage.raw },
        patch: {
          fitClassification: analysis.fitClassification,
          leadScore: analysis.leadScore,
          personaType: analysis.personaType,
          decisionPower: analysis.decisionPower,
          selectedConnectionVariant: draftPackage.recommendedVariant,
          tags: analysis.tags,
          followupDays: analysis.followupDays,
          rationaleShort: draftPackage.rationaleShort || analysis.rationaleShort,
        },
      });
      return { analysis, draftPackage, draft, prospect: null, sent: false, state, pendingReason: 'missing_provider_id', executedAction: 'connection_note' };
    }

    if (!sendIntent || !sendWindow.allowed) {
      const state = transitionOutreachState(deal, OUTREACH_STATES.CONNECTION_NOTE_PENDING, {
        promptType: 'linkedinNote',
        rationale: !sendWindow.allowed ? `Limite diario de conexoes atingido (${sendWindow.used}/${sendWindow.limit}).` : draftPackage.rationaleShort || analysis.rationaleShort,
        output: { analysis: analysis.raw, note_package: draftPackage.raw },
        patch: {
          fitClassification: analysis.fitClassification,
          leadScore: analysis.leadScore,
          personaType: analysis.personaType,
          decisionPower: analysis.decisionPower,
          selectedConnectionVariant: draftPackage.recommendedVariant,
          tags: analysis.tags,
          followupDays: analysis.followupDays,
          rationaleShort: draftPackage.rationaleShort || analysis.rationaleShort,
        },
      });
      return { analysis, draftPackage, draft, prospect, sent: false, state, limit: sendWindow, executedAction: 'connection_note' };
    }

    const actionResult = await unipileInviteLinkedinProspect({ accountId: options.accountId, providerId: prospect.providerId, note: draft });
    upsertLinkedinMemory(deal, {
      personName: prospect.personName || deal.contact,
      company: prospect.company || deal.company,
      providerId: prospect.providerId,
      linkedinUrl: prospect.linkedinUrl,
      status: 'invited',
      invitationSent: true,
      inviteMessage: draft,
      source: 'outreach_execute',
    });
    const state = transitionOutreachState(deal, OUTREACH_STATES.CONNECTION_REQUEST_SENT, {
      promptType: 'linkedinNote',
      rationale: draftPackage.rationaleShort || analysis.rationaleShort,
      output: { analysis: analysis.raw, note_package: draftPackage.raw, action_result: actionResult },
      patch: {
        fitClassification: analysis.fitClassification,
        leadScore: analysis.leadScore,
        personaType: analysis.personaType,
        decisionPower: analysis.decisionPower,
        selectedConnectionVariant: draftPackage.recommendedVariant,
        tags: analysis.tags,
        followupDays: analysis.followupDays || 5,
        followupDueDate: computeFollowupDate(analysis.followupDays || 5),
        rationaleShort: draftPackage.rationaleShort || analysis.rationaleShort,
      },
    });
    return { analysis, draftPackage, draft, prospect, sent: true, state, actionResult, executedAction: 'connection_note' };
  }

  const draftPackage = await generateFirstMessagePackage(deal, analysis, options.extras || {});
  const draft = draftPackage.variations.find(item => item.label === draftPackage.recommendedVariant)?.text || draftPackage.variations[0]?.text || '';
  const connectionAccepted = hasAcceptedLinkedinConnection(deal, prospect, getOutreachRecord(deal));

  if (analysis.fitClassification === 'DO_NOT_CONTACT') {
    const state = transitionOutreachState(deal, OUTREACH_STATES.DO_NOT_CONTACT, {
      promptType: 'linkedinFirstMessage',
      rationale: draftPackage.rationaleShort || analysis.rationaleShort,
      output: { analysis: analysis.raw, message_package: draftPackage.raw },
    });
    return { analysis, draftPackage, draft, prospect, sent: false, state, blocked: true, reason: analysis.fitClassification };
  }

  if (!connectionAccepted) {
    const inviteResult = await executeOutreachAction(deal, 'connection_note', options);
    return {
      ...inviteResult,
      executedAction: 'connection_note',
      requestedAction: 'first_message',
      connectionRequired: true,
      messageDraft: draft,
      messagePackage: draftPackage,
    };
  }

  if (!prospect?.providerId) {
    const state = transitionOutreachState(deal, OUTREACH_STATES.FIRST_MESSAGE_PENDING, {
      promptType: 'linkedinFirstMessage',
      rationale: 'Mensagem preparada, mas ainda sem profile_id resolvido no LinkedIn.',
      output: { analysis: analysis.raw, message_package: draftPackage.raw },
      patch: {
        fitClassification: analysis.fitClassification,
        leadScore: analysis.leadScore,
        selectedMessageVariant: draftPackage.recommendedVariant,
        followupDays: draftPackage.followupDays,
        rationaleShort: draftPackage.rationaleShort || analysis.rationaleShort,
      },
    });
    return { analysis, draftPackage, draft, prospect: null, sent: false, state, pendingReason: 'missing_provider_id' };
  }

  if (!sendIntent || !sendWindow.allowed) {
    const state = transitionOutreachState(deal, OUTREACH_STATES.FIRST_MESSAGE_PENDING, {
      promptType: 'linkedinFirstMessage',
      rationale: !sendWindow.allowed ? `Limite diario de mensagens atingido (${sendWindow.used}/${sendWindow.limit}).` : draftPackage.rationaleShort || analysis.rationaleShort,
      output: { analysis: analysis.raw, message_package: draftPackage.raw },
      patch: {
        fitClassification: analysis.fitClassification,
        leadScore: analysis.leadScore,
        selectedMessageVariant: draftPackage.recommendedVariant,
        followupDays: draftPackage.followupDays,
        rationaleShort: draftPackage.rationaleShort || analysis.rationaleShort,
      },
    });
    return { analysis, draftPackage, draft, prospect, sent: false, state, limit: sendWindow };
  }

  const actionResult = await unipileSendLinkedinMessage({ accountId: options.accountId, providerId: prospect.providerId, message: draft });
  upsertLinkedinMemory(deal, {
    personName: prospect.personName || deal.contact,
    company: prospect.company || deal.company,
    providerId: prospect.providerId,
    linkedinUrl: prospect.linkedinUrl,
    status: 'messaged',
    messageSent: true,
    dmMessage: draft,
    source: 'outreach_execute',
  });
  appendOutreachMessage(deal, { role: 'assistant', channel: 'linkedin', text: draft, variant: draftPackage.recommendedVariant });
  transitionOutreachState(deal, OUTREACH_STATES.FIRST_MESSAGE_SENT, {
    promptType: 'linkedinFirstMessage',
    rationale: draftPackage.rationaleShort || analysis.rationaleShort,
    output: { analysis: analysis.raw, message_package: draftPackage.raw, action_result: actionResult },
    patch: {
      fitClassification: analysis.fitClassification,
      leadScore: analysis.leadScore,
      selectedMessageVariant: draftPackage.recommendedVariant,
      followupDays: draftPackage.followupDays,
      followupDueDate: computeFollowupDate(draftPackage.followupDays || 4),
      tags: analysis.tags,
      rationaleShort: draftPackage.rationaleShort || analysis.rationaleShort,
      escalateToHuman: draftPackage.escalateToHuman || analysis.escalateToHuman,
    },
  });
  const state = transitionOutreachState(deal, OUTREACH_STATES.AWAITING_REPLY, {
    promptType: 'linkedinFirstMessage',
    rationale: 'Mensagem enviada; aguardando reply do lead.',
    patch: {
      followupDays: draftPackage.followupDays,
      followupDueDate: computeFollowupDate(draftPackage.followupDays || 4),
    },
  });
  return { analysis, draftPackage, draft, prospect, sent: true, state, actionResult, executedAction: 'first_message' };
}

// ── AI: Generate (free assistant) ──
app.post('/api/ai/generate', async (req, res) => {
  if (!CONFIG.openai.key) return res.status(400).json({ error: 'OpenAI API key not configured' });

  const { prompt, system, useSearch } = req.body;

  try {
    const deals = cache.deals.map(enrichDeal);
    const pipelineContext = `
CONTEXTO DO PIPELINE ATUAL:
- ${deals.length} negocios ativos
- Etapas: ${cache.stages.map(s => s.name + ' (' + deals.filter(d => d.stageId === s.id).length + ')').join(', ')}
- ${cache.activities.filter(a => a.due_date === getBusinessDateString()).length} atividades hoje
- ${cache.activities.filter(a => a.due_date && isDateBefore(a.due_date, getBusinessDateString())).length} atividades vencidas
`;

    const text = await callOpenAI(
      pipelineContext + '\n\nPERGUNTA DO USUARIO:\n' + prompt,
      system || SYSTEM_PROMPTS.generate,
      { useSearch }
    );
    res.json({ text });
  } catch (err) {
    console.error('[AI Generate] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── AI: LinkedIn Note (3 variations) ──
app.post('/api/ai/linkedin-note', async (req, res) => {
  try {
    const { deal_id, company, contact, ...extras } = req.body || {};
    let deal = {
      id: Number(deal_id || 0),
      company: company || '',
      title: company || '',
      contact: contact || '',
      orgId: null,
      personId: null,
      labels: [],
    };
    if (deal_id) {
      const dealRaw = cache.deals.find(item => item.id === Number(deal_id));
      if (dealRaw) deal = enrichDeal(dealRaw);
    }

    const analysis = await analyzeLeadForOutreach(deal, { company, contact, ...extras });
    const pkg = await generateConnectionNotePackage(deal, analysis, { company, contact, ...extras });
    const selected = pkg.variations.find(item => item.label === pkg.recommendedVariant)?.text || pkg.variations[0]?.text || '';

    if (deal.id) {
      transitionOutreachState(deal, analysis.fitClassification === 'DO_NOT_CONTACT' ? OUTREACH_STATES.DO_NOT_CONTACT : OUTREACH_STATES.CONNECTION_NOTE_PENDING, {
        promptType: 'linkedinNote',
        rationale: pkg.rationaleShort || analysis.rationaleShort,
        output: { analysis: analysis.raw, note_package: pkg.raw },
        patch: {
          fitClassification: analysis.fitClassification,
          leadScore: analysis.leadScore,
          personaType: analysis.personaType,
          decisionPower: analysis.decisionPower,
          reasons: analysis.whyRelevant,
          risks: analysis.risks,
          recommendedApproach: analysis.recommendedApproach,
          connectionNoteAngle: analysis.connectionNoteAngle,
          ctaStrategy: analysis.ctaStrategy,
          selectedConnectionVariant: pkg.recommendedVariant,
          tags: analysis.tags,
          rationaleShort: pkg.rationaleShort || analysis.rationaleShort,
          followupDays: analysis.followupDays,
          escalateToHuman: analysis.escalateToHuman,
        },
      });
    }

    res.json({ variations: pkg.variations, note: selected, analysis, recommended_variant: pkg.recommendedVariant, rationale_short: pkg.rationaleShort });
  } catch (err) {
    console.error('[AI LinkedIn] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── AI: LinkedIn Message (post-connection, 3 variations) ──
app.post('/api/ai/linkedin-message', async (req, res) => {
  try {
    const { deal_id, company, contact, ...extras } = req.body || {};
    let deal = {
      id: Number(deal_id || 0),
      company: company || '',
      title: company || '',
      contact: contact || '',
      orgId: null,
      personId: null,
      labels: [],
    };
    if (deal_id) {
      const dealRaw = cache.deals.find(item => item.id === Number(deal_id));
      if (dealRaw) deal = enrichDeal(dealRaw);
    }

    const analysis = await analyzeLeadForOutreach(deal, { company, contact, ...extras });
    const pkg = await generateFirstMessagePackage(deal, analysis, { company, contact, ...extras });
    const selected = pkg.variations.find(item => item.label === pkg.recommendedVariant)?.text || pkg.variations[0]?.text || '';

    if (deal.id) {
      transitionOutreachState(deal, analysis.fitClassification === 'DO_NOT_CONTACT' ? OUTREACH_STATES.DO_NOT_CONTACT : OUTREACH_STATES.FIRST_MESSAGE_PENDING, {
        promptType: 'linkedinFirstMessage',
        rationale: pkg.rationaleShort || analysis.rationaleShort,
        output: { analysis: analysis.raw, message_package: pkg.raw },
        patch: {
          fitClassification: analysis.fitClassification,
          leadScore: analysis.leadScore,
          personaType: analysis.personaType,
          decisionPower: analysis.decisionPower,
          firstMessageAngle: analysis.firstMessageAngle,
          selectedMessageVariant: pkg.recommendedVariant,
          tags: analysis.tags,
          followupDays: pkg.followupDays,
          escalateToHuman: pkg.escalateToHuman || analysis.escalateToHuman,
          rationaleShort: pkg.rationaleShort || analysis.rationaleShort,
        },
      });
    }

    res.json({ variations: pkg.variations, message: selected, analysis, recommended_variant: pkg.recommendedVariant, rationale_short: pkg.rationaleShort, followup_days: pkg.followupDays });
  } catch (err) {
    console.error('[AI LinkedIn Message] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── AI: Research (with Google Search grounding) ──
app.post('/api/ai/research', async (req, res) => {
  const { company, cnpj } = req.body;

  const prompt = `Pesquise informacoes comerciais COMPLETAS sobre a empresa "${company}" (CNPJ: ${cnpj || 'N/A'}) no Brasil.

Busque e retorne:
1. FATURAMENTO e porte da empresa (estimativa se nao encontrar exato)
2. Principais produtos/servicos
3. Composicao da carteira de recebiveis (estimativa pelo setor)
4. Prazo medio de recebimento do setor
5. Noticias recentes (expansao, investimento, dificuldade)
6. Quem e o CFO/Diretor Financeiro (LinkedIn se possivel)
7. Telefone e email da empresa
8. Score de potencial FIDC de 0-100 com justificativa

Formate como briefing executivo com secoes claras. Use emojis como headers de secao.
Seja conciso mas completo. Foque em informacoes acionaveis para prospeccao FIDC.`;

  try {
    const research = await callOpenAI(prompt, SYSTEM_PROMPTS.research, { useSearch: true });
    res.json({ research });
  } catch (err) {
    console.error('[AI Research] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── AI: Call Script (3 variations) ──
app.post('/api/ai/call-script', async (req, res) => {
  const { company, contact, sector, revenue, dossier } = req.body;

  const prompt = `Crie 3 variacoes de roteiro de ligacao para prospeccao FIDC:
Empresa: ${company}
Contato: ${contact}
Setor: ${sector || 'N/A'}
Faturamento: ${revenue || 'N/A'}
${dossier ? `\nDossier de pesquisa:\n${dossier}` : ''}

Cada roteiro DEVE incluir:
- Gatekeeping: como passar pela recepcao/secretaria
- Abertura com pattern interrupt (nao "Bom dia, tudo bem?")
- 3 perguntas de qualificacao SPIN
- Proposta de valor em 1 frase
- Handling de 5 objecoes especificas do setor
- Fechamento para reuniao com urgencia suave
- Fallback se nao conseguir falar com o decisor
- Prospector: Gabriel Saganski — LAW Solucoes Financeiras

Retorne JSON: [{"label":"Consultivo","text":"..."},{"label":"Direto","text":"..."},{"label":"Challenger","text":"..."}]`;

  try {
    const result = await callOpenAIJSON(prompt, SYSTEM_PROMPTS.callScript);
    if (Array.isArray(result)) {
      res.json({ variations: result, script: result[0]?.text || '' });
    } else {
      const text = await callOpenAI(prompt);
      res.json({ variations: [{ label: 'Padrao', text }], script: text });
    }
  } catch (err) {
    console.error('[AI Script] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── AI: Email Draft (3 variations) ──
app.post('/api/ai/email-draft', async (req, res) => {
  const { company, contact, context, type } = req.body;
  const templates = {
    intro: 'Email de apresentacao inicial sobre FIDC como solucao de capital de giro',
    followup: 'Email de follow-up apos primeiro contato sobre FIDC',
    meeting: 'Email confirmando/solicitando reuniao para apresentar FIDC proprietario',
    value: 'Email com proposta de valor FIDC personalizada para o setor',
  };

  const prompt = `Gere 3 variacoes de ${templates[type] || 'email profissional'} para prospeccao FIDC:
Empresa: ${company}
Contato: ${contact}
${context ? `Contexto/Dossier: ${context}` : ''}

Cada email deve ser:
- Curto, direto, profissional
- Personalizado para a empresa e setor
- Com proposta de valor clara sobre FIDC
- Assinatura: Gabriel Saganski - LAW Solucoes Financeiras

Retorne JSON: [{"label":"Formal","text":"..."},{"label":"Consultivo","text":"..."},{"label":"Direto","text":"..."}]`;

  try {
    const result = await callOpenAIJSON(prompt, SYSTEM_PROMPTS.email);
    if (Array.isArray(result)) {
      res.json({ variations: result, email: result[0]?.text || '' });
    } else {
      const text = await callOpenAI(prompt);
      res.json({ variations: [{ label: 'Padrao', text }], email: text });
    }
  } catch (err) {
    console.error('[AI Email] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
// AI AGENT: EXECUTE TASK (0A — TOP PRIORITY)
// ═══════════════════════════════════════════════════════════

function detectActivityType(activity) {
  const sub = (activity.subject || '').toLowerCase();
  const type = (activity.type || '').toLowerCase();

  if (sub.includes('pesquisa') || sub.includes('research') || type === 'task' && sub.includes('lead'))
    return 'research';
  if (sub.includes('linkedin') || sub.includes('conexao') || sub.includes('conexão'))
    return sub.includes('mensagem') || sub.includes('message') || sub.includes('apresenta') ? 'linkedin_message' : 'linkedin_note';
  if (sub.includes('ligacao') || sub.includes('ligação') || sub.includes('call') || type === 'call')
    return 'call';
  if (sub.includes('email') || sub.includes('e-mail') || type === 'email')
    return 'email';
  if (type === 'task') return 'research';
  return 'research';
}

app.post('/api/ai/execute-task', async (req, res) => {
  const { activity_id, deal_id } = req.body;

  try {
    const activity = cache.activities.find(a => a.id === activity_id);
    if (!activity) return res.status(404).json({ error: 'Activity not found' });

    const dealRaw = cache.deals.find(d => d.id === (deal_id || activity.deal_id));
    if (!dealRaw) return res.status(404).json({ error: 'Deal not found' });

    const deal = enrichDeal(dealRaw);
    const taskType = detectActivityType(activity);
    const actionsTaken = [];
    let dataFound = null;

    if (taskType === 'research') {
      // ── RESEARCH TASK: Full company research + Pipedrive write-back ──
      const org = cache.organizations[deal.orgId];
      const person = cache.persons[deal.personId];

      const researchPrompt = `Pesquise a empresa: ${deal.company || deal.title}
Estado: Brasil
${org?.address ? `Endereco conhecido: ${org.address}` : ''}
Dados que ja temos: Contato: ${deal.contact || 'N/A'}, Tel: ${deal.phone || 'N/A'}, Email: ${deal.email || 'N/A'}

Encontre e retorne JSON com:
{
  "company_name": "nome correto e completo",
  "trading_name": "nome fantasia",
  "sector": "setor de atuacao",
  "estimated_revenue": "faturamento estimado (ex: R$ 500M)",
  "products_services": "principais produtos/servicos",
  "employee_count": "estimativa de funcionarios",
  "financial_contact": {
    "name": "nome do CFO/Diretor Financeiro/Controller",
    "title": "cargo",
    "linkedin_url": "URL do LinkedIn se encontrar",
    "email": "email se encontrar (padrao corporativo)",
    "phone": "telefone direto se encontrar"
  },
  "company_phone": "telefone principal da empresa",
  "company_email": "email geral ou financeiro",
  "website": "site da empresa",
  "address": "endereco completo",
  "recent_news": ["noticia 1", "noticia 2"],
  "fidc_potential": {
    "score": 85,
    "reasoning": "explicacao do potencial para FIDC",
    "estimated_receivables": "volume estimado de recebiveis",
    "avg_payment_term": "prazo medio de recebimento do setor"
  },
  "notes_for_prospector": "resumo executivo de 2-3 frases para o prospector"
}

Se nao encontrar algum campo, retorne null nele. Nao invente dados.`;

      actionsTaken.push('Pesquisou empresa via OpenAI + Web Search');
      const researchData = await callOpenAIJSON(researchPrompt, SYSTEM_PROMPTS.executeResearch, true);

      if (!researchData) {
        return res.json({
          success: false,
          actions_taken: actionsTaken,
          error: 'IA nao retornou dados validos. Tente novamente.',
          activity_completed: false,
        });
      }

      dataFound = researchData;

      try {
        const linkedinProspect = await resolveLinkedinProspect(deal, {
          personName: researchData.financial_contact?.name || deal.contact,
          company: researchData.company_name || deal.company || deal.title,
          titleHint: researchData.financial_contact?.title || '',
        });
        if (linkedinProspect?.linkedinUrl && !researchData.financial_contact?.linkedin_url) {
          researchData.financial_contact = researchData.financial_contact || {};
          researchData.financial_contact.linkedin_url = linkedinProspect.linkedinUrl;
          actionsTaken.push('Identificou perfil LinkedIn via Unipile');
        }
      } catch (err) {
        actionsTaken.push(`Busca LinkedIn via Unipile falhou: ${err.message}`);
      }

      // Write to Pipedrive
      const fc = researchData.financial_contact;

      // Update or create person
      if (fc && (fc.phone || fc.email || fc.name)) {
        if (deal.personId) {
          const personUpdate = {};
          if (fc.phone && !deal.phone) {
            personUpdate.phone = [{ value: fc.phone, primary: true, label: 'work' }];
          }
          if (fc.email && !deal.email) {
            personUpdate.email = [{ value: fc.email, primary: true, label: 'work' }];
          }
          if (Object.keys(personUpdate).length > 0) {
            const pRes = await pdPut(`/persons/${deal.personId}`, personUpdate);
            if (pRes.success) {
              cache.persons[deal.personId] = { ...cache.persons[deal.personId], ...pRes.data };
              actionsTaken.push(`Atualizou dados do contato no Pipedrive`);
            }
          }
          if (fc.name && fc.name !== deal.contact) {
            actionsTaken.push(`Encontrou contato financeiro: ${fc.name} (${fc.title || 'N/A'})`);
          }
        } else if (fc.name) {
          const newPerson = {
            name: fc.name,
            org_id: deal.orgId || undefined,
          };
          if (fc.email) newPerson.email = [{ value: fc.email, primary: true, label: 'work' }];
          if (fc.phone) newPerson.phone = [{ value: fc.phone, primary: true, label: 'work' }];

          const pRes = await pdPost('/persons', newPerson);
          if (pRes.success && pRes.data) {
            cache.persons[pRes.data.id] = pRes.data;
            await pdPut(`/deals/${deal.id}`, { person_id: pRes.data.id });
            const dIdx = cache.deals.findIndex(d => d.id === deal.id);
            if (dIdx !== -1) cache.deals[dIdx].person_id = pRes.data.id;
            actionsTaken.push(`Criou contato ${fc.name} e vinculou ao deal`);
          }
        }
      }

      // Update organization
      if (deal.orgId && researchData.address) {
        const orgUpdate = {};
        if (researchData.address) orgUpdate.address = researchData.address;
        if (Object.keys(orgUpdate).length > 0) {
          const oRes = await pdPut(`/organizations/${deal.orgId}`, orgUpdate);
          if (oRes.success) {
            cache.organizations[deal.orgId] = { ...cache.organizations[deal.orgId], ...oRes.data };
            actionsTaken.push('Atualizou endereco da organizacao');
          }
        }
      }

      // Add dossier note to deal
      const fidcPot = researchData.fidc_potential || {};
      const noteHtml = `<h3>Dossier IA - ${researchData.company_name || deal.company}</h3>
<p><b>Setor:</b> ${researchData.sector || 'N/A'}</p>
<p><b>Faturamento:</b> ${researchData.estimated_revenue || 'N/A'}</p>
<p><b>Produtos/Servicos:</b> ${researchData.products_services || 'N/A'}</p>
<p><b>Funcionarios:</b> ${researchData.employee_count || 'N/A'}</p>
<p><b>Contato Financeiro:</b> ${fc?.name || 'N/A'} - ${fc?.title || 'N/A'}</p>
<p><b>Tel:</b> ${fc?.phone || researchData.company_phone || 'N/A'} | <b>Email:</b> ${fc?.email || researchData.company_email || 'N/A'}</p>
<p><b>Website:</b> ${researchData.website || 'N/A'}</p>
<p><b>Endereco:</b> ${researchData.address || 'N/A'}</p>
<p><b>Potencial FIDC:</b> ${fidcPot.score || 'N/A'}/100 - ${fidcPot.reasoning || 'N/A'}</p>
<p><b>Recebiveis estimados:</b> ${fidcPot.estimated_receivables || 'N/A'}</p>
<p><b>Noticias:</b> ${(researchData.recent_news || []).filter(Boolean).join('; ') || 'N/A'}</p>
<p><b>Resumo:</b> ${researchData.notes_for_prospector || 'N/A'}</p>`;

      await pdPost('/notes', { deal_id: deal.id, content: noteHtml });
      actionsTaken.push('Adicionou nota com dossier completo ao deal');

      // Mark activity as done
      const completeRes = await pdPut(`/activities/${activity_id}`, { done: 1 });
      if (completeRes.success) {
        const aIdx = cache.activities.findIndex(a => a.id === activity_id);
        if (aIdx !== -1) cache.activities.splice(aIdx, 1);
        actionsTaken.push('Marcou atividade como concluida');
      }

      return res.json({
        success: true,
        task_type: 'research',
        actions_taken: actionsTaken,
        data_found: dataFound,
        activity_completed: true,
      });

    } else if (taskType === 'linkedin_note') {
      // ── LINKEDIN NOTE: Generate connection note ──
      const analysis = await analyzeLeadForOutreach(deal);
      const notePack = await generateConnectionNotePackage(deal, analysis);
      const note = notePack.variations.find(item => item.label === notePack.recommendedVariant)?.text || notePack.variations[0]?.text || '';
      let linkedinAction = null;

      if (analysis.fitClassification === 'DO_NOT_CONTACT' || analysis.fitClassification === 'LOW_FIT') {
        actionsTaken.push(`Lead classificado como ${analysis.fitClassification}; conexao bloqueada`);
        transitionOutreachState(deal, OUTREACH_STATES.DO_NOT_CONTACT, {
          promptType: 'linkedinNote',
          rationale: analysis.rationaleShort,
          output: analysis.raw,
          patch: {
            fitClassification: analysis.fitClassification,
            leadScore: analysis.leadScore,
            personaType: analysis.personaType,
            decisionPower: analysis.decisionPower,
            reasons: analysis.whyRelevant,
            risks: analysis.risks,
            tags: analysis.tags,
            rationaleShort: analysis.rationaleShort,
          },
        });
      } else if (CONFIG.outreach.autoSend && !CONFIG.outreach.requireHumanApproval) {
        try {
          const prospect = await resolveLinkedinProspect(deal);
          if (prospect?.providerId) {
            const inviteResult = await unipileInviteLinkedinProspect({ providerId: prospect.providerId, note });
            upsertLinkedinMemory(deal, {
              personName: prospect.personName || deal.contact,
              company: prospect.company || deal.company,
              providerId: prospect.providerId,
              linkedinUrl: prospect.linkedinUrl,
              status: 'invited',
              invitationSent: true,
              inviteMessage: note,
              source: 'task_linkedin_invite',
            });
            linkedinAction = {
              mode: 'invite_sent',
              provider_id: prospect.providerId,
              linkedin_url: prospect.linkedinUrl,
              result: inviteResult,
            };
            actionsTaken.push('Enviou solicitacao de conexao via Unipile');
            transitionOutreachState(deal, OUTREACH_STATES.CONNECTION_REQUEST_SENT, {
              promptType: 'linkedinNote',
              rationale: notePack.rationaleShort || analysis.rationaleShort,
              output: { analysis: analysis.raw, note_package: notePack.raw, linkedin_action: linkedinAction },
              patch: {
                fitClassification: analysis.fitClassification,
                leadScore: analysis.leadScore,
                personaType: analysis.personaType,
                decisionPower: analysis.decisionPower,
                selectedConnectionVariant: notePack.recommendedVariant,
                tags: analysis.tags,
                rationaleShort: notePack.rationaleShort || analysis.rationaleShort,
                followupDays: analysis.followupDays,
              },
            });
          } else {
            actionsTaken.push('Nao encontrou profile_id do LinkedIn para enviar conexao');
          }
        } catch (err) {
          actionsTaken.push(`Falha ao enviar conexao LinkedIn: ${err.message}`);
        }
      } else {
        actionsTaken.push('Modo aprovacao humana ativo; nota preparada sem envio automatico');
        transitionOutreachState(deal, OUTREACH_STATES.CONNECTION_NOTE_PENDING, {
          promptType: 'linkedinNote',
          rationale: notePack.rationaleShort || analysis.rationaleShort,
          output: { analysis: analysis.raw, note_package: notePack.raw },
          patch: {
            fitClassification: analysis.fitClassification,
            leadScore: analysis.leadScore,
            personaType: analysis.personaType,
            decisionPower: analysis.decisionPower,
            selectedConnectionVariant: notePack.recommendedVariant,
            tags: analysis.tags,
            rationaleShort: notePack.rationaleShort || analysis.rationaleShort,
            followupDays: analysis.followupDays,
          },
        });
      }
      await pdPost('/notes', {
        deal_id: deal.id,
        content: `<h3>Nota LinkedIn (IA)</h3><p>${note}</p>${linkedinAction?.linkedin_url ? `<p><b>Perfil:</b> ${linkedinAction.linkedin_url}</p>` : ''}`,
      });
      actionsTaken.push('Gerou nota de conexao LinkedIn');
      actionsTaken.push('Adicionou nota ao deal no Pipedrive');

      const completeRes = await pdPut(`/activities/${activity_id}`, { done: 1 });
      if (completeRes.success) {
        const aIdx = cache.activities.findIndex(a => a.id === activity_id);
        if (aIdx !== -1) cache.activities.splice(aIdx, 1);
        actionsTaken.push('Marcou atividade como concluida');
      }

      return res.json({
        success: true,
        task_type: 'linkedin_note',
        actions_taken: actionsTaken,
        data_found: { note, linkedin: linkedinAction, analysis, recommended_variant: notePack.recommendedVariant },
        activity_completed: true,
      });

    } else if (taskType === 'linkedin_message') {
      const result = await executeOutreachAction(deal, 'first_message', { forceSend: true });
      const executedAction = result.executedAction || 'first_message';
      const inviteFallback = executedAction === 'connection_note' && !!result.connectionRequired;
      const messagePack = result.messagePackage || result.draftPackage;
      const msg = result.messageDraft || result.draft;
      const linkedinAction = result.actionResult ? {
        mode: inviteFallback ? 'invite_sent' : 'message_sent',
        provider_id: result.prospect?.providerId || null,
        linkedin_url: result.prospect?.linkedinUrl || null,
        result: result.actionResult,
      } : null;

      await pdPost('/notes', {
        deal_id: deal.id,
        content: inviteFallback
          ? `<h3>Solicitacao LinkedIn (fallback da mensagem IA)</h3><p>${result.draft || ''}</p>${result.prospect?.linkedinUrl ? `<p><b>Perfil:</b> ${result.prospect.linkedinUrl}</p>` : ''}`
          : `<h3>Mensagem LinkedIn (IA)</h3><p>${msg || ''}</p>${result.prospect?.linkedinUrl ? `<p><b>Perfil:</b> ${result.prospect.linkedinUrl}</p>` : ''}`,
      });

      if (inviteFallback) {
        actionsTaken.push('Lead ainda nao conectado no LinkedIn; enviou solicitacao de conexao no lugar da mensagem');
        actionsTaken.push('Registrou fallback no deal do Pipedrive');
        const dueDate = computeFollowupDate(result.analysis?.followupDays || result.messagePackage?.followupDays || 5);
        const updatedActivity = await updatePipedriveActivity(activity_id, {
          subject: 'Aguardar aceitacao LinkedIn / enviar 1a mensagem',
          due_date: dueDate,
          note: 'Convite LinkedIn enviado automaticamente. Aguardar aceitacao antes da primeira mensagem.',
        });
        if (updatedActivity) {
          actionsTaken.push(`Reagendou atividade para ${dueDate}`);
        }
        return res.json({
          success: true,
          task_type: 'linkedin_message',
          executed_action: executedAction,
          actions_taken: actionsTaken,
          data_found: {
            invitation: result.draft,
            pending_message: result.messageDraft,
            linkedin: linkedinAction,
            analysis: result.analysis,
            recommended_variant: result.draftPackage?.recommendedVariant || null,
            pending_message_variant: result.messagePackage?.recommendedVariant || null,
          },
          activity_completed: false,
        });
      }

      if (result.sent) {
        actionsTaken.push('Enviou mensagem LinkedIn via Unipile');
      } else if (result.blocked) {
        actionsTaken.push(`Lead classificado como ${result.reason}; mensagem bloqueada`);
      } else {
        actionsTaken.push(`Mensagem nao enviada: ${result.reason || 'acao pendente'}`);
      }
      actionsTaken.push('Gerou mensagem LinkedIn pos-conexao');
      actionsTaken.push('Adicionou ao deal no Pipedrive');

      let activityCompleted = false;
      if (result.sent) {
        const completeRes = await pdPut(`/activities/${activity_id}`, { done: 1 });
        if (completeRes.success) {
          const aIdx = cache.activities.findIndex(a => a.id === activity_id);
          if (aIdx !== -1) cache.activities.splice(aIdx, 1);
          actionsTaken.push('Marcou atividade como concluida');
          activityCompleted = true;
        }
      }

      return res.json({
        success: true,
        task_type: 'linkedin_message',
        executed_action: executedAction,
        actions_taken: actionsTaken,
        data_found: { message: msg, linkedin: linkedinAction, analysis: result.analysis, recommended_variant: messagePack?.recommendedVariant || null },
        activity_completed: activityCompleted,
      });

    } else if (taskType === 'call') {
      // ── CALL: Generate script — do NOT mark as done ──
      const prompt = `Crie um roteiro de ligacao curto para prospeccao FIDC:
Empresa: ${deal.company}, Contato: ${deal.contact}
Inclua: abertura, qualificacao, proposta de valor, objecoes, fechamento.
Prospector: Gabriel Saganski - LAW Solucoes Financeiras.`;
      const script = await callOpenAI(prompt, SYSTEM_PROMPTS.callScript.replace(/Retorne APENAS.*$/, 'Responda com o roteiro.'));
      await pdPost('/notes', {
        deal_id: deal.id,
        content: `<h3>Script de Ligacao (IA)</h3><pre>${script}</pre>`,
      });
      actionsTaken.push('Gerou script de ligacao personalizado');
      actionsTaken.push('Adicionou script ao deal no Pipedrive');
      // NOTE: Do NOT mark call as completed — human must make the call

      return res.json({
        success: true,
        task_type: 'call',
        actions_taken: actionsTaken,
        data_found: { script },
        activity_completed: false,
      });

    } else if (taskType === 'email') {
      const prompt = `Gere um email de apresentacao FIDC para:
Empresa: ${deal.company}, Contato: ${deal.contact}
Email curto, profissional. Assinatura: Gabriel Saganski - LAW Solucoes Financeiras.`;
      const email = await callOpenAI(prompt);
      await pdPost('/notes', {
        deal_id: deal.id,
        content: `<h3>Email Template (IA)</h3><pre>${email}</pre>`,
      });
      actionsTaken.push('Gerou template de email personalizado');
      actionsTaken.push('Adicionou template ao deal no Pipedrive');

      const completeRes = await pdPut(`/activities/${activity_id}`, { done: 1 });
      if (completeRes.success) {
        const aIdx = cache.activities.findIndex(a => a.id === activity_id);
        if (aIdx !== -1) cache.activities.splice(aIdx, 1);
        actionsTaken.push('Marcou atividade como concluida');
      }

      return res.json({
        success: true,
        task_type: 'email',
        actions_taken: actionsTaken,
        data_found: { email },
        activity_completed: true,
      });
    }

    res.json({ success: false, error: 'Tipo de atividade nao reconhecido' });
  } catch (err) {
    console.error('[AI Execute Task] Error:', err.message);
    res.status(500).json({ success: false, error: err.message, actions_taken: [] });
  }
});

// ═══════════════════════════════════════════════════════════
// AI ENRICHMENT (0B — BATCH)
// ═══════════════════════════════════════════════════════════

async function performDealEnrichment(deal_id) {
  const dealRaw = cache.deals.find(d => d.id === deal_id);
  if (!dealRaw) return { success: false, deal_id, error: 'Deal not found' };

  const deal = enrichDeal(dealRaw);
  const historyMeta = getHistoryEntryForDeal(deal);
  if (isReusableEnrichmentEntry(historyMeta.entry)) {
    return {
      success: true,
      deal_id,
      skipped: true,
      reason: historyMeta.entry.status === 'seeded_from_logs' ? 'already_logged' : 'already_processed',
      fields_updated: [],
      data_found: null,
      history: historyMeta.entry,
    };
  }

  const before = { phone: deal.phone || null, email: deal.email || null, contact: deal.contact || null };
  const prompt = `Pesquise TUDO sobre a empresa "${deal.company || deal.title}" no Brasil.
Dados atuais: Contato: ${deal.contact || 'N/A'}, Tel: ${deal.phone || 'N/A'}, Email: ${deal.email || 'N/A'}

REGRAS CRITICAS PARA O CAMPO "pessoa":
- OBRIGATORIO encontrar telefone e email da pessoa. Sem telefone e email a automacao nao funciona.
- Busque uma pessoa da area FINANCEIRA da empresa. Cargos prioritarios (em ordem):
  1. CFO / Diretor Financeiro
  2. Gerente Financeiro
  3. Coordenador Financeiro
  4. Controller / Controladoria
  5. Diretor Administrativo
  6. Contador / Gerente de Contabilidade
- Se nao encontrar telefone direto da pessoa, use o telefone geral da empresa.
- Se nao encontrar email corporativo da pessoa, use o email geral/financeiro da empresa (ex: financeiro@empresa.com.br ou contato@empresa.com.br). NUNCA deixe email null.
- Tente encontrar o perfil LinkedIn da pessoa. Busque no LinkedIn por "nome cargo empresa".

RETORNE um JSON com TODOS estes campos (use null SOMENTE se realmente impossivel encontrar, NAO invente dados):
{
  "company": {
    "razao_social": "razao social completa",
    "nome_fantasia": "nome fantasia",
    "cnpj": "XX.XXX.XXX/XXXX-XX",
    "data_abertura": "DD/MM/AAAA",
    "faturamento_anual": "ex: R$ 500M",
    "num_funcionarios": "ex: 1.200",
    "num_filiais": "ex: 5",
    "segmento": "segmento de atuacao",
    "cnae_primario": "codigo e descricao do CNAE primario",
    "email": "email geral ou financeiro da empresa",
    "telefone": "telefone principal da empresa",
    "site": "website da empresa",
    "linkedin": "URL da pagina da empresa no LinkedIn",
    "cidade": "cidade da sede",
    "estado": "UF",
    "endereco": "endereco completo"
  },
  "pessoa": {
    "nome": "nome COMPLETO do decisor financeiro encontrado",
    "cargo": "cargo exato (CFO, Diretor Financeiro, Gerente Financeiro, Coordenador Financeiro, Controller, Diretor Adm, Contador, Gerente Contabilidade)",
    "telefone": "OBRIGATORIO - telefone direto ou celular da pessoa. Se nao achar, usar telefone da empresa",
    "email": "OBRIGATORIO - email corporativo da pessoa. Se nao achar, usar email geral da empresa (financeiro@ ou contato@)",
    "linkedin": "URL completa do perfil LinkedIn da pessoa (buscar no LinkedIn)"
  },
  "fidc_potential": {
    "score": 85,
    "reasoning": "por que esta empresa e boa para FIDC"
  },
  "resumo": "resumo executivo de 2-3 frases para o prospector"
}`;

  const data = await callOpenAIJSON(prompt, SYSTEM_PROMPTS.executeResearch, true);
  if (!data) {
    upsertEnrichmentHistory(deal, { status: 'failed', summary: 'IA nao retornou dados validos', source: 'enrichment' });
    return { success: false, deal_id, error: 'IA nao retornou dados', before, after: before, fields_updated: [], pipedrive_updates: [] };
  }

  const after = { ...before };
  const fieldsUpdated = [];
  const pipedriveUpdates = [];
  const pessoa = data.pessoa || {};
  const empresa = data.company || {};

  try {
    const linkedinProspect = await resolveLinkedinProspect(deal, {
      personName: pessoa.nome || deal.contact,
      company: empresa.nome_fantasia || empresa.razao_social || deal.company || deal.title,
      titleHint: pessoa.cargo || '',
    });
    if (linkedinProspect?.linkedinUrl && !pessoa.linkedin) pessoa.linkedin = linkedinProspect.linkedinUrl;
    if (linkedinProspect?.companyLinkedinUrl && !empresa.linkedin) empresa.linkedin = linkedinProspect.companyLinkedinUrl;
  } catch (err) {
    console.error('[UNIPILE] Enrichment resolve error:', err.message);
  }

  let outreachAnalysis = null;
  try {
    outreachAnalysis = await analyzeLeadForOutreach(deal, {
      contact: pessoa.nome || deal.contact,
      current_role: pessoa.cargo || null,
      company: empresa.nome_fantasia || empresa.razao_social || deal.company || deal.title,
      company_industry: empresa.segmento || null,
      company_size: empresa.num_funcionarios || null,
      website: empresa.site || null,
      crm_enrichment_notes: data.resumo || null,
    });
  } catch (err) {
    console.error('[OUTREACH] Lead analysis after enrichment failed:', err.message);
  }

  const dealUpdate = {};
  if (empresa.cnpj) { dealUpdate[PD_DEAL_FIELDS.cnpj] = empresa.cnpj; fieldsUpdated.push('CNPJ'); }
  if (empresa.nome_fantasia) { dealUpdate[PD_DEAL_FIELDS.nome_fantasia] = empresa.nome_fantasia; fieldsUpdated.push('Nome Fantasia'); }
  if (empresa.faturamento_anual) { dealUpdate[PD_DEAL_FIELDS.faturamento_anual] = empresa.faturamento_anual; fieldsUpdated.push('Faturamento Anual'); }
  if (empresa.num_funcionarios) { dealUpdate[PD_DEAL_FIELDS.num_funcionarios] = empresa.num_funcionarios; fieldsUpdated.push('Num Funcionarios'); }
  if (empresa.data_abertura) { dealUpdate[PD_DEAL_FIELDS.data_abertura] = empresa.data_abertura; fieldsUpdated.push('Data Abertura'); }
  if (empresa.num_filiais) { dealUpdate[PD_DEAL_FIELDS.num_filiais] = empresa.num_filiais; fieldsUpdated.push('Num Filiais'); }
  if (empresa.segmento) { dealUpdate[PD_DEAL_FIELDS.segmento] = empresa.segmento; fieldsUpdated.push('Segmento'); }
  if (empresa.cnae_primario) { dealUpdate[PD_DEAL_FIELDS.cnae_primario] = empresa.cnae_primario; fieldsUpdated.push('CNAE Primario'); }
  if (empresa.email) { dealUpdate[PD_DEAL_FIELDS.emails_empresa] = empresa.email; fieldsUpdated.push('Email Empresa'); }
  if (empresa.telefone) { dealUpdate[PD_DEAL_FIELDS.telefones_empresa] = empresa.telefone; fieldsUpdated.push('Tel Empresa'); }
  if (empresa.site) { dealUpdate[PD_DEAL_FIELDS.site] = empresa.site; fieldsUpdated.push('Site'); }
  if (empresa.linkedin) { dealUpdate[PD_DEAL_FIELDS.linkedin] = empresa.linkedin; fieldsUpdated.push('LinkedIn Empresa'); }
  if (empresa.cidade) { dealUpdate[PD_DEAL_FIELDS.cidade] = empresa.cidade; fieldsUpdated.push('Cidade'); }
  if (empresa.estado) { dealUpdate[PD_DEAL_FIELDS.estado] = empresa.estado; fieldsUpdated.push('Estado'); }

  if (Object.keys(dealUpdate).length > 0) {
    const dRes = await pdPut(`/deals/${deal.id}`, dealUpdate);
    if (dRes.success) {
      const dIdx = cache.deals.findIndex(d => d.id === deal.id);
      if (dIdx !== -1) cache.deals[dIdx] = { ...cache.deals[dIdx], ...dRes.data };
      pipedriveUpdates.push({ entity: 'deal', id: deal.id, fields: Object.keys(dealUpdate) });
    }
  }

  if (deal.personId) {
    const personUpdate = {};
    if (pessoa.telefone && !deal.phone) {
      personUpdate.phone = [{ value: pessoa.telefone, primary: true, label: 'work' }];
      after.phone = pessoa.telefone;
      fieldsUpdated.push('Tel Pessoa');
    }
    if (pessoa.email && !deal.email) {
      personUpdate.email = [{ value: pessoa.email, primary: true, label: 'work' }];
      after.email = pessoa.email;
      fieldsUpdated.push('Email Pessoa');
    }
    if (pessoa.cargo) { personUpdate[PD_PERSON_FIELDS.cargo] = pessoa.cargo; fieldsUpdated.push('Cargo'); }
    if (pessoa.linkedin) { personUpdate[PD_PERSON_FIELDS.linkedin_url] = pessoa.linkedin; fieldsUpdated.push('LinkedIn Pessoa'); }

    if (Object.keys(personUpdate).length > 0) {
      const pRes = await pdPut(`/persons/${deal.personId}`, personUpdate);
      if (pRes.success) {
        cache.persons[deal.personId] = { ...cache.persons[deal.personId], ...pRes.data };
        pipedriveUpdates.push({ entity: 'person', id: deal.personId, fields: Object.keys(personUpdate) });
      }
    }
  } else if (pessoa?.nome) {
    const newPerson = { name: pessoa.nome };
    if (deal.orgId) newPerson.org_id = deal.orgId;
    if (pessoa.email) { newPerson.email = [{ value: pessoa.email, primary: true, label: 'work' }]; after.email = pessoa.email; fieldsUpdated.push('Email Pessoa'); }
    if (pessoa.telefone) { newPerson.phone = [{ value: pessoa.telefone, primary: true, label: 'work' }]; after.phone = pessoa.telefone; fieldsUpdated.push('Tel Pessoa'); }
    if (pessoa.cargo) { newPerson[PD_PERSON_FIELDS.cargo] = pessoa.cargo; fieldsUpdated.push('Cargo'); }
    if (pessoa.linkedin) { newPerson[PD_PERSON_FIELDS.linkedin_url] = pessoa.linkedin; fieldsUpdated.push('LinkedIn Pessoa'); }

    const pRes = await pdPost('/persons', newPerson);
    if (pRes.success && pRes.data) {
      cache.persons[pRes.data.id] = pRes.data;
      await pdPut(`/deals/${deal.id}`, { person_id: pRes.data.id });
      const dIdx = cache.deals.findIndex(d => d.id === deal.id);
      if (dIdx !== -1) cache.deals[dIdx].person_id = pRes.data.id;
      after.contact = pessoa.nome;
      fieldsUpdated.push('Pessoa Criada');
      pipedriveUpdates.push({ entity: 'person', id: pRes.data.id, fields: ['created'] });
    }
  }

  if (deal.orgId && empresa.endereco) {
    const org = cache.organizations[deal.orgId] || {};
    if (!org.address) {
      const orgUpdate = { address: empresa.endereco };
      if (empresa.cidade) orgUpdate.address_locality = empresa.cidade;
      if (empresa.estado) orgUpdate.address_admin_area_level_1 = empresa.estado;
      const oRes = await pdPut(`/organizations/${deal.orgId}`, orgUpdate);
      if (oRes.success) {
        cache.organizations[deal.orgId] = { ...cache.organizations[deal.orgId], ...oRes.data };
        fieldsUpdated.push('Endereco Org');
        pipedriveUpdates.push({ entity: 'organization', id: deal.orgId, fields: ['address'] });
      }
    }
  }

  if (data.fidc_potential?.score != null) fieldsUpdated.push('FIDC Score');

  const uniqueFields = [...new Set(fieldsUpdated)];
  const history = upsertEnrichmentHistory(deal, {
    status: 'processed',
    companyName: empresa.razao_social || empresa.nome_fantasia || deal.company || deal.title,
    cnpj: empresa.cnpj,
    fieldsUpdated: uniqueFields,
    summary: data.resumo || null,
    score: data.fidc_potential?.score ?? null,
    source: 'enrichment',
  });

  if (outreachAnalysis) {
    transitionOutreachState(deal, outreachAnalysis.fitClassification === 'DO_NOT_CONTACT' ? OUTREACH_STATES.DO_NOT_CONTACT : OUTREACH_STATES.PROFILE_ENRICHED, {
      promptType: 'leadAnalyzer',
      rationale: outreachAnalysis.rationaleShort,
      output: outreachAnalysis.raw,
      patch: {
        fitClassification: outreachAnalysis.fitClassification,
        leadScore: outreachAnalysis.leadScore,
        personaType: outreachAnalysis.personaType,
        decisionPower: outreachAnalysis.decisionPower,
        reasons: outreachAnalysis.whyRelevant,
        risks: outreachAnalysis.risks,
        recommendedApproach: outreachAnalysis.recommendedApproach,
        connectionNoteAngle: outreachAnalysis.connectionNoteAngle,
        firstMessageAngle: outreachAnalysis.firstMessageAngle,
        ctaStrategy: outreachAnalysis.ctaStrategy,
        classifierConfidence: outreachAnalysis.confidence,
        followupDays: outreachAnalysis.followupDays,
        escalateToHuman: outreachAnalysis.escalateToHuman,
        tags: outreachAnalysis.tags,
        rationaleShort: outreachAnalysis.rationaleShort,
      },
    });
  }

  return {
    success: true,
    deal_id,
    before,
    after,
    fields_updated: uniqueFields,
    pipedrive_updates: pipedriveUpdates,
    data_found: data,
    history,
    outreach: outreachAnalysis,
  };
}

app.post('/api/ai/enrich-deal', async (req, res) => {
  const { deal_id } = req.body;

  try {
    return res.json(await performDealEnrichment(deal_id));
    const dealRaw = cache.deals.find(d => d.id === deal_id);
    if (!dealRaw) return res.status(404).json({ error: 'Deal not found' });

    const deal = enrichDeal(dealRaw);
    const before = { phone: deal.phone || null, email: deal.email || null, contact: deal.contact || null };

    const prompt = `Pesquise TUDO sobre a empresa "${deal.company || deal.title}" no Brasil.
Dados atuais: Contato: ${deal.contact || 'N/A'}, Tel: ${deal.phone || 'N/A'}, Email: ${deal.email || 'N/A'}

REGRAS CRITICAS PARA O CAMPO "pessoa":
- OBRIGATORIO encontrar telefone e email da pessoa. Sem telefone e email a automacao nao funciona.
- Busque uma pessoa da area FINANCEIRA da empresa. Cargos prioritarios (em ordem):
  1. CFO / Diretor Financeiro
  2. Gerente Financeiro
  3. Coordenador Financeiro
  4. Controller / Controladoria
  5. Diretor Administrativo
  6. Contador / Gerente de Contabilidade
- Se nao encontrar telefone direto da pessoa, use o telefone geral da empresa.
- Se nao encontrar email corporativo da pessoa, use o email geral/financeiro da empresa (ex: financeiro@empresa.com.br ou contato@empresa.com.br). NUNCA deixe email null.
- Tente encontrar o perfil LinkedIn da pessoa. Busque no LinkedIn por "nome cargo empresa".

RETORNE um JSON com TODOS estes campos (use null SOMENTE se realmente impossivel encontrar, NAO invente dados):
{
  "company": {
    "razao_social": "razao social completa",
    "nome_fantasia": "nome fantasia",
    "cnpj": "XX.XXX.XXX/XXXX-XX",
    "data_abertura": "DD/MM/AAAA",
    "faturamento_anual": "ex: R$ 500M",
    "num_funcionarios": "ex: 1.200",
    "num_filiais": "ex: 5",
    "segmento": "segmento de atuacao",
    "cnae_primario": "codigo e descricao do CNAE primario",
    "email": "email geral ou financeiro da empresa",
    "telefone": "telefone principal da empresa",
    "site": "website da empresa",
    "linkedin": "URL da pagina da empresa no LinkedIn",
    "cidade": "cidade da sede",
    "estado": "UF",
    "endereco": "endereco completo"
  },
  "pessoa": {
    "nome": "nome COMPLETO do decisor financeiro encontrado",
    "cargo": "cargo exato (CFO, Diretor Financeiro, Gerente Financeiro, Coordenador Financeiro, Controller, Diretor Adm, Contador, Gerente Contabilidade)",
    "telefone": "OBRIGATORIO - telefone direto ou celular da pessoa. Se nao achar, usar telefone da empresa",
    "email": "OBRIGATORIO - email corporativo da pessoa. Se nao achar, usar email geral da empresa (financeiro@ ou contato@)",
    "linkedin": "URL completa do perfil LinkedIn da pessoa (buscar no LinkedIn)"
  },
  "fidc_potential": {
    "score": 85,
    "reasoning": "por que esta empresa e boa para FIDC"
  },
  "resumo": "resumo executivo de 2-3 frases para o prospector"
}`;

    const data = await callOpenAIJSON(prompt, SYSTEM_PROMPTS.executeResearch, true);
    if (!data) {
      return res.json({ success: false, deal_id, error: 'IA nao retornou dados', before, after: before, fields_updated: [], pipedrive_updates: [] });
    }

    const after = { ...before };
    const fieldsUpdated = [];
    const pipedriveUpdates = [];
    const pessoa = data.pessoa || {};
    const empresa = data.company || {};

    // ══════════════════════════════════════════════════════
    // 1. UPDATE DEAL CUSTOM FIELDS (sidebar fields)
    // ══════════════════════════════════════════════════════
    const dealUpdate = {};
    if (empresa.cnpj) { dealUpdate[PD_DEAL_FIELDS.cnpj] = empresa.cnpj; fieldsUpdated.push('CNPJ'); }
    if (empresa.nome_fantasia) { dealUpdate[PD_DEAL_FIELDS.nome_fantasia] = empresa.nome_fantasia; fieldsUpdated.push('Nome Fantasia'); }
    if (empresa.faturamento_anual) { dealUpdate[PD_DEAL_FIELDS.faturamento_anual] = empresa.faturamento_anual; fieldsUpdated.push('Faturamento Anual'); }
    if (empresa.num_funcionarios) { dealUpdate[PD_DEAL_FIELDS.num_funcionarios] = empresa.num_funcionarios; fieldsUpdated.push('Num Funcionarios'); }
    if (empresa.data_abertura) { dealUpdate[PD_DEAL_FIELDS.data_abertura] = empresa.data_abertura; fieldsUpdated.push('Data Abertura'); }
    if (empresa.num_filiais) { dealUpdate[PD_DEAL_FIELDS.num_filiais] = empresa.num_filiais; fieldsUpdated.push('Num Filiais'); }
    if (empresa.segmento) { dealUpdate[PD_DEAL_FIELDS.segmento] = empresa.segmento; fieldsUpdated.push('Segmento'); }
    if (empresa.cnae_primario) { dealUpdate[PD_DEAL_FIELDS.cnae_primario] = empresa.cnae_primario; fieldsUpdated.push('CNAE Primario'); }
    if (empresa.email) { dealUpdate[PD_DEAL_FIELDS.emails_empresa] = empresa.email; fieldsUpdated.push('Email Empresa'); }
    if (empresa.telefone) { dealUpdate[PD_DEAL_FIELDS.telefones_empresa] = empresa.telefone; fieldsUpdated.push('Tel Empresa'); }
    if (empresa.site) { dealUpdate[PD_DEAL_FIELDS.site] = empresa.site; fieldsUpdated.push('Site'); }
    if (empresa.linkedin) { dealUpdate[PD_DEAL_FIELDS.linkedin] = empresa.linkedin; fieldsUpdated.push('LinkedIn Empresa'); }
    if (empresa.cidade) { dealUpdate[PD_DEAL_FIELDS.cidade] = empresa.cidade; fieldsUpdated.push('Cidade'); }
    if (empresa.estado) { dealUpdate[PD_DEAL_FIELDS.estado] = empresa.estado; fieldsUpdated.push('Estado'); }

    if (Object.keys(dealUpdate).length > 0) {
      const dRes = await pdPut(`/deals/${deal.id}`, dealUpdate);
      if (dRes.success) {
        const dIdx = cache.deals.findIndex(d => d.id === deal.id);
        if (dIdx !== -1) cache.deals[dIdx] = { ...cache.deals[dIdx], ...dRes.data };
        pipedriveUpdates.push({ entity: 'deal', id: deal.id, fields: Object.keys(dealUpdate) });
      }
    }

    // ══════════════════════════════════════════════════════
    // 2. UPDATE OR CREATE PERSON (sidebar Pessoa)
    // ══════════════════════════════════════════════════════
    if (deal.personId) {
      // Person exists: update with found data
      const personUpdate = {};
      if (pessoa.telefone && !deal.phone) {
        personUpdate.phone = [{ value: pessoa.telefone, primary: true, label: 'work' }];
        after.phone = pessoa.telefone;
        fieldsUpdated.push('Tel Pessoa');
      }
      if (pessoa.email && !deal.email) {
        personUpdate.email = [{ value: pessoa.email, primary: true, label: 'work' }];
        after.email = pessoa.email;
        fieldsUpdated.push('Email Pessoa');
      }
      if (pessoa.cargo) { personUpdate[PD_PERSON_FIELDS.cargo] = pessoa.cargo; fieldsUpdated.push('Cargo'); }
      if (pessoa.linkedin) { personUpdate[PD_PERSON_FIELDS.linkedin_url] = pessoa.linkedin; fieldsUpdated.push('LinkedIn Pessoa'); }

      if (Object.keys(personUpdate).length > 0) {
        const pRes = await pdPut(`/persons/${deal.personId}`, personUpdate);
        if (pRes.success) {
          cache.persons[deal.personId] = { ...cache.persons[deal.personId], ...pRes.data };
          pipedriveUpdates.push({ entity: 'person', id: deal.personId, fields: Object.keys(personUpdate) });
        }
      }
    } else if (pessoa?.nome) {
      // NO person: CREATE with all data and link to deal
      const newPerson = { name: pessoa.nome };
      if (deal.orgId) newPerson.org_id = deal.orgId;
      if (pessoa.email) { newPerson.email = [{ value: pessoa.email, primary: true, label: 'work' }]; after.email = pessoa.email; fieldsUpdated.push('Email Pessoa'); }
      if (pessoa.telefone) { newPerson.phone = [{ value: pessoa.telefone, primary: true, label: 'work' }]; after.phone = pessoa.telefone; fieldsUpdated.push('Tel Pessoa'); }
      if (pessoa.cargo) { newPerson[PD_PERSON_FIELDS.cargo] = pessoa.cargo; fieldsUpdated.push('Cargo'); }
      if (pessoa.linkedin) { newPerson[PD_PERSON_FIELDS.linkedin_url] = pessoa.linkedin; fieldsUpdated.push('LinkedIn Pessoa'); }

      const pRes = await pdPost('/persons', newPerson);
      if (pRes.success && pRes.data) {
        cache.persons[pRes.data.id] = pRes.data;
        await pdPut(`/deals/${deal.id}`, { person_id: pRes.data.id });
        const dIdx = cache.deals.findIndex(d => d.id === deal.id);
        if (dIdx !== -1) cache.deals[dIdx].person_id = pRes.data.id;
        after.contact = pessoa.nome;
        fieldsUpdated.push('Pessoa Criada');
        pipedriveUpdates.push({ entity: 'person', id: pRes.data.id, fields: ['created'] });
      }
    }

    // ══════════════════════════════════════════════════════
    // 3. UPDATE ORGANIZATION (address)
    // ══════════════════════════════════════════════════════
    if (deal.orgId && empresa.endereco) {
      const org = cache.organizations[deal.orgId] || {};
      if (!org.address) {
        const orgUpdate = { address: empresa.endereco };
        if (empresa.cidade) orgUpdate.address_locality = empresa.cidade;
        if (empresa.estado) orgUpdate.address_admin_area_level_1 = empresa.estado;
        const oRes = await pdPut(`/organizations/${deal.orgId}`, orgUpdate);
        if (oRes.success) {
          cache.organizations[deal.orgId] = { ...cache.organizations[deal.orgId], ...oRes.data };
          fieldsUpdated.push('Endereco Org');
          pipedriveUpdates.push({ entity: 'organization', id: deal.orgId, fields: ['address'] });
        }
      }
    }

    if (data.fidc_potential?.score) fieldsUpdated.push('FIDC Score');

    const uniqueFields = [...new Set(fieldsUpdated)];

    res.json({
      success: true,
      deal_id,
      before,
      after,
      fields_updated: uniqueFields,
      pipedrive_updates: pipedriveUpdates,
      data_found: data,
    });
  } catch (err) {
    console.error('[AI Enrich Deal] Error:', err.message);
    res.status(500).json({ success: false, deal_id, error: err.message });
  }
});

// ── APPROVE AND MOVE: move to prospection + write dossier note + complete research task ──
app.post('/api/ai/approve-and-move', async (req, res) => {
  const { deal_id, target_stage_id, enrich_data } = req.body;

  try {
    const dealRaw = cache.deals.find(d => d.id === deal_id);
    if (!dealRaw) return res.status(404).json({ error: 'Deal not found' });
    const deal = enrichDeal(dealRaw);
    const actions = [];

    // 1. Write full dossier note to Pipedrive
    if (enrich_data) {
      const emp = enrich_data.company || {};
      const pes = enrich_data.pessoa || {};
      const fidc = enrich_data.fidc_potential || {};

      const noteHtml = `<h3>Dossier IA - ${emp.razao_social || emp.nome_fantasia || deal.company}</h3>
<p><b>Nome Fantasia:</b> ${emp.nome_fantasia || 'N/A'}</p>
<p><b>CNPJ:</b> ${emp.cnpj || 'N/A'} | <b>Data Abertura:</b> ${emp.data_abertura || 'N/A'}</p>
<p><b>Faturamento Anual:</b> ${emp.faturamento_anual || 'N/A'} | <b>Funcionarios:</b> ${emp.num_funcionarios || 'N/A'} | <b>Filiais:</b> ${emp.num_filiais || 'N/A'}</p>
<p><b>Segmento:</b> ${emp.segmento || 'N/A'}</p>
<p><b>CNAE Primario:</b> ${emp.cnae_primario || 'N/A'}</p>
<p><b>Tel Empresa:</b> ${emp.telefone || 'N/A'} | <b>Email Empresa:</b> ${emp.email || 'N/A'}</p>
<p><b>Site:</b> ${emp.site || 'N/A'} | <b>LinkedIn:</b> ${emp.linkedin || 'N/A'}</p>
<p><b>Endereco:</b> ${emp.endereco || 'N/A'} - ${emp.cidade || ''} / ${emp.estado || ''}</p>
<hr/>
<p><b>Contato:</b> ${pes.nome || 'N/A'} - ${pes.cargo || 'N/A'}</p>
<p><b>Tel Contato:</b> ${pes.telefone || 'N/A'} | <b>Email:</b> ${pes.email || 'N/A'}</p>
<p><b>LinkedIn:</b> ${pes.linkedin || 'N/A'}</p>
<hr/>
<p><b>Potencial FIDC:</b> ${fidc.score || 'N/A'}/100 - ${fidc.reasoning || 'N/A'}</p>
<p><b>Resumo:</b> ${enrich_data.resumo || 'N/A'}</p>`;

      const nRes = await pdPost('/notes', { deal_id, content: noteHtml });
      if (nRes.success) actions.push('Nota com dossier completo adicionada ao deal');
    }

    // 2. Move deal to target stage
    if (target_stage_id) {
      const mRes = await pdPut(`/deals/${deal_id}`, { stage_id: target_stage_id });
      if (mRes.success) {
        const dIdx = cache.deals.findIndex(d => d.id === deal_id);
        if (dIdx !== -1) cache.deals[dIdx].stage_id = target_stage_id;
        actions.push('Deal movido para Prospeccao Etapa 1');
      }
    }

    // 3. Find and complete the "Pesquisa" activity for this deal
    const researchActivity = cache.activities.find(a =>
      a.deal_id === deal_id && !a.done &&
      (/pesquis/i.test(a.subject || '') || (a.type === 'task' && /cliente|lead/i.test(a.subject || '')))
    );

    if (researchActivity) {
      const cRes = await pdPut(`/activities/${researchActivity.id}`, { done: 1 });
      if (cRes.success) {
        const aIdx = cache.activities.findIndex(a => a.id === researchActivity.id);
        if (aIdx !== -1) cache.activities.splice(aIdx, 1);
        actions.push(`Tarefa "${researchActivity.subject}" marcada como concluida`);
      }
    }

    upsertEnrichmentHistory(deal, {
      status: 'approved',
      companyName: enrich_data?.company?.razao_social || enrich_data?.company?.nome_fantasia || deal.company || deal.title,
      cnpj: enrich_data?.company?.cnpj || deal.cnpj,
      fieldsUpdated: [],
      summary: enrich_data?.resumo || null,
      score: enrich_data?.fidc_potential?.score ?? null,
      source: 'approval',
    });

    res.json({ success: true, deal_id, actions });
  } catch (err) {
    console.error('[Approve and Move] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/ai/enrich-batch', async (req, res) => {
  const { deal_ids } = req.body;
  if (!Array.isArray(deal_ids) || deal_ids.length === 0) {
    return res.status(400).json({ error: 'deal_ids array required' });
  }

  const batchResults = [];
  let batchProcessed = 0;
  let batchUpdated = 0;
  let batchFailed = 0;
  let batchSkipped = 0;

  for (const dealId of deal_ids) {
    try {
      const enrichRes = await performDealEnrichment(dealId);
      batchResults.push(enrichRes);
      batchProcessed++;
      if (enrichRes.skipped) batchSkipped++;
      else if (enrichRes.success && enrichRes.fields_updated?.length > 0) batchUpdated++;
      else if (!enrichRes.success) batchFailed++;
    } catch (err) {
      batchResults.push({ success: false, deal_id: dealId, error: err.message });
      batchFailed++;
      batchProcessed++;
    }

    if (batchProcessed < deal_ids.length) {
      await new Promise(r => setTimeout(r, 1200));
    }
  }

  return res.json({
    results: batchResults,
    summary: {
      processed: batchProcessed,
      updated: batchUpdated,
      failed: batchFailed,
      skipped: batchSkipped,
      unchanged: batchProcessed - batchUpdated - batchFailed - batchSkipped,
    },
  });
});

// ═══════════════════════════════════════════════════════════
// SERVE FRONTEND
// ═══════════════════════════════════════════════════════════
app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
});

// ═══════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════
app.listen(CONFIG.port, CONFIG.host, async () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════╗');
  console.log('  ║                                                  ║');
  console.log('  ║   LAW COMMAND CENTER v3.0                        ║');
  console.log('  ║   FIDC Prospecting Intelligence                  ║');
  console.log('  ║                                                  ║');
  console.log(`  ║   http://localhost:${CONFIG.port}                         ║`);
  console.log('  ║                                                  ║');
  console.log(`  ║   Pipedrive: ${CONFIG.pipedrive.token ? 'CONNECTED' : 'NOT CONFIGURED'}                      ║`);
  console.log(`  ║   OpenAI: ${CONFIG.openai.key ? 'CONNECTED' : 'NOT CONFIGURED'}                         ║`);
  console.log('  ║                                                  ║');
  console.log('  ╚══════════════════════════════════════════════════╝');
  console.log('');
  console.log(`[HISTORY] reusable records: ${Object.values(enrichmentHistory).filter((entry, index, arr) =>
    entry?.companyKey &&
    arr.findIndex(item => item?.companyKey === entry.companyKey) === index &&
    isReusableEnrichmentEntry(entry)
  ).length} | log seeds: ${enrichmentLogBackfill.seedsCreated}/${enrichmentLogBackfill.scannedFiles}`);
  console.log(`[SECURITY] auth: ${CONFIG.security.apiBearerToken || (CONFIG.security.basicAuthUser && CONFIG.security.basicAuthPassword) ? 'ENABLED' : 'DISABLED'} | timezone: ${CONFIG.security.businessTimezone}`);

  try {
    await syncAll();
  } catch (err) {
    console.error('[STARTUP] Initial sync failed:', err.message);
    cache.syncError = err.message;
  }

  cron.schedule(`*/${CONFIG.syncInterval} * * * *`, async () => {
    console.log('[CRON] Scheduled sync...');
    try {
      await syncAll();
    } catch (err) {
      console.error('[CRON] Sync failed:', err.message);
      cache.syncError = err.message;
    }
  });
});
