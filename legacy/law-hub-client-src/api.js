const BASE = '/api';

function getAuthHeaders() {
  const envToken = import.meta.env.VITE_API_BEARER_TOKEN;
  const storedToken = typeof window !== 'undefined' ? window.localStorage.getItem('LAW_API_TOKEN') : '';
  const token = envToken || storedToken;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...options.headers },
    ...options,
  });

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const message = typeof payload === 'object'
      ? payload?.error || payload?.message || `HTTP ${res.status}`
      : payload || `HTTP ${res.status}`;
    const error = new Error(message);
    error.status = res.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export const api = {
  // Status
  status: () => request('/status'),
  sync: () => request('/sync', { method: 'POST' }),

  // Dashboard
  dashboard: () => request('/dashboard'),

  // Deals
  deals: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/deals?${qs}`);
  },
  deal: (id) => request(`/deals/${id}`),
  dealActivities: (id) => request(`/deals/${id}/activities`),
  dealNotes: (id) => request(`/deals/${id}/notes`),
  moveStage: (id, stageId) => request(`/deals/${id}/stage`, {
    method: 'PUT', body: JSON.stringify({ stage_id: stageId }),
  }),
  updateDeal: (id, data) => request(`/deals/${id}`, {
    method: 'PUT', body: JSON.stringify(data),
  }),
  setDealStatus: (id, status, lost_reason) => request(`/deals/${id}/status`, {
    method: 'PUT', body: JSON.stringify({ status, lost_reason }),
  }),
  setDealLost: (id, reason) => request(`/deals/${id}/lost`, {
    method: 'PUT', body: JSON.stringify({ lost_reason: reason }),
  }),
  setDealWon: (id) => request(`/deals/${id}/won`, { method: 'PUT' }),
  addNote: (id, content) => request(`/deals/${id}/notes`, {
    method: 'POST', body: JSON.stringify({ content }),
  }),
  addActivity: (id, data) => request(`/deals/${id}/activities`, {
    method: 'POST', body: JSON.stringify(data),
  }),

  // Activities
  activities: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/activities?${qs}`);
  },
  completeActivity: (id) => request(`/activities/${id}/complete`, { method: 'PUT' }),

  // Stages
  stages: () => request('/stages'),

  // Scan incomplete deals
  scanIncomplete: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/deals/scan/incomplete?${qs}`);
  },
  enrichmentHistory: () => request('/enrichment/history'),
  unipileAccounts: () => request('/unipile/accounts'),
  unipileLinkedinSearch: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/unipile/linkedin/search?${qs}`);
  },
  unipileLinkedinInvite: (data) => request('/unipile/linkedin/invite', {
    method: 'POST', body: JSON.stringify(data),
  }),
  unipileLinkedinMessage: (data) => request('/unipile/linkedin/message', {
    method: 'POST', body: JSON.stringify(data),
  }),
  outreachState: (dealId) => request(`/outreach/state/${dealId}`),
  outreachAnalyze: (data) => request('/outreach/analyze', {
    method: 'POST', body: JSON.stringify(data),
  }),
  outreachExecute: (data) => request('/outreach/execute', {
    method: 'POST', body: JSON.stringify(data),
  }),
  outreachQueue: () => request('/outreach/queue'),
  outreachReply: (data) => request('/outreach/reply', {
    method: 'POST', body: JSON.stringify(data),
  }),

  // AI
  aiGenerate: (prompt, system, useSearch) => request('/ai/generate', {
    method: 'POST', body: JSON.stringify({ prompt, system, useSearch }),
  }),
  aiLinkedin: (data) => request('/ai/linkedin-note', {
    method: 'POST', body: JSON.stringify(data),
  }),
  aiLinkedinMessage: (data) => request('/ai/linkedin-message', {
    method: 'POST', body: JSON.stringify(data),
  }),
  aiResearch: (data) => request('/ai/research', {
    method: 'POST', body: JSON.stringify(data),
  }),
  aiCallScript: (data) => request('/ai/call-script', {
    method: 'POST', body: JSON.stringify(data),
  }),
  aiEmail: (data) => request('/ai/email-draft', {
    method: 'POST', body: JSON.stringify(data),
  }),
  aiExecuteTask: (activity_id, deal_id) => request('/ai/execute-task', {
    method: 'POST', body: JSON.stringify({ activity_id, deal_id }),
  }),
  aiEnrichDeal: (deal_id) => request('/ai/enrich-deal', {
    method: 'POST', body: JSON.stringify({ deal_id }),
  }),
  aiEnrichBatch: (deal_ids) => request('/ai/enrich-batch', {
    method: 'POST', body: JSON.stringify({ deal_ids }),
  }),
  aiApproveAndMove: (deal_id, target_stage_id, enrich_data) => request('/ai/approve-and-move', {
    method: 'POST', body: JSON.stringify({ deal_id, target_stage_id, enrich_data }),
  }),
};
