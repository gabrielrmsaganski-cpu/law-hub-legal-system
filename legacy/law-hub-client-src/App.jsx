import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { api } from './api.js'
import { formatBusinessDate, getBusinessDateString } from './date.js'
import lawBrandImage from './assets/branding/law-brand-mark.svg'

// ═══ HELPERS ═══
function cn(...c) { return c.filter(Boolean).join(' ') }
function copyText(t) { navigator.clipboard.writeText(t) }
function fmtDate(d) { return formatBusinessDate(d, { day: '2-digit', month: 'short' }) }
function fmtDateTime(d) { return formatBusinessDate(d, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) }
function fmtCurrency(v) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(v || 0) }
function timeAgo(d) {
  if (!d) return '';
  const mins = Math.floor((Date.now() - new Date(d)) / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

const PANEL_PREFS = {
  tab: 'law.pref.tab',
  detailTab: 'law.pref.detailTab',
  stageFilter: 'law.pref.stageFilter',
  focusMode: 'law.pref.focusMode',
}

function readPanelPref(key, fallback) {
  if (typeof window === 'undefined') return fallback
  try {
    const value = window.localStorage.getItem(key)
    return value ?? fallback
  } catch {
    return fallback
  }
}

function writePanelPref(key, value) {
  if (typeof window === 'undefined') return
  try {
    if (value === '' || value == null) {
      window.localStorage.removeItem(key)
      return
    }
    window.localStorage.setItem(key, value)
  } catch {}
}

function formatStateLabel(value) {
  if (!value) return 'Sem estado'
  return String(value)
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

// ═══ SVG ICONS ═══
const I = ({ d, size = 16, cls = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
)
const ic = {
  phone: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z',
  mail: ['M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z', 'M22 6l-10 7L2 6'],
  search: ['M21 21l-4.35-4.35', 'M11 19a8 8 0 100-16 8 8 0 000 16z'],
  check: 'M20 6L9 17l-5-5',
  zap: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  refresh: ['M1 4v6h6', 'M23 20v-6h-6', 'M20.49 9A9 9 0 005.64 5.64L1 10', 'M23 14l-4.64 4.36A9 9 0 013.51 15'],
  chevRight: 'M9 18l6-6-6-6',
  chevDown: 'M6 9l6 6 6-6',
  target: ['M12 22a10 10 0 100-20 10 10 0 000 20z', 'M12 18a6 6 0 100-12 6 6 0 000 12z', 'M12 14a2 2 0 100-4 2 2 0 000 4z'],
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  users: ['M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2', 'M9 7a4 4 0 100-8 4 4 0 000 8z', 'M23 21v-2a4 4 0 00-3-3.87', 'M16 3.13a4 4 0 010 7.75'],
  calendar: ['M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2z', 'M16 2v4', 'M8 2v4', 'M3 10h18'],
  layers: ['M12 2L2 7l10 5 10-5-10-5z', 'M2 17l10 5 10-5', 'M2 12l10 5 10-5'],
  x: ['M18 6L6 18', 'M6 6l12 12'],
  plus: ['M12 5v14', 'M5 12h14'],
  send: ['M22 2L11 13', 'M22 2l-7 20-4-9-9-4 20-7z'],
  clock: ['M12 22a10 10 0 100-20 10 10 0 000 20z', 'M12 6v6l4 2'],
  alert: ['M12 22a10 10 0 100-20 10 10 0 000 20z', 'M12 8v4', 'M12 16h.01'],
  arrowUp: ['M12 19V5', 'M5 12l7-7 7 7'],
  arrowRight: ['M5 12h14', 'M12 5l7 7-7 7'],
  star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  brain: ['M12 2a7 7 0 017 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 01-2 2h-4a2 2 0 01-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 017-7z', 'M9 22h6'],
  bar: ['M18 20V10', 'M12 20V4', 'M6 20v-6'],
  link: ['M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71'],
  inbox: ['M22 12h-6l-2 3H10l-2-3H2', 'M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z'],
  eye: ['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z', 'M12 15a3 3 0 100-6 3 3 0 000 6z'],
  bot: ['M12 2a2 2 0 012 2v2a2 2 0 01-2 2 2 2 0 01-2-2V4a2 2 0 012-2z', 'M5 10h14a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2z', 'M9 15h.01', 'M15 15h.01'],
  grid: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z'],
  download: ['M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
  trash: ['M3 6h18', 'M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2'],
  edit: ['M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7', 'M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z'],
}

const STAGE_COLORS = ['#6b7280', '#f59e0b', '#3b82f6', '#8b5cf6', '#10b981', '#ef4444', '#ec4899', '#06b6d4']

// ═══ CADENCE STEPS ═══
const CADENCE = [
  { key: 'pesquisa', label: 'Pesquisa', match: s => /pesquis|research/i.test(s) },
  { key: 'linkedin_note', label: 'LinkedIn Conexao', match: s => /linkedin.*conex|nota.*linkedin|conexao/i.test(s) },
  { key: 'call_am', label: 'Ligacao Manha', match: s => /liga.*manha|call.*morn/i.test(s) },
  { key: 'email', label: 'Email', match: s => /e-?mail/i.test(s) },
  { key: 'call_pm', label: 'Ligacao Tarde', match: s => /liga.*tarde|call.*after/i.test(s) },
  { key: 'linkedin_msg', label: 'Msg LinkedIn', match: s => /mensag.*linkedin|linkedin.*mensag|linkedin.*msg|apresenta/i.test(s) },
  { key: 'followup', label: 'Follow-up', match: s => /follow|retorno|acompanha/i.test(s) },
  { key: 'meeting', label: 'Reuniao', match: s => /reuni|meeting/i.test(s) },
]

function getCadenceProgress(dealActivities, allActivities) {
  const done = allActivities || []
  return CADENCE.map(step => {
    const found = done.find(a => step.match(a.subject || ''))
    return { ...step, done: !!found, date: found?.marked_as_done_time || found?.update_time }
  })
}

// ═══ ACTIVITY TYPE DETECTION ═══
function getActivityAILabel(act) {
  const s = (act.subject || '').toLowerCase()
  const t = (act.type || '').toLowerCase()
  if (s.includes('pesquis') || s.includes('research') || (t === 'task' && s.includes('lead'))) return { label: 'Pesquisar & Preencher', type: 'research', icon: '?' }
  if (s.includes('linkedin') && (s.includes('mensag') || s.includes('apresenta'))) return { label: 'Gerar Msg LinkedIn', type: 'linkedin_message', icon: 'in' }
  if (s.includes('linkedin') || s.includes('conexao') || s.includes('conexão')) return { label: 'Gerar Nota LinkedIn', type: 'linkedin_note', icon: 'in' }
  if (s.includes('ligacao') || s.includes('ligação') || s.includes('call') || t === 'call') return { label: 'Preparar Script', type: 'call', icon: 'S' }
  if (s.includes('email') || s.includes('e-mail') || t === 'email') return { label: 'Gerar Template', type: 'email', icon: '@' }
  return { label: 'IA Executar', type: 'research', icon: '?' }
}

// ═══ MICRO COMPONENTS ═══
function Spinner({ size = 16 }) {
  return <div className="border-2 border-slate-200 border-t-[#d4a017] rounded-full animate-spin-slow" style={{ width: size, height: size }} />
}

function Badge({ children, color = '#6b7280', pulse }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: color + '18', color, border: `1px solid ${color}30` }}>
      {pulse && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: color }} />}
      {children}
    </span>
  )
}

function Stat({ icon, label, value, sub, accent, onClick }) {
  return (
    <div onClick={onClick}
      className={cn(
        'relative overflow-hidden rounded-[22px] border p-4 transition-all duration-300 group shadow-[0_14px_34px_rgba(15,23,42,0.05)]',
        onClick && 'cursor-pointer',
        accent ? 'border-[#d4a017]/20 bg-[linear-gradient(135deg,rgba(212,160,23,0.14),rgba(255,255,255,0.95))] hover:border-[#d4a017]/40' : 'border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300'
      )}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-slate-400 mb-1.5">{label}</div>
          <div className={cn('text-2xl font-black font-mono tracking-tight', accent ? 'text-[#b88900]' : 'text-slate-800')}>{value}</div>
          {sub && <div className="text-[10px] text-slate-500 mt-1">{sub}</div>}
        </div>
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110', accent ? 'bg-[#d4a017]/15 text-[#b88900]' : 'bg-slate-100 text-slate-500')}>
          <I d={icon} size={16} />
        </div>
      </div>
    </div>
  )
}

function SignalTile({ label, value, sub, color = '#11263a' }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 shadow-sm">
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-black font-mono" style={{ color }}>{value}</div>
      {sub && <div className="mt-1 text-[10px] text-slate-500">{sub}</div>}
    </div>
  )
}

function EmptyState({ icon, title, sub }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mb-4 text-slate-400">
        <I d={icon} size={28} />
      </div>
      <p className="text-sm font-medium text-slate-600 mb-1">{title}</p>
      {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
    </div>
  )
}

// ═══ TOAST SYSTEM ═══
let toastId = 0
function useToasts() {
  const [toasts, setToasts] = useState([])
  const add = useCallback((message, type = 'success') => {
    const id = ++toastId
    setToasts(p => [...p, { id, message, type, exiting: false }])
    setTimeout(() => {
      setToasts(p => p.map(t => t.id === id ? { ...t, exiting: true } : t))
      setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 300)
    }, 3000)
  }, [])
  return { toasts, addToast: add }
}

function ToastContainer({ toasts }) {
  return (
    <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className={cn(
          'pointer-events-auto px-4 py-2.5 rounded-xl shadow-2xl border text-[12px] font-medium flex items-center gap-2 min-w-[240px]',
          t.exiting ? 'toast-exit' : 'toast-enter',
          t.type === 'success' && 'bg-white border-emerald-200 text-emerald-600',
          t.type === 'info' && 'bg-white border-[#d4a017]/25 text-[#b88900]',
          t.type === 'error' && 'bg-white border-red-200 text-red-500',
        )}>
          {t.type === 'success' && <I d={ic.check} size={14} />}
          {t.type === 'info' && <I d={ic.zap} size={14} />}
          {t.type === 'error' && <I d={ic.alert} size={14} />}
          {t.message}
        </div>
      ))}
    </div>
  )
}

// ═══ AI EXECUTION MODAL ═══
function getNextBestAction(deal, { dealActivities = [], outreach, hasResearch, hasMessage }) {
  if (!deal) return null
  const nextPendingActivity = [...dealActivities]
    .filter(activity => !activity.done)
    .sort((a, b) => String(a.due_date || '9999-12-31').localeCompare(String(b.due_date || '9999-12-31')))[0]

  if ((deal.activities?.overdue || 0) > 0) {
    return {
      id: 'open_activities',
      badge: 'Urgente',
      color: '#ef4444',
      title: 'Resolver atividades vencidas',
      description: `${deal.activities.overdue} atividade(s) vencida(s) antes de avancar o deal.`,
      cta: 'Abrir agenda do deal',
    }
  }

  if (!outreach?.fitClassification) {
    return {
      id: 'analyze_outreach',
      badge: 'Outreach',
      color: '#d4a017',
      title: 'Rodar analise de fit',
      description: 'Ainda nao existe leitura de persona, fit e proximo passo para esse lead.',
      cta: 'Analisar agora',
    }
  }

  if (outreach?.state === 'HANDOFF_TO_HUMAN' || outreach?.state === 'MEETING_INTENT_DETECTED' || outreach?.escalateToHuman) {
    return {
      id: 'focus_outreach',
      badge: 'Handoff',
      color: '#0f766e',
      title: 'Assumir conversa humana',
      description: 'O lead demonstrou sinal forte ou precisa de resposta contextual do time comercial.',
      cta: 'Abrir console de outreach',
    }
  }

  if (!hasResearch) {
    return {
      id: 'generate_research',
      badge: 'IA',
      color: '#8b5cf6',
      title: 'Gerar pesquisa da empresa',
      description: 'Monte o contexto empresarial antes de insistir no outreach.',
      cta: 'Pesquisar com IA',
    }
  }

  if (!hasMessage && outreach?.fitClassification !== 'DO_NOT_CONTACT') {
    return {
      id: 'generate_message',
      badge: 'Mensagem',
      color: '#06b6d4',
      title: 'Preparar primeira mensagem',
      description: 'Ja existe contexto suficiente para uma abordagem personalizada.',
      cta: 'Gerar mensagem',
    }
  }

  if ((deal.activities?.pending || 0) === 0) {
    return {
      id: 'add_activity',
      badge: 'Cadencia',
      color: '#11263a',
      title: 'Criar proxima atividade',
      description: 'O deal esta sem proxima tarefa definida. Agende o proximo toque.',
      cta: 'Adicionar atividade',
    }
  }

  return {
    id: 'open_activities',
    badge: 'Fluxo',
    color: '#11263a',
    title: nextPendingActivity?.subject ? `Executar: ${nextPendingActivity.subject}` : 'Executar proximo passo',
    description: nextPendingActivity?.due_date
      ? `Ha uma tarefa pendente prevista para ${fmtDate(nextPendingActivity.due_date)}.`
      : 'Existe uma pendencia aberta para esse deal.',
    cta: 'Ver atividades',
  }
}

function AIExecuteModal({ activity, deal, onClose, onDone, addToast }) {
  const [status, setStatus] = useState('idle')
  const [steps, setSteps] = useState([])
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const startedRef = useRef(false)

  const execute = async () => {
    setStatus('running')
    setSteps(['Identificando tarefa...'])
    try {
      setSteps(p => [...p, 'Chamando OpenAI com Web Search...'])
      const res = await api.aiExecuteTask(activity.id, deal?.id || activity.deal_id)
      if (res.success) {
        setSteps(res.actions_taken || [])
        setResult(res)
        setStatus('done')
        addToast('Tarefa executada com sucesso!', 'success')
      } else {
        setError(res.error || 'Erro desconhecido')
        setStatus('error')
        addToast('Falha na execucao', 'error')
      }
    } catch (err) {
      setError(err.message || 'Erro de conexao')
      setStatus('error')
      addToast('Erro ao executar tarefa', 'error')
    }
  }

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    execute()
  }, [])

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="law-modal-card w-full max-w-lg rounded-[24px] p-6 shadow-[0_28px_90px_rgba(15,23,42,0.18)] animate-slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#d4a017]/15 flex items-center justify-center text-[#d4a017]">
              <I d={ic.bot} size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">IA Executando Tarefa</h3>
              <p className="text-[10px] text-slate-500 truncate max-w-[300px]">{activity.subject}</p>
            </div>
          </div>
          <button onClick={() => { if (status !== 'running') { onDone(); onClose() } }} className="text-slate-400 hover:text-slate-700 transition p-1">
            <I d={ic.x} size={16} />
          </button>
        </div>

        <div className="space-y-2 mb-4 max-h-[300px] overflow-y-auto">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <span className="text-emerald-400"><I d={ic.check} size={12} /></span>
              <span className="text-slate-600">{step}</span>
            </div>
          ))}
          {status === 'running' && (
            <div className="flex items-center gap-2 text-[11px] text-[#d4a017]">
              <Spinner size={12} />
              <span>Processando...</span>
            </div>
          )}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-[11px] text-red-400">
              {error}
            </div>
          )}
        </div>

        {result?.data_found && (
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 mb-4 max-h-[200px] overflow-y-auto">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2 font-semibold">Dados encontrados</div>
            <pre className="text-[10px] text-slate-600 whitespace-pre-wrap font-mono">{JSON.stringify(result.data_found, null, 2)}</pre>
          </div>
        )}

        <div className="flex gap-2">
          {status === 'error' && (
            <button onClick={execute} className="flex-1 h-9 rounded-lg text-[11px] font-bold bg-[#d4a017]/15 text-[#d4a017] border border-[#d4a017]/25 hover:bg-[#d4a017]/25 transition">
              Tentar novamente
            </button>
          )}
          <button onClick={() => { onDone(); onClose() }}
            className={cn('flex-1 h-9 rounded-lg text-[11px] font-bold transition', status === 'running' ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')}
            disabled={status === 'running'}>
            {status === 'done' ? 'Fechar' : status === 'error' ? 'Fechar' : 'Aguarde...'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══ AI CARD (with 3 variations) ═══
function AICard({ title, color, icon, variations, content, loading, onGenerate, onCopy, copied, btnLabel }) {
  const [selectedVar, setSelectedVar] = useState(0)
  const items = variations && variations.length > 0 ? variations : null
  const displayContent = items ? items[selectedVar]?.text : content

  return (
    <div className={cn('rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)] transition-all hover:border-slate-300 hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)]', loading && 'animate-glow')}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold"
          style={{ background: color + '15', color }}>
          {icon}
        </div>
        <span className="text-[12px] font-semibold text-slate-700">{title}</span>
      </div>
      {displayContent ? (
        <div>
          {items && items.length > 1 && (
            <div className="flex gap-1 mb-2">
              {items.map((v, i) => (
                <button key={i} onClick={() => setSelectedVar(i)}
                  className={cn('text-[9px] px-2 py-1 rounded-md font-medium transition-all',
                    selectedVar === i ? 'text-slate-900' : 'text-slate-400 hover:text-slate-700'
                  )}
                  style={selectedVar === i ? { background: color + '20', color } : {}}>
                  {v.label || `Var ${i + 1}`}
                </button>
              ))}
            </div>
          )}
          <pre className="text-[11px] text-slate-600 whitespace-pre-wrap leading-relaxed font-sans mb-3 max-h-48 overflow-y-auto">{displayContent}</pre>
          <div className="flex gap-2">
            <button onClick={() => onCopy(displayContent)}
              className="text-[10px] font-medium transition" style={{ color }}>
              {copied ? 'Copiado!' : 'Copiar'}
            </button>
            <button onClick={onGenerate} className="text-[10px] text-slate-400 hover:text-slate-700 transition">
              Regenerar
            </button>
          </div>
        </div>
      ) : (
        <button onClick={onGenerate} disabled={loading}
          className="w-full h-9 rounded-lg text-[11px] font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-60"
          style={{ background: color + '12', color, border: `1px solid ${color}20` }}>
          {loading ? <><Spinner size={14} /> Gerando...</> : btnLabel}
        </button>
      )}
    </div>
  )
}

// ═══ CADENCE TIMELINE ═══
function CadenceTimeline({ dealId, activities }) {
  const dealActs = activities.filter(a => a.deal_id === dealId)
  const steps = getCadenceProgress(dealId, dealActs)

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-3">Cadencia de Prospeccao</div>
      <div className="flex items-center gap-0 overflow-x-auto pb-1">
        {steps.map((step, i) => (
          <div key={step.key} className="flex items-center shrink-0">
            <div className="flex flex-col items-center">
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-all',
                step.done
                  ? 'bg-[#d4a017]/20 border-[#d4a017] text-[#d4a017]'
                  : i === steps.findIndex(s => !s.done)
                    ? 'bg-slate-100 border-slate-300 text-slate-600 animate-pulse'
                    : 'bg-slate-50 border-slate-200 text-slate-400'
              )}>
                {step.done ? <I d={ic.check} size={10} /> : i + 1}
              </div>
              <span className={cn('text-[8px] mt-1 whitespace-nowrap', step.done ? 'text-[#b8860b]' : 'text-slate-400')}>{step.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={cn('w-6 h-0.5 mx-0.5 mt-[-12px]', step.done ? 'bg-[#d4a017]/40' : 'bg-slate-200')} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ═══ SVG MINI CHARTS ═══
function DonutChart({ data, size = 80 }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  let offset = 0
  const r = 30, cx = size / 2, cy = size / 2, circumference = 2 * Math.PI * r

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {data.map((d, i) => {
        const pct = d.value / total
        const dashArray = `${pct * circumference} ${circumference}`
        const dashOffset = -offset * circumference
        offset += pct
        return (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={d.color} strokeWidth="8"
            strokeDasharray={dashArray} strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${cx} ${cy})`} opacity="0.8" />
        )
      })}
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fill="#0f172a" fillOpacity="0.7" fontSize="11" fontFamily="Space Mono, monospace" fontWeight="bold">{total}</text>
    </svg>
  )
}

function FunnelBar({ stages, maxCount }) {
  return (
    <div className="space-y-1.5">
      {stages.map((s, i) => {
        const pct = maxCount > 0 ? (s.count / maxCount) * 100 : 0
        return (
          <div key={s.id} className="flex items-center gap-2">
            <span className="text-[9px] text-white/30 w-20 truncate text-right">{s.name.split('-')[0]?.trim()?.substring(0, 12)}</span>
            <div className="flex-1 h-5 rounded bg-white/[0.03] overflow-hidden relative">
              <div className="h-full rounded transition-all duration-700" style={{ width: Math.max(pct, 2) + '%', background: STAGE_COLORS[i % STAGE_COLORS.length] + '60' }} />
              <span className="absolute inset-y-0 left-2 flex items-center text-[9px] font-mono text-white/40">{s.count}</span>
            </div>
            {s.conversionRate && <span className="text-[9px] font-mono text-white/20 w-10 text-right">{s.conversionRate}%</span>}
          </div>
        )
      })}
    </div>
  )
}

// ═══ MAIN APP ═══
export default function App() {
  const [status, setStatus] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [deals, setDeals] = useState([])
  const [stages, setStages] = useState([])
  const [totalDeals, setTotalDeals] = useState(0)
  const [activities, setActivities] = useState([])
  const [selected, setSelected] = useState(null)
  const [tab, setTab] = useState(() => readPanelPref(PANEL_PREFS.tab, 'command'))
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState(() => readPanelPref(PANEL_PREFS.stageFilter, ''))
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [copied, setCopied] = useState(null)
  const [detailTab, setDetailTab] = useState(() => readPanelPref(PANEL_PREFS.detailTab, 'actions'))
  const [focusMode, setFocusMode] = useState(() => readPanelPref(PANEL_PREFS.focusMode, 'all'))
  const [clockTime, setClockTime] = useState(new Date())
  // AI
  const [aiLoading, setAiLoading] = useState(null)
  const [liNotes, setLiNotes] = useState({})
  const [liMessages, setLiMessages] = useState({})
  const [research, setResearch] = useState({})
  const [scripts, setScripts] = useState({})
  const [emails, setEmails] = useState({})
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiResponse, setAiResponse] = useState('')
  const [aiChatLoading, setAiChatLoading] = useState(false)
  const [aiHistory, setAiHistory] = useState([])
  // Modals
  const [showAddActivity, setShowAddActivity] = useState(false)
  const [showNoteModal, setShowNoteModal] = useState(false)
  const [noteContent, setNoteContent] = useState('')
  const [newActivity, setNewActivity] = useState({ subject: '', type: 'call', due_date: '', note: '' })
  const [aiExecModal, setAiExecModal] = useState(null)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  // Enrichment
  const [enrichDeals, setEnrichDeals] = useState([])
  const [enrichSelected, setEnrichSelected] = useState(new Set())
  const [enriching, setEnriching] = useState(false)
  const [enrichProgress, setEnrichProgress] = useState({ current: 0, total: 0 })
  const [enrichResults, setEnrichResults] = useState([])
  const [enrichFilter, setEnrichFilter] = useState('all')
  const [enrichCount, setEnrichCount] = useState(10)
  const [enrichApproval, setEnrichApproval] = useState({})
  const [enrichHistory, setEnrichHistory] = useState([])
  const [enrichSkippedHistory, setEnrichSkippedHistory] = useState(0)
  const [outreachByDeal, setOutreachByDeal] = useState({})
  const [outreachQueue, setOutreachQueue] = useState([])
  const [outreachQueueStats, setOutreachQueueStats] = useState({ handoff: 0, meeting_intent: 0, followup_due: 0 })
  const [outreachLoading, setOutreachLoading] = useState(null)
  const [outreachReplyDrafts, setOutreachReplyDrafts] = useState({})
  const [outreachReplyResults, setOutreachReplyResults] = useState({})
  const [outreachActionLoading, setOutreachActionLoading] = useState(null)
  // Kanban drag
  const [dragDeal, setDragDeal] = useState(null)
  const [dropTarget, setDropTarget] = useState(null)

  const searchRef = useRef(null)
  const { toasts, addToast } = useToasts()

  const loadOutreachState = useCallback(async (dealId) => {
    if (!dealId) return
    setOutreachLoading('load-' + dealId)
    try {
      const res = await api.outreachState(dealId)
      setOutreachByDeal(prev => ({ ...prev, [dealId]: res }))
    } catch {
      addToast('Erro ao carregar outreach', 'error')
    }
    setOutreachLoading(null)
  }, [addToast])

  // Clock tick
  useEffect(() => {
    const t = setInterval(() => setClockTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // ── LOAD DATA ──
  useEffect(() => { writePanelPref(PANEL_PREFS.tab, tab) }, [tab])
  useEffect(() => { writePanelPref(PANEL_PREFS.detailTab, detailTab) }, [detailTab])
  useEffect(() => { writePanelPref(PANEL_PREFS.stageFilter, stageFilter) }, [stageFilter])
  useEffect(() => { writePanelPref(PANEL_PREFS.focusMode, focusMode) }, [focusMode])

  const loadData = useCallback(async () => {
    try {
      const [statusRes, dashboardRes, stagesRes, dealsRes, activitiesRes, outreachQueueRes] = await Promise.allSettled([
        api.status(),
        api.dashboard(),
        api.stages(),
        api.deals({
          limit: 500,
          ...(stageFilter ? { stage_id: stageFilter } : {}),
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
        }),
        api.activities({}),
        api.outreachQueue(),
      ])

      if (statusRes.status === 'fulfilled') setStatus(statusRes.value)
      if (dashboardRes.status === 'fulfilled') setDashboard(dashboardRes.value)
      if (stagesRes.status === 'fulfilled') setStages(stagesRes.value || [])
      if (activitiesRes.status === 'fulfilled') setActivities(activitiesRes.value.activities || [])
      if (outreachQueueRes.status === 'fulfilled') {
        setOutreachQueue(outreachQueueRes.value.items || [])
        setOutreachQueueStats(outreachQueueRes.value.stats || { handoff: 0, meeting_intent: 0, followup_due: 0 })
      }
      if (dealsRes.status === 'fulfilled') {
        const nextDeals = dealsRes.value.deals || []
        setDeals(nextDeals)
        setTotalDeals(dealsRes.value.total || 0)
        setSelected(prev => prev ? nextDeals.find(d => d.id === prev.id) || null : prev)
      }

      const failedLoads = [statusRes, dashboardRes, stagesRes, dealsRes, activitiesRes, outreachQueueRes].filter(result => result.status === 'rejected')
      if (failedLoads.length) {
        console.error('Partial load failures:', failedLoads.map(result => result.reason?.message || result.reason))
      }
    } catch (err) {
      console.error('Load error:', err)
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, stageFilter])

  useEffect(() => { loadData() }, [loadData])

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); searchRef.current?.focus() }
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) { e.preventDefault(); searchRef.current?.focus() }
      if (e.key === 'Escape') { setSelected(null); setAiExecModal(null) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ── ACTIONS ──
  const doSync = async () => {
    setSyncing(true)
    addToast('Sincronizando...', 'info')
    try {
      await api.sync()
      await loadData()
      addToast('Sincronizacao concluida', 'success')
    } catch (err) {
      addToast(err.message || 'Falha na sincronizacao', 'error')
    } finally {
      setSyncing(false)
    }
  }

  const doCopy = async (text, id) => {
    try {
      await copyText(text)
      setCopied(id)
      addToast('Copiado!', 'success')
      setTimeout(() => setCopied(null), 2000)
    } catch {
      addToast('Falha ao copiar para a area de transferencia', 'error')
    }
  }

  const doAdvanceStage = async (deal) => {
    const currentIdx = stages.findIndex(s => s.id === deal.stageId)
    if (currentIdx < stages.length - 1) {
      const nextStage = stages[currentIdx + 1]
      // Optimistic update
      setDeals(prev => prev.map(d => d.id === deal.id ? { ...d, stageId: nextStage.id, stageName: nextStage.name } : d))
      if (selected?.id === deal.id) setSelected(prev => ({ ...prev, stageId: nextStage.id, stageName: nextStage.name }))
      try {
        const res = await api.moveStage(deal.id, nextStage.id)
        if (res.success) {
          addToast(`Avancado para ${nextStage.name}`, 'success')
        } else {
          addToast(res.error || 'Falha ao avancar etapa', 'error')
          await loadData()
        }
      } catch (err) {
        addToast(err.message || 'Falha ao avancar etapa', 'error')
        await loadData()
      }
    }
  }

  const doComplete = async (actId) => {
    setActivities(prev => prev.filter(a => a.id !== actId))
    try {
      const res = await api.completeActivity(actId)
      if (res.success) {
        addToast('Atividade concluida', 'success')
      } else {
        addToast(res.error || 'Falha ao concluir', 'error')
        await loadData()
      }
    } catch (err) {
      addToast(err.message || 'Falha ao concluir', 'error')
      await loadData()
    }
  }

  const doAddActivity = async () => {
    if (!selected || !newActivity.subject) return
    try {
      await api.addActivity(selected.id, newActivity)
      setShowAddActivity(false)
      setNewActivity({ subject: '', type: 'call', due_date: '', note: '' })
      addToast('Atividade criada', 'success')
      await loadData()
    } catch (err) {
      addToast(err.message || 'Erro ao criar atividade', 'error')
    }
  }

  const doAddNote = async () => {
    if (!selected || !noteContent.trim()) return
    try {
      await api.addNote(selected.id, noteContent)
      setShowNoteModal(false)
      setNoteContent('')
      addToast('Nota adicionada', 'success')
    } catch (err) {
      addToast(err.message || 'Erro ao salvar nota', 'error')
    }
  }

  const doLostDeal = async (deal) => {
    if (!deal) return
    setDeals(prev => prev.filter(d => d.id !== deal.id))
    setSelected(null)
    try {
      const res = await api.setDealLost(deal.id, '')
      if (res.success) {
        addToast('Deal marcado como perdido', 'info')
      } else {
        addToast(res.error || 'Falha ao marcar como perdido', 'error')
        await loadData()
      }
    } catch (err) {
      addToast(err.message || 'Falha ao marcar como perdido', 'error')
      await loadData()
    }
  }

  // ── AI ACTIONS ──
  const genLinkedin = async (deal) => {
    setAiLoading('li-' + deal.id)
    try {
      const res = await api.aiLinkedin({ deal_id: deal.id, company: deal.company, contact: deal.contact, sector: '', revenue: '' })
      setLiNotes(p => ({ ...p, [deal.id]: { variations: res.variations || [{ label: 'Padrao', text: res.note }], text: res.note } }))
      addToast('Nota LinkedIn gerada', 'success')
      await loadOutreachState(deal.id)
    } catch { addToast('Erro ao gerar nota', 'error') }
    setAiLoading(null)
  }

  const genLinkedinMsg = async (deal) => {
    setAiLoading('lim-' + deal.id)
    try {
      const res = await api.aiLinkedinMessage({ deal_id: deal.id, company: deal.company, contact: deal.contact, sector: '', revenue: '', dossier: research[deal.id]?.text || '' })
      setLiMessages(p => ({ ...p, [deal.id]: { variations: res.variations || [{ label: 'Padrao', text: res.message }], text: res.message } }))
      addToast('Mensagem LinkedIn gerada', 'success')
      await loadOutreachState(deal.id)
    } catch { addToast('Erro ao gerar mensagem', 'error') }
    setAiLoading(null)
  }

  const runOutreachAnalysis = async (deal) => {
    setOutreachLoading('analyze-' + deal.id)
    try {
      const res = await api.outreachAnalyze({ deal_id: deal.id })
      setOutreachByDeal(prev => ({ ...prev, [deal.id]: { state: res.state, enrichment: prev[deal.id]?.enrichment || null, linkedin: prev[deal.id]?.linkedin || null } }))
      addToast(`Outreach analisado: ${res.analysis.fitClassification} (${res.analysis.leadScore})`, 'success')
      await loadOutreachState(deal.id)
    } catch {
      addToast('Erro ao analisar outreach', 'error')
    }
    setOutreachLoading(null)
  }

  const executeOutreach = async (deal, action, forceSend = true) => {
    setOutreachActionLoading(`${action}-${deal.id}`)
    try {
      const res = await api.outreachExecute({ deal_id: deal.id, action, force_send: forceSend })
      const executedAction = res.executed_action || action
      if (executedAction === 'connection_note') {
        setLiNotes(prev => ({ ...prev, [deal.id]: { variations: res.package?.variations || [{ label: 'Padrao', text: res.draft }], text: res.draft } }))
        if (action === 'first_message' && res.connection_required) {
          addToast(res.sent ? 'Sem conexao aceita: convite enviado no lugar da mensagem' : 'Sem conexao aceita: convite preparado no lugar da mensagem', 'info')
        } else {
          addToast(res.sent ? 'Conexao LinkedIn preparada e enviada' : 'Conexao LinkedIn preparada', 'success')
        }
      } else {
        setLiMessages(prev => ({ ...prev, [deal.id]: { variations: res.package?.variations || [{ label: 'Padrao', text: res.draft }], text: res.draft } }))
        addToast(res.sent ? 'Mensagem LinkedIn enviada' : 'Mensagem LinkedIn preparada', 'success')
      }
      await loadOutreachState(deal.id)
    } catch (err) {
      addToast(err.message || 'Erro no outreach', 'error')
    }
    setOutreachActionLoading(null)
  }

  const processOutreachReply = async (deal) => {
    const replyText = outreachReplyDrafts[deal.id]?.trim()
    if (!replyText) return addToast('Cole a resposta do lead antes de processar', 'info')
    setOutreachActionLoading(`reply-${deal.id}`)
    try {
      const res = await api.outreachReply({ deal_id: deal.id, reply_text: replyText })
      setOutreachReplyResults(prev => ({ ...prev, [deal.id]: res }))
      setOutreachReplyDrafts(prev => ({ ...prev, [deal.id]: '' }))
      addToast(`Reply classificado: ${res.classification?.classification || 'OK'}`, 'success')
      await loadOutreachState(deal.id)
    } catch (err) {
      addToast(err.message || 'Erro ao processar reply', 'error')
    }
    setOutreachActionLoading(null)
  }

  useEffect(() => {
    if (selected?.id) loadOutreachState(selected.id)
  }, [selected?.id, loadOutreachState])

  const genResearch = async (deal) => {
    setAiLoading('res-' + deal.id)
    try {
      const res = await api.aiResearch({ company: deal.company, cnpj: '' })
      setResearch(p => ({ ...p, [deal.id]: { text: res.research } }))
      addToast('Pesquisa concluida', 'success')
    } catch { addToast('Erro na pesquisa', 'error') }
    setAiLoading(null)
  }

  const genScript = async (deal) => {
    setAiLoading('sc-' + deal.id)
    try {
      const res = await api.aiCallScript({ company: deal.company, contact: deal.contact, sector: '', revenue: '', dossier: research[deal.id]?.text || '' })
      setScripts(p => ({ ...p, [deal.id]: { variations: res.variations || [{ label: 'Padrao', text: res.script }], text: res.script } }))
      addToast('Script gerado', 'success')
    } catch { addToast('Erro ao gerar script', 'error') }
    setAiLoading(null)
  }

  const genEmail = async (deal, type = 'intro') => {
    setAiLoading('em-' + deal.id)
    try {
      const res = await api.aiEmail({ company: deal.company, contact: deal.contact, type, context: research[deal.id]?.text || '' })
      setEmails(p => ({ ...p, [deal.id]: { variations: res.variations || [{ label: 'Padrao', text: res.email }], text: res.email } }))
      addToast('Email gerado', 'success')
    } catch { addToast('Erro ao gerar email', 'error') }
    setAiLoading(null)
  }

  const runNextBestAction = async () => {
    if (!selected || !nextBestAction) return
    switch (nextBestAction.id) {
      case 'open_activities':
        setDetailTab('activities')
        break
      case 'analyze_outreach':
        await runOutreachAnalysis(selected)
        break
      case 'focus_outreach':
        setDetailTab('actions')
        addToast('Console de outreach pronto para resposta humana', 'info')
        break
      case 'generate_research':
        await genResearch(selected)
        break
      case 'generate_message':
        await genLinkedinMsg(selected)
        break
      case 'add_activity':
        setShowAddActivity(true)
        break
      default:
        setDetailTab('actions')
        break
    }
  }

  const askAI = async () => {
    if (!aiPrompt.trim()) return
    const question = aiPrompt
    setAiHistory(prev => [...prev, { role: 'user', text: question }])
    setAiChatLoading(true)
    setAiPrompt('')
    try {
      const res = await api.aiGenerate(question)
      const answer = res.text || 'Sem resposta.'
      setAiHistory(prev => [...prev, { role: 'ai', text: answer }])
      setAiResponse(answer)
    } catch {
      setAiHistory(prev => [...prev, { role: 'ai', text: 'Erro ao consultar IA.' }])
    }
    setAiChatLoading(false)
  }

  // ── ENRICHMENT ──
  const importStage = stages.find(s => /importa/i.test(s.name))
  const prospStage = stages.find(s => /prospec.*etapa\s*1/i.test(s.name))

  const loadEnrichment = useCallback(async () => {
    try {
      const params = {}
      if (importStage) params.stage_id = importStage.id
      const [res, historyRes] = await Promise.all([api.scanIncomplete(params), api.enrichmentHistory()])
      setEnrichDeals(res.deals || [])
      setEnrichSkippedHistory(res.skipped_history || 0)
      setEnrichHistory(historyRes.items || [])
    } catch { addToast('Erro ao escanear leads', 'error') }
  }, [addToast, importStage])

  useEffect(() => {
    if (tab === 'enrich') loadEnrichment()
  }, [tab, loadEnrichment])

  const doEnrichBatch = async () => {
    // Pick first N deals from the list (or selected ones)
    const pool = enrichDeals.slice(0, enrichCount)
    if (pool.length === 0) return

    setEnriching(true)
    setEnrichProgress({ current: 0, total: pool.length })
    setEnrichResults([])
    setEnrichApproval({})
    addToast(`Enriquecendo ${pool.length} leads de Importacao...`, 'info')

    const results = []
    for (let i = 0; i < pool.length; i++) {
      setEnrichProgress({ current: i + 1, total: pool.length })
      try {
        const r = await api.aiEnrichDeal(pool[i].id)
        r._company = pool[i].company || pool[i].title
        results.push(r)
        // Update results in real-time so user sees progress
        setEnrichResults([...results])
      } catch (err) {
        results.push({ success: false, deal_id: pool[i].id, error: err.message, _company: pool[i].company || pool[i].title })
        setEnrichResults([...results])
      }
      if (i < pool.length - 1) await new Promise(r => setTimeout(r, 500))
    }

    setEnrichResults(results)
    setEnriching(false)
    const updated = results.filter(r => r.success && r.fields_updated?.length > 0).length
    const skipped = results.filter(r => r.skipped).length
    addToast(`${updated}/${pool.length} leads enriquecidos${skipped ? `, ${skipped} ja estavam no historico` : ''}.`, 'success')
    await loadEnrichment()
  }

  const doApproveAndMove = async (dealId) => {
    if (!prospStage) { addToast('Etapa de prospeccao nao encontrada', 'error'); return }
    setEnrichApproval(p => ({ ...p, [dealId]: 'moving' }))
    const enrichResult = enrichResults.find(r => r.deal_id === dealId)
    const enrichData = enrichResult?.data_found || null
    try {
      const res = await api.aiApproveAndMove(dealId, prospStage.id, enrichData)
      if (res.success) {
        setEnrichApproval(p => ({ ...p, [dealId]: 'done' }))
        setDeals(prev => prev.map(d => d.id === dealId ? { ...d, stageId: prospStage.id, stageName: prospStage.name } : d))
        addToast(`Aprovado! ${(res.actions || []).join(' | ')}`, 'success')
      } else {
        setEnrichApproval(p => ({ ...p, [dealId]: 'error' }))
        addToast(res.error || 'Falha ao mover deal', 'error')
      }
    } catch (err) {
      setEnrichApproval(p => ({ ...p, [dealId]: 'error' }))
      addToast('Erro ao aprovar: ' + err.message, 'error')
    }
  }

  const doApproveAll = async () => {
    const toApprove = enrichResults.filter(r => r.success && r.fields_updated?.length > 0 && enrichApproval[r.deal_id] !== 'done')
    if (toApprove.length === 0) return
    addToast(`Movendo ${toApprove.length} deals...`, 'info')
    for (const r of toApprove) {
      await doApproveAndMove(r.deal_id)
      await new Promise(resolve => setTimeout(resolve, 300))
    }
    await loadData()
    await loadEnrichment()
  }

  // ── KANBAN DnD ──
  const onDragStart = (e, deal) => {
    setDragDeal(deal)
    e.dataTransfer.effectAllowed = 'move'
    e.target.classList.add('kanban-dragging')
  }
  const onDragEnd = (e) => {
    e.target.classList.remove('kanban-dragging')
    setDragDeal(null)
    setDropTarget(null)
  }
  const onDragOver = (e, stageId) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget(stageId)
  }
  const onDragLeave = () => setDropTarget(null)
  const onDrop = async (e, stageId) => {
    e.preventDefault()
    setDropTarget(null)
    if (dragDeal && dragDeal.stageId !== stageId) {
      setDeals(prev => prev.map(d => d.id === dragDeal.id ? { ...d, stageId, stageName: stages.find(s => s.id === stageId)?.name || '' } : d))
      try {
        const res = await api.moveStage(dragDeal.id, stageId)
        if (res.success) {
          addToast(`Movido para ${stages.find(s => s.id === stageId)?.name}`, 'success')
        } else {
          addToast(res.error || 'Falha ao mover', 'error')
          await loadData()
        }
      } catch (err) {
        addToast(err.message || 'Falha ao mover', 'error')
        await loadData()
      }
    }
    setDragDeal(null)
  }

  // ── COMPUTED ──
  const now = clockTime
  const greeting = now.getHours() < 12 ? 'Bom dia' : now.getHours() < 18 ? 'Boa tarde' : 'Boa noite'
  const todayStr = getBusinessDateString()
  const todayActs = activities.filter(a => a.due_date === todayStr)
  const overdueActs = activities.filter(a => a.due_date && a.due_date < todayStr)
  const isConnected = status?.pipedrive && (status?.counts?.deals > 0 || status?.counts?.stages > 0 || status?.lastSync)

  function dealStageColor(deal) {
    const idx = stages.findIndex(s => s.id === deal.stageId)
    return STAGE_COLORS[idx % STAGE_COLORS.length] || '#6b7280'
  }

  function dealPriority(d) {
    let score = 0
    if (d.activities?.overdue > 0) score += 50
    if (d.daysSinceActivity > 7) score += 30
    if (d.daysInStage > 14) score += 20
    if (d.activities?.pending === 0) score += 40
    return score
  }

  const sortedDeals = useMemo(() => [...deals].sort((a, b) => dealPriority(b) - dealPriority(a)), [deals])
  const priorityOutreachItems = useMemo(
    () => [...outreachQueue].sort((a, b) => (b.queue_score || 0) - (a.queue_score || 0)).slice(0, 5),
    [outreachQueue]
  )
  const outreachAttentionDealIds = useMemo(
    () => new Set(outreachQueue.filter(item => item.escalate_to_human || item.state === 'HANDOFF_TO_HUMAN' || item.state === 'MEETING_INTENT_DETECTED').map(item => item.deal_id)),
    [outreachQueue]
  )
  const focusCounts = useMemo(() => ({
    all: sortedDeals.length,
    overdue: sortedDeals.filter(d => (d.activities?.overdue || 0) > 0).length,
    idle: sortedDeals.filter(d => d.daysSinceActivity > 7).length,
    no_activity: sortedDeals.filter(d => (d.activities?.pending || 0) === 0 && (d.activities?.overdue || 0) === 0).length,
    outreach: sortedDeals.filter(d => outreachAttentionDealIds.has(d.id)).length,
  }), [outreachAttentionDealIds, sortedDeals])
  const visibleDeals = useMemo(() => {
    switch (focusMode) {
      case 'overdue':
        return sortedDeals.filter(d => (d.activities?.overdue || 0) > 0)
      case 'idle':
        return sortedDeals.filter(d => d.daysSinceActivity > 7)
      case 'no_activity':
        return sortedDeals.filter(d => (d.activities?.pending || 0) === 0 && (d.activities?.overdue || 0) === 0)
      case 'outreach':
        return sortedDeals.filter(d => outreachAttentionDealIds.has(d.id))
      default:
        return sortedDeals
    }
  }, [focusMode, outreachAttentionDealIds, sortedDeals])
  const focusOptions = [
    { id: 'all', label: 'Todos', count: focusCounts.all, color: '#11263a' },
    { id: 'overdue', label: 'Vencidos', count: focusCounts.overdue, color: '#ef4444' },
    { id: 'idle', label: 'Parados', count: focusCounts.idle, color: '#f59e0b' },
    { id: 'no_activity', label: 'Sem atividade', count: focusCounts.no_activity, color: '#64748b' },
    { id: 'outreach', label: 'Outreach quente', count: focusCounts.outreach, color: '#0f766e' },
  ]
  const commandSignals = [
    { label: 'Pipeline', value: totalDeals, sub: dashboard?.totalValue ? fmtCurrency(dashboard.totalValue) : 'negocios ativos', color: '#d4a017' },
    { label: 'Hoje', value: todayActs.length, sub: 'atividades agendadas', color: '#11263a' },
    { label: 'Vencidas', value: overdueActs.length, sub: 'precisam atencao', color: '#ef4444' },
    { label: 'Memoria IA', value: status?.enrichment?.reusable_records || 0, sub: 'empresas reaproveitaveis', color: '#0f766e' },
  ]
  const commandHealth = [
    { label: 'Handoff humano', value: outreachQueueStats.handoff || 0, tone: 'text-red-500' },
    { label: 'Meeting intent', value: outreachQueueStats.meeting_intent || 0, tone: 'text-emerald-600' },
    { label: 'Follow-up devido', value: outreachQueueStats.followup_due || 0, tone: 'text-amber-600' },
    { label: 'Timezone', value: (status?.security?.timezone || 'America/Sao_Paulo').replace('America/', ''), tone: 'text-slate-200' },
  ]
  const selectedDealActivities = useMemo(
    () => selected ? activities.filter(activity => activity.deal_id === selected.id) : [],
    [activities, selected]
  )
  const selectedOutreachState = selected ? outreachByDeal[selected.id]?.state : null
  const nextBestAction = useMemo(() => {
    if (!selected) return null
    return getNextBestAction(selected, {
      dealActivities: selectedDealActivities,
      outreach: selectedOutreachState,
      hasResearch: !!research[selected.id]?.text,
      hasMessage: !!liMessages[selected.id]?.text,
    })
  }, [liMessages, research, selected, selectedDealActivities, selectedOutreachState])

  // Highlight search
  const highlightText = (text, query) => {
    if (!query || !text) return text
    const parts = String(text).split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
    return parts.map((p, i) => p.toLowerCase() === query.toLowerCase() ? <mark key={i}>{p}</mark> : p)
  }

  // Activity type stats for donut
  const actTypeData = useMemo(() => {
    const byType = {}
    activities.forEach(a => { byType[a.type] = (byType[a.type] || 0) + 1 })
    const colors = { call: '#10b981', task: '#f59e0b', email: '#3b82f6', meeting: '#8b5cf6' }
    return Object.entries(byType).map(([k, v]) => ({ label: k, value: v, color: colors[k] || '#6b7280' }))
  }, [activities])

  // ════════════════════════════
  // LOADING SCREEN
  // ════════════════════════════
  if (loading) {
    return (
      <div className="min-h-screen law-loading-shell px-5">
        <div className="law-loading-grid">
          <div className="law-loading-brand-panel">
            <div className="law-loading-brand-image-wrap">
              <img src={lawBrandImage} alt="LAW Solucoes Financeiras" className="law-loading-brand-image" />
            </div>
            <div className="law-loading-brand-copy">
              <span className="law-loading-chip">LAW ENTERPRISE ACCESS</span>
              <h1 className="law-loading-title">Inteligencia comercial com identidade institucional nativa.</h1>
              <p className="law-loading-subtitle">Ambiente premium para originacao, enriquecimento e execucao comercial com padrao visual LAW.</p>
            </div>
          </div>
          <div className="law-loading-card">
            <div className="law-loading-card-head">
              <div className="law-loading-card-logo">
                <img src={lawBrandImage} alt="" className="law-loading-card-logo-image" />
              </div>
              <div>
                <div className="law-loading-card-label">System Boot</div>
                <div className="law-loading-card-title">Inicializando ambiente institucional</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Spinner size={24} />
              <div>
                <p className="text-sm font-semibold text-slate-800">Carregando pipeline, IA e conectores</p>
                <p className="mt-1 text-[11px] text-slate-500 font-mono tracking-[0.18em]">LAW COMMAND CENTER</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const notConfigured = !status?.pipedrive

  const tabs = [
    { id: 'command', label: 'Command Center', icon: ic.target },
    { id: 'pipeline', label: 'Kanban', icon: ic.grid },
    { id: 'activities', label: 'Atividades', icon: ic.calendar },
    { id: 'enrich', label: 'Enriquecimento IA', icon: ic.download },
    { id: 'metrics', label: 'Metricas', icon: ic.bar },
    { id: 'ai', label: 'AI Strategy', icon: ic.brain },
  ]

  // ════════════════════════════
  // RENDER
  // ════════════════════════════
  return (
    <div className="min-h-screen law-shell law-standard text-slate-900">
      <ToastContainer toasts={toasts} />
      <div className="pointer-events-none fixed inset-0 law-premium-bg" />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[420px] law-premium-radial" />

      {/* ═══ HEADER ═══ */}
      <header className="sticky top-0 z-50 border-b border-[#10263b] bg-[#11263a] shadow-[0_18px_60px_rgba(3,7,18,0.18)]">
        <div className="max-w-[1800px] mx-auto px-4 lg:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="law-header-brandmark law-float">
              <img src={lawBrandImage} alt="LAW" className="law-header-brandmark-image" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-[13px] font-bold tracking-wide text-white">LAW Financas</h1>
              <p className="text-[9px] text-white/45 uppercase tracking-[0.25em] -mt-0.5">Revenue Intelligence Suite</p>
            </div>
          </div>

          <div className="hidden md:flex items-center relative max-w-xl w-full mx-4">
            <I d={ic.search} size={14} cls="absolute left-3 text-slate-400" />
            <input ref={searchRef} placeholder="Buscar empresa, contato, tel... (Ctrl+K)" value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full h-10 pl-9 pr-3 rounded-xl text-xs bg-white border border-slate-200 text-slate-700 placeholder:text-slate-400 outline-none focus:border-[#d4a017]/40 transition-all" />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/55 font-mono hidden lg:block">
              {clockTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            {status?.ai?.model && (
              <span className="hidden xl:inline-flex items-center rounded-full border border-[#d4a017]/30 bg-[#d4a017] px-2.5 py-1 text-[10px] font-semibold tracking-[0.18em] text-[#11263a]">
                {status.ai.model}
              </span>
            )}
            {status?.lastSync && (
              <span className="text-[10px] text-white/45 font-mono hidden lg:block">
                sync {timeAgo(status.lastSync)}
              </span>
            )}
            <button onClick={doSync} disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold bg-[#d4a017] text-[#11263a] hover:bg-[#e0b429] transition-all disabled:opacity-50">
              <span className={syncing ? 'animate-spin-slow' : ''}><I d={ic.refresh} size={13} /></span>
              <span className="hidden sm:inline">{syncing ? 'Atualizando...' : 'Atualizar'}</span>
            </button>
            <div className="hidden lg:flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <div className={cn('h-2 w-2 rounded-full', notConfigured ? 'bg-red-400' : 'bg-emerald-400')} />
              <span className="text-[11px] text-white/80">user@mail.com</span>
            </div>
          </div>
        </div>
      </header>

      <div className="relative max-w-[1800px] mx-auto px-4 lg:px-6 py-6">
        <div className="flex items-start gap-6">
          <aside className="hidden lg:block w-[220px] shrink-0">
            <div className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
              <div className="px-3 pb-3 pt-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                Navegacao
              </div>
              <div className="space-y-1">
                {tabs.map(t => (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    className={cn(
                      'w-full flex items-center gap-2.5 rounded-xl px-3 py-3 text-[12px] font-semibold transition-all',
                      tab === t.id
                        ? 'bg-[#d4a017] text-[#11263a] shadow-[0_10px_30px_rgba(212,160,23,0.22)]'
                        : 'text-slate-600 hover:bg-slate-100'
                    )}>
                    <I d={t.icon} size={14} />
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <main className="relative min-w-0 flex-1">
            <div className="mb-4 flex gap-2 overflow-x-auto rounded-[20px] border border-slate-200 bg-white p-2 shadow-[0_10px_30px_rgba(15,23,42,0.04)] lg:hidden">
              {tabs.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold whitespace-nowrap',
                    tab === t.id ? 'bg-[#d4a017] text-[#11263a]' : 'text-slate-600 bg-slate-50'
                  )}>
                  <I d={t.icon} size={13} />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>

        {/* NOT CONFIGURED */}
        {notConfigured && (
          <div className="mb-6 rounded-[24px] border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-5 shadow-[0_14px_34px_rgba(245,158,11,0.08)]">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0 text-amber-400"><I d={ic.alert} size={20} /></div>
              <div>
                <h3 className="text-sm font-bold text-amber-700 mb-1">Configuracao Necessaria</h3>
                <p className="text-xs text-slate-600 leading-relaxed mb-3">O Pipedrive nao esta conectado. Verifique o arquivo <code className="text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded text-[10px]">.env</code>.</p>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-[10px] text-slate-500 leading-relaxed">
                  PIPEDRIVE_API_TOKEN=seu_token_aqui<br />PIPEDRIVE_COMPANY_DOMAIN=lawfinancas<br />PIPEDRIVE_PIPELINE_ID=14
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ COMMAND CENTER ═══ */}
        {tab === 'command' && (
          <div className="animate-slide-up">
            <div className="relative overflow-hidden mb-5 rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f5f7fa_55%,#eef2f6_100%)] px-6 py-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#11263a] via-[#d4a017] to-[#11263a]" />
              <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-[#d4a017]/10 blur-3xl" />
              <div className="pointer-events-none absolute bottom-0 right-20 h-24 w-24 rounded-full bg-[#11263a]/8 blur-3xl" />
              <div className="relative grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_420px]">
                <div>
                  <div className="mb-3 inline-flex items-center rounded-full border border-[#d4a017]/25 bg-[#d4a017]/10 px-3 py-1 text-[10px] font-semibold tracking-[0.22em] text-[#9a7300]">
                    LAW FINANCAS PREMIUM DESK
                  </div>
                  <h2 className="text-2xl font-black tracking-tight text-slate-900">{greeting}, Gabriel</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                    Operacao central de originacao FIDC com enriquecimento forte, priorizacao comercial e execucao orientada por IA.
                  </p>
                  <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {commandSignals.map(signal => (
                      <SignalTile key={signal.label} label={signal.label} value={signal.value} sub={signal.sub} color={signal.color} />
                    ))}
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#11263a]/10 bg-[linear-gradient(145deg,rgba(17,38,58,0.96),rgba(11,24,37,0.92))] p-5 text-white shadow-[0_20px_50px_rgba(15,23,42,0.18)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">Control tower</div>
                      <h3 className="mt-2 text-lg font-black">Radar operacional</h3>
                      <p className="mt-1 text-[11px] leading-relaxed text-white/65">
                        Visao consolidada da fila comercial, memoria de enriquecimento e ritmo do pipeline.
                      </p>
                    </div>
                    <div className={cn('h-2.5 w-2.5 rounded-full mt-1', isConnected ? 'bg-emerald-400' : 'bg-red-400')} />
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    {commandHealth.map(item => (
                      <div key={item.label} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-white/40">{item.label}</div>
                        <div className={cn('mt-2 text-2xl font-black font-mono', item.tone)}>{item.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.16em] text-white/40">Ultimo sync</div>
                        <div className="mt-1 text-sm font-semibold text-white/90">{status?.lastSync ? `${timeAgo(status.lastSync)} atras` : 'Ainda nao sincronizado'}</div>
                      </div>
                      <Badge color={status?.ai?.model ? '#d4a017' : '#64748b'}>{status?.ai?.model || 'IA offline'}</Badge>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 xl:grid-cols-5 gap-3 mb-5">
              <Stat icon={ic.target} label="Pipeline" value={totalDeals} sub="negocios ativos" accent />
              <Stat icon={ic.bar} label="Valor" value={fmtCurrency(dashboard?.totalValue || 0)} sub="valor bruto em aberto" />
              <Stat icon={ic.users} label="Handoff" value={outreachQueueStats.handoff || 0} sub="precisam de humano" />
              <Stat icon={ic.alert} label="Vencidas" value={overdueActs.length} sub="precisam atencao" />
              <Stat icon={ic.calendar} label="Follow-up" value={outreachQueueStats.followup_due || 0} sub="outreach para agir hoje" />
            </div>

            <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_360px]">
              <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Pipeline snapshot</div>
                    <h3 className="mt-1 text-sm font-bold text-slate-900">Distribuicao por etapa</h3>
                  </div>
                  <Badge color={stageFilter ? '#d4a017' : '#64748b'}>{stageFilter ? 'Filtro ativo' : 'Todas etapas'}</Badge>
                </div>
                {dashboard?.stageDistribution?.length > 0 ? (
                  <>
                    <div className="flex gap-1 rounded-lg overflow-hidden h-11 mt-2">
                      {dashboard.stageDistribution.map((s, i) => {
                        const total = dashboard.totalDeals || 1
                        const pct = Math.max((s.count / total) * 100, 4)
                        const color = STAGE_COLORS[i % STAGE_COLORS.length]
                        const isActive = stageFilter === String(s.id)
                        return (
                          <button key={s.id} className="relative group transition-all duration-300 rounded-md"
                            style={{ width: pct + '%', minWidth: '42px', background: isActive ? color + '55' : color + '26', outline: isActive ? `2px solid ${color}` : 'none', outlineOffset: '-2px' }}
                            onClick={() => setStageFilter(stageFilter === String(s.id) ? '' : String(s.id))}>
                            <div className="h-full flex flex-col items-center justify-center">
                              <span className="text-xs font-black" style={{ color }}>{s.count}</span>
                            </div>
                            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[9px] text-slate-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none z-10">{s.name}</div>
                          </button>
                        )
                      })}
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                      {dashboard.stageDistribution.map((s, i) => (
                        <div key={s.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-400">{s.name.split('-')[0]?.trim()?.substring(0, 14)}</div>
                          <div className="mt-1 text-sm font-black font-mono" style={{ color: STAGE_COLORS[i % STAGE_COLORS.length] }}>{s.count}</div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <EmptyState icon={ic.layers} title="Sem etapas carregadas" sub="Sincronize o pipeline para montar o snapshot" />
                )}
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Fila de atencao</div>
                    <h3 className="mt-1 text-sm font-bold text-slate-900">Outreach queue</h3>
                  </div>
                  <Badge color={priorityOutreachItems.length ? '#d4a017' : '#64748b'}>{priorityOutreachItems.length} prioridade(s)</Badge>
                </div>
                <div className="space-y-2">
                  {priorityOutreachItems.map(item => (
                    <button
                      key={item.deal_id}
                      onClick={() => {
                        const deal = deals.find(entry => entry.id === item.deal_id)
                        if (deal) {
                          setSelected(deal)
                          setDetailTab('actions')
                        }
                      }}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-left transition hover:border-[#d4a017]/35 hover:bg-[#d4a017]/5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[12px] font-semibold text-slate-900 truncate">{item.company || 'Deal sem nome'}</div>
                          <div className="mt-0.5 text-[10px] text-slate-500 truncate">{item.contact || 'Sem contato principal'}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Queue</div>
                          <div className="text-[15px] font-black font-mono text-[#11263a]">{item.queue_score || 0}</div>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge color={item.escalate_to_human ? '#ef4444' : '#0f766e'}>{formatStateLabel(item.state)}</Badge>
                        {item.fit_classification && <Badge color="#11263a">{item.fit_classification}</Badge>}
                        {item.followup_due_date && <Badge color="#d4a017">ate {fmtDate(item.followup_due_date)}</Badge>}
                      </div>
                      {item.rationale_short && <p className="mt-2 text-[11px] leading-relaxed text-slate-600">{item.rationale_short}</p>}
                    </button>
                  ))}
                  {priorityOutreachItems.length === 0 && (
                    <EmptyState icon={ic.link} title="Fila limpa" sub="Nenhum outreach urgente no momento" />
                  )}
                </div>
              </div>
            </div>
            {/* Deal List + Detail */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* DEAL LIST */}
              <div className="lg:col-span-4 xl:col-span-3">
                <div className="mb-3 rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Fila comercial</div>
                      <h3 className="mt-1 text-sm font-bold text-slate-900">Deals priorizados</h3>
                    </div>
                    <Badge color={focusMode === 'all' ? '#11263a' : '#d4a017'}>{visibleDeals.length}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {focusOptions.map(option => (
                      <button
                        key={option.id}
                        onClick={() => setFocusMode(option.id)}
                        className={cn(
                          'rounded-full border px-3 py-1.5 text-[10px] font-semibold transition',
                          focusMode === option.id ? 'shadow-sm' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
                        )}
                        style={focusMode === option.id ? { background: option.color + '12', borderColor: option.color + '55', color: option.color } : {}}
                      >
                        {option.label} {option.count}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <div className="md:hidden relative flex-1">
                    <I d={ic.search} size={12} cls="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)}
                      className="w-full h-8 pl-8 pr-3 rounded-lg text-xs bg-white border border-slate-200 text-slate-700 placeholder:text-slate-400 outline-none" />
                  </div>
                  <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
                    className="h-8 px-2 rounded-lg text-[10px] bg-white border border-slate-200 text-slate-600 outline-none">
                    <option value="">Todas ({totalDeals})</option>
                    {stages.map(s => <option key={s.id} value={s.id}>{s.name} ({deals.filter(d => d.stageId === s.id).length})</option>)}
                  </select>
                </div>
                <div className="space-y-1 max-h-[calc(100vh-340px)] overflow-y-auto pr-1">
                  {visibleDeals.length === 0 && <EmptyState icon={ic.inbox} title={notConfigured ? 'Configure o Pipedrive' : 'Nenhum negocio'} sub="Ajuste filtros ou sincronize" />}
                  {visibleDeals.map(d => {
                    const color = dealStageColor(d)
                    const priority = dealPriority(d)
                    const isSelected = selected?.id === d.id
                    const isOutreachHot = outreachAttentionDealIds.has(d.id)
                    return (
                      <div key={d.id} onClick={() => { setSelected(d); setDetailTab('actions') }}
                        className={cn(
                          'group rounded-[20px] border p-3 cursor-pointer transition-all duration-200',
                          isSelected ? 'border-[#d4a017]/40 bg-[#d4a017]/5 shadow-lg shadow-[#d4a017]/5' : 'border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300'
                        )}>
                        <div className="flex items-start gap-2.5">
                          <div className="w-1 h-8 rounded-full shrink-0 mt-0.5" style={{ background: color }} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] font-semibold text-slate-900 truncate">{highlightText(d.company || d.title, debouncedSearch)}</span>
                              {priority >= 50 && <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0 animate-pulse" />}
                              {isOutreachHot && <Badge color="#0f766e">outreach</Badge>}
                            </div>
                            <div className="text-[10px] text-slate-500 truncate mt-0.5">{highlightText(d.contact || 'Sem contato', debouncedSearch)}</div>
                            <div className="flex items-center gap-2 mt-1.5">
                              <Badge color={color}>{d.stageName?.split('-')[0]?.trim()?.substring(0, 15)}</Badge>
                              {d.activities?.overdue > 0 && <span className="text-[9px] text-red-400/80 font-medium">{d.activities.overdue} vencida{d.activities.overdue > 1 ? 's' : ''}</span>}
                              {d.activities?.pending > 0 && d.activities?.overdue === 0 && <span className="text-[9px] text-slate-400">{d.activities.pending} pendente{d.activities.pending > 1 ? 's' : ''}</span>}
                              {d.activities?.pending === 0 && d.activities?.overdue === 0 && <span className="text-[9px] text-amber-400/60 font-medium">sem atividade</span>}
                            </div>
                          </div>
                          <I d={ic.chevRight} size={14} cls={cn('shrink-0 text-slate-300 transition-all', isSelected ? 'text-[#d4a017]' : 'group-hover:text-slate-500')} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* DEAL DETAIL */}
              <div className="lg:col-span-8 xl:col-span-9">
                {selected ? (
                  <div className="space-y-3 animate-slide-up">
                    {/* Header Card */}
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h2 className="text-lg font-bold text-white/95">{selected.company || selected.title}</h2>
                            <Badge color={dealStageColor(selected)}>{selected.stageName?.split('-')[0]?.trim()}</Badge>
                          </div>
                          <p className="text-xs text-white/40">{selected.contact || 'Sem contato'}</p>
                          {selected.ownerName && <p className="text-[10px] text-white/20 mt-0.5">Responsavel: {selected.ownerName}</p>}
                        </div>
                        <button onClick={() => setSelected(null)} className="text-white/20 hover:text-white/50 transition p-1"><I d={ic.x} size={16} /></button>
                      </div>

                      {/* Quick Actions Bar */}
                      <div className="flex flex-wrap gap-2">
                        {selected.phone && (
                          <button onClick={() => doCopy(selected.phone, 'ph')}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] bg-white/[0.04] border border-white/[0.06] text-white/60 hover:bg-white/[0.08] hover:border-white/[0.1] transition-all">
                            <I d={ic.phone} size={13} />{selected.phone}
                            {copied === 'ph' && <span className="text-emerald-400 text-[9px]">copiado!</span>}
                          </button>
                        )}
                        {selected.email && (
                          <button onClick={() => doCopy(selected.email, 'em')}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] bg-white/[0.04] border border-white/[0.06] text-white/60 hover:bg-white/[0.08] hover:border-white/[0.1] transition-all truncate max-w-[260px]">
                            <I d={ic.mail} size={13} cls="shrink-0" /><span className="truncate">{selected.email}</span>
                          </button>
                        )}
                        <button onClick={() => genLinkedinMsg(selected)} disabled={aiLoading === 'lim-' + selected.id}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20 transition-all">
                          <I d={ic.link} size={13} />LinkedIn
                        </button>
                        <button onClick={() => setShowNoteModal(true)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] bg-white/[0.04] border border-white/[0.06] text-white/50 hover:bg-white/[0.08] transition-all">
                          <I d={ic.edit} size={13} />Nota
                        </button>
                        <button onClick={() => doAdvanceStage(selected)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold bg-[#d4a017]/12 border border-[#d4a017]/20 text-[#d4a017] hover:bg-[#d4a017]/20 transition-all">
                          <I d={ic.arrowRight} size={13} />Avancar
                        </button>
                        <button onClick={() => setShowAddActivity(true)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] bg-white/[0.04] border border-white/[0.06] text-white/50 hover:bg-white/[0.08] transition-all">
                          <I d={ic.plus} size={13} />Atividade
                        </button>
                        <button onClick={() => doLostDeal(selected)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] bg-red-500/8 border border-red-500/15 text-red-400/70 hover:bg-red-500/15 transition-all">
                          <I d={ic.x} size={13} />Perdido
                        </button>
                      </div>

                      {/* Mini stats */}
                      <div className="flex gap-4 mt-4 pt-3 border-t border-white/[0.04]">
                        <div className="text-center"><div className="text-[10px] text-white/20">No estagio</div><div className="text-sm font-bold text-white/60 font-mono">{selected.daysInStage}d</div></div>
                        <div className="text-center"><div className="text-[10px] text-white/20">Ult. atividade</div><div className="text-sm font-bold text-white/60 font-mono">{selected.daysSinceActivity < 999 ? selected.daysSinceActivity + 'd' : '-'}</div></div>
                        <div className="text-center"><div className="text-[10px] text-white/20">Pendentes</div><div className={cn('text-sm font-bold font-mono', selected.activities?.pending > 0 ? 'text-white/60' : 'text-amber-400/70')}>{selected.activities?.pending || 0}</div></div>
                        <div className="text-center"><div className="text-[10px] text-white/20">Vencidas</div><div className={cn('text-sm font-bold font-mono', selected.activities?.overdue > 0 ? 'text-red-400' : 'text-white/60')}>{selected.activities?.overdue || 0}</div></div>
                      </div>
                    </div>

                    {nextBestAction && (
                      <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(248,250,252,0.96))] p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge color={nextBestAction.color}>{nextBestAction.badge}</Badge>
                              <span className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Next Best Action</span>
                            </div>
                            <h3 className="mt-2 text-sm font-bold text-slate-900">{nextBestAction.title}</h3>
                            <p className="mt-1 text-[12px] leading-relaxed text-slate-600">{nextBestAction.description}</p>
                          </div>
                          <button
                            onClick={runNextBestAction}
                            className="h-10 shrink-0 rounded-xl px-4 text-[11px] font-semibold transition"
                            style={{ background: nextBestAction.color, color: '#ffffff' }}
                          >
                            {nextBestAction.cta}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Cadence Timeline */}
                    <CadenceTimeline dealId={selected.id} activities={activities} />

                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-[#11263a]/8 text-[#11263a] flex items-center justify-center">
                              <I d={ic.brain} size={15} />
                            </div>
                            <div>
                              <h3 className="text-sm font-bold text-slate-900">LinkedIn Outreach Intelligence</h3>
                              <p className="text-[11px] text-slate-500">Qualificacao comercial, decisor financeiro e proximo passo recomendado</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => loadOutreachState(selected.id)}
                            className="h-9 px-3 rounded-xl text-[11px] font-semibold border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 transition">
                            {outreachLoading === 'load-' + selected.id ? 'Atualizando...' : 'Atualizar'}
                          </button>
                          <button onClick={() => runOutreachAnalysis(selected)}
                            className="h-9 px-3 rounded-xl text-[11px] font-semibold bg-[#d4a017] text-[#11263a] hover:bg-[#e0b429] transition">
                            {outreachLoading === 'analyze-' + selected.id ? 'Analisando...' : 'Analisar fit'}
                          </button>
                        </div>
                      </div>

                      {(() => {
                        const outreach = outreachByDeal[selected.id]?.state
                        const linkedin = outreachByDeal[selected.id]?.linkedin
                        const enrichment = outreachByDeal[selected.id]?.enrichment
                        const replyResult = outreachReplyResults[selected.id]
                        const fitColor = outreach?.fitClassification === 'HIGH_FIT' ? '#10b981'
                          : outreach?.fitClassification === 'MEDIUM_FIT' ? '#d4a017'
                            : outreach?.fitClassification === 'LOW_FIT' ? '#f59e0b'
                              : outreach?.fitClassification === 'DO_NOT_CONTACT' ? '#ef4444'
                                : '#64748b'
                        return (
                          <div className="mt-4 grid grid-cols-1 xl:grid-cols-[220px_minmax(0,1fr)] gap-4">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Lead Score</div>
                              <div className="mt-2 text-4xl font-black font-mono" style={{ color: fitColor }}>{outreach?.leadScore ?? '--'}</div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <Badge color={fitColor}>{outreach?.fitClassification || 'SEM ANALISE'}</Badge>
                                <Badge color="#11263a">{outreach?.state || 'NEW_LEAD'}</Badge>
                              </div>
                              <div className="mt-3 space-y-2 text-[11px] text-slate-600">
                                <div><span className="text-slate-400">Persona:</span> {outreach?.personaType || 'Nao definida'}</div>
                                <div><span className="text-slate-400">Decision power:</span> {outreach?.decisionPower || '-'}</div>
                                <div><span className="text-slate-400">Follow-up:</span> {outreach?.followupDays ?? '-'} dia(s)</div>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 mb-2">Abordagem</div>
                                <p className="text-[12px] text-slate-700 leading-relaxed">{outreach?.recommendedApproach || 'Execute a analise para montar o plano de abordagem.'}</p>
                                {outreach?.rationaleShort && <p className="mt-3 text-[11px] text-slate-500 italic">{outreach.rationaleShort}</p>}
                                {linkedin?.linkedinUrl && <p className="mt-3 text-[11px] text-blue-600 break-all">LinkedIn: {linkedin.linkedinUrl}</p>}
                                {enrichment?.summary && <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">{enrichment.summary}</p>}
                                <div className="mt-4 flex flex-wrap gap-2">
                                  <button
                                    onClick={() => executeOutreach(selected, 'connection_note', true)}
                                    className="h-9 px-3 rounded-xl text-[11px] font-semibold bg-[#11263a] text-white hover:bg-[#0c1b2a] transition">
                                    {outreachActionLoading === `connection_note-${selected.id}` ? 'Processando...' : 'Conexao IA'}
                                  </button>
                                  <button
                                    onClick={() => executeOutreach(selected, 'first_message', true)}
                                    className="h-9 px-3 rounded-xl text-[11px] font-semibold bg-[#d4a017] text-[#11263a] hover:bg-[#e0b429] transition">
                                    {outreachActionLoading === `first_message-${selected.id}` ? 'Processando...' : '1a Mensagem IA'}
                                  </button>
                                </div>
                              </div>
                              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 mb-2">Riscos e Tags</div>
                                <div className="space-y-2">
                                  {(outreach?.risks || []).slice(0, 4).map((risk, i) => (
                                    <div key={i} className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[11px] text-red-700">{risk}</div>
                                  ))}
                                  {(!outreach?.risks || outreach.risks.length === 0) && (
                                    <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">Sem riscos relevantes registrados.</div>
                                  )}
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {(outreach?.tags || []).map(tag => <Badge key={tag} color="#11263a">{tag}</Badge>)}
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4 xl:col-span-2">
                              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <div className="flex items-center justify-between gap-3 mb-3">
                                  <div>
                                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Console de Reply</div>
                                    <p className="text-[11px] text-slate-500 mt-1">Cole a resposta recebida no LinkedIn para a IA classificar, redigir a proxima resposta e sinalizar handoff.</p>
                                  </div>
                                  <button
                                    onClick={() => processOutreachReply(selected)}
                                    className="h-9 px-3 rounded-xl text-[11px] font-semibold bg-slate-900 text-white hover:bg-slate-800 transition">
                                    {outreachActionLoading === `reply-${selected.id}` ? 'Processando...' : 'Processar reply'}
                                  </button>
                                </div>
                                <textarea
                                  value={outreachReplyDrafts[selected.id] || ''}
                                  onChange={e => setOutreachReplyDrafts(prev => ({ ...prev, [selected.id]: e.target.value }))}
                                  className="w-full min-h-[108px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[12px] text-slate-700 outline-none focus:border-[#d4a017] focus:bg-white transition"
                                  placeholder="Ex.: Gostei do tema, mas preciso entender melhor como isso funcionaria para nossa estrutura."
                                />
                                {replyResult?.response?.messageText && (
                                  <div className="mt-4 rounded-2xl border border-[#d4a017]/20 bg-[linear-gradient(135deg,rgba(212,160,23,0.08),rgba(255,255,255,0.96))] p-4">
                                    <div className="flex flex-wrap items-center gap-2 mb-2">
                                      <Badge color="#11263a">{replyResult.classification?.classification || 'SEM CLASSIFICACAO'}</Badge>
                                      {replyResult.classification?.subtype && <Badge color="#64748b">{replyResult.classification.subtype}</Badge>}
                                      <Badge color={replyResult.response?.escalateToHuman ? '#ef4444' : '#10b981'}>
                                        {replyResult.response?.recommendedAction || 'ANSWER_AND_ADVANCE'}
                                      </Badge>
                                    </div>
                                    <p className="text-[12px] text-slate-700 leading-relaxed whitespace-pre-line">{replyResult.response.messageText}</p>
                                    {replyResult.response?.rationaleShort && <p className="mt-2 text-[11px] text-slate-500 italic">{replyResult.response.rationaleShort}</p>}
                                  </div>
                                )}
                              </div>

                              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 mb-3">Historico Recente</div>
                                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                                  {(outreach?.messageHistory || []).slice(-6).reverse().map((item, idx) => (
                                    <div key={`${item.at}-${idx}`} className={cn(
                                      'rounded-2xl px-3 py-2 text-[11px] border',
                                      item.role === 'assistant' ? 'bg-[#11263a] text-white border-[#11263a]' : 'bg-white text-slate-700 border-slate-200'
                                    )}>
                                      <div className={cn('text-[10px] uppercase tracking-[0.12em] mb-1', item.role === 'assistant' ? 'text-white/50' : 'text-slate-400')}>
                                        {item.role === 'assistant' ? 'LAW IA' : 'Lead'} {item.at ? `· ${fmtDateTime(item.at)}` : ''}
                                      </div>
                                      <div className="leading-relaxed whitespace-pre-line">{item.text}</div>
                                    </div>
                                  ))}
                                  {(!outreach?.messageHistory || outreach.messageHistory.length === 0) && (
                                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-4 text-[11px] text-slate-500 text-center">
                                      Ainda nao ha historico de conversa armazenado.
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })()}
                    </div>

                    {/* Detail Tabs */}
                    <div className="flex gap-0.5 p-0.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                      {[{ id: 'actions', label: 'AI Arsenal' }, { id: 'activities', label: 'Atividades' }].map(t => (
                        <button key={t.id} onClick={() => setDetailTab(t.id)}
                          className={cn('flex-1 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all',
                            detailTab === t.id ? 'bg-white/[0.06] text-white/80' : 'text-white/30 hover:text-white/50'
                          )}>{t.label}</button>
                      ))}
                    </div>

                    {/* AI Arsenal */}
                    {detailTab === 'actions' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        <AICard title="LinkedIn Conexao" color="#3b82f6" icon="in"
                          variations={liNotes[selected.id]?.variations} content={liNotes[selected.id]?.text}
                          loading={aiLoading === 'li-' + selected.id}
                          onGenerate={() => genLinkedin(selected)}
                          onCopy={(t) => doCopy(t, 'li')} copied={copied === 'li'}
                          btnLabel="Gerar nota conexao" />
                        <AICard title="Mensagem LinkedIn" color="#06b6d4" icon="M"
                          variations={liMessages[selected.id]?.variations} content={liMessages[selected.id]?.text}
                          loading={aiLoading === 'lim-' + selected.id}
                          onGenerate={() => genLinkedinMsg(selected)}
                          onCopy={(t) => doCopy(t, 'lim')} copied={copied === 'lim'}
                          btnLabel="Gerar mensagem pos-conexao" />
                        <AICard title="Pesquisa Empresa" color="#8b5cf6" icon="Q"
                          content={research[selected.id]?.text}
                          loading={aiLoading === 'res-' + selected.id}
                          onGenerate={() => genResearch(selected)}
                          onCopy={(t) => doCopy(t, 'res')} copied={copied === 'res'}
                          btnLabel="Pesquisar com IA" />
                        <AICard title="Script Ligacao" color="#10b981" icon="S"
                          variations={scripts[selected.id]?.variations} content={scripts[selected.id]?.text}
                          loading={aiLoading === 'sc-' + selected.id}
                          onGenerate={() => genScript(selected)}
                          onCopy={(t) => doCopy(t, 'sc')} copied={copied === 'sc'}
                          btnLabel="Gerar roteiro" />
                        <AICard title="Email Draft" color="#f59e0b" icon="@"
                          variations={emails[selected.id]?.variations} content={emails[selected.id]?.text}
                          loading={aiLoading === 'em-' + selected.id}
                          onGenerate={() => genEmail(selected, 'intro')}
                          onCopy={(t) => doCopy(t, 'eml')} copied={copied === 'eml'}
                          btnLabel="Gerar email" />
                      </div>
                    )}

                    {/* Activities with AI Execute */}
                    {detailTab === 'activities' && (
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-xs font-semibold text-white/60">Atividades Pendentes</h3>
                          <button onClick={() => setShowAddActivity(true)} className="text-[10px] text-[#d4a017] hover:underline">+ Nova</button>
                        </div>
                        <div className="space-y-1.5 max-h-80 overflow-y-auto">
                          {activities.filter(a => a.deal_id === selected.id).length === 0 && (
                            <p className="text-[10px] text-white/15 py-4 text-center">Nenhuma atividade pendente</p>
                          )}
                          {activities.filter(a => a.deal_id === selected.id).map(act => {
                            const aiInfo = getActivityAILabel(act)
                            return (
                              <div key={act.id} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition group">
                                <button onClick={() => doComplete(act.id)}
                                  className="w-5 h-5 rounded-md border border-white/10 flex items-center justify-center hover:border-emerald-400 hover:bg-emerald-400/10 transition shrink-0">
                                  <I d={ic.check} size={10} cls="opacity-0 group-hover:opacity-30" />
                                </button>
                                <div className="flex-1 min-w-0">
                                  <span className="text-[11px] text-white/65 block truncate">{act.subject}</span>
                                  <span className="text-[9px] text-white/25">{act.type} &middot; {act.due_date || 'sem data'}</span>
                                </div>
                                {act.due_date && act.due_date < todayStr && <Badge color="#ef4444" pulse>VENCIDA</Badge>}
                                <button onClick={() => setAiExecModal({ activity: act, deal: selected })}
                                  className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-semibold bg-[#d4a017]/10 border border-[#d4a017]/20 text-[#d4a017] hover:bg-[#d4a017]/20 transition-all opacity-0 group-hover:opacity-100">
                                  <I d={ic.bot} size={10} />{aiInfo.label}
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <EmptyState icon={ic.target} title="Selecione um negocio" sub="Escolha um deal para ver detalhes e acoes" />
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ KANBAN ═══ */}
        {tab === 'pipeline' && (
          <div className="animate-slide-up">
            <div className="flex gap-3 overflow-x-auto pb-4">
              {stages.map((stage, i) => {
                const stageDeals = deals.filter(d => d.stageId === stage.id)
                const color = STAGE_COLORS[i % STAGE_COLORS.length]
                const isDrop = dropTarget === stage.id
                return (
                  <div key={stage.id} className="min-w-[280px] max-w-[320px] flex-shrink-0"
                    onDragOver={e => onDragOver(e, stage.id)} onDragLeave={onDragLeave} onDrop={e => onDrop(e, stage.id)}>
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                      <span className="text-[11px] font-semibold text-white/60 truncate">{stage.name}</span>
                      <span className="text-[10px] font-mono text-white/20 ml-auto">{stageDeals.length}</span>
                    </div>
                    <div className={cn('space-y-1.5 max-h-[calc(100vh-250px)] overflow-y-auto pr-1 rounded-lg p-1 transition-all', isDrop && 'kanban-drop-target')}>
                      {stageDeals.length === 0 && (
                        <div className="rounded-lg border border-dashed border-white/[0.04] p-4 text-center">
                          <span className="text-[10px] text-white/10">Vazio</span>
                        </div>
                      )}
                      {stageDeals.map(d => (
                        <div key={d.id} draggable onDragStart={e => onDragStart(e, d)} onDragEnd={onDragEnd}
                          onClick={() => { setSelected(d); setTab('command'); setDetailTab('actions') }}
                          className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-3 cursor-grab hover:bg-white/[0.04] hover:border-white/[0.08] transition-all group active:cursor-grabbing">
                          <div className="text-[12px] font-semibold text-white/80 truncate mb-1">{d.company || d.title}</div>
                          <div className="text-[10px] text-white/30 truncate">{d.contact || 'Sem contato'}</div>
                          <div className="flex items-center gap-2 mt-2">
                            {d.phone && <button onClick={e => { e.stopPropagation(); doCopy(d.phone, 'kp' + d.id) }} className="text-white/15 hover:text-white/40 transition"><I d={ic.phone} size={11} /></button>}
                            {d.email && <button onClick={e => { e.stopPropagation(); doCopy(d.email, 'ke' + d.id) }} className="text-white/15 hover:text-white/40 transition"><I d={ic.mail} size={11} /></button>}
                            <span className="ml-auto text-[9px] text-white/15 font-mono">{d.daysInStage}d</span>
                            {d.activities?.pending > 0 && <Badge color={d.activities?.overdue > 0 ? '#ef4444' : '#6b7280'}>{d.activities.pending}</Badge>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ═══ ACTIVITIES ═══ */}
        {tab === 'activities' && (
          <div className="animate-slide-up space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Today */}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-[#d4a017]/10 flex items-center justify-center text-[#d4a017]"><I d={ic.calendar} size={14} /></div>
                  <h3 className="text-sm font-bold text-white/80">Hoje</h3>
                  <Badge color="#d4a017">{todayActs.length}</Badge>
                </div>
                <div className="space-y-1.5 max-h-[55vh] overflow-y-auto">
                  {todayActs.map(act => {
                    const aiInfo = getActivityAILabel(act)
                    return (
                      <div key={act.id} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition group">
                        <button onClick={() => doComplete(act.id)}
                          className="w-5 h-5 rounded-md border border-white/10 flex items-center justify-center hover:border-emerald-400 hover:bg-emerald-400/10 transition shrink-0">
                          <I d={ic.check} size={10} cls="opacity-0 group-hover:opacity-40" />
                        </button>
                        <div className="flex-1 min-w-0">
                          <span className="text-[11px] text-white/70 block truncate">{act.subject}</span>
                          <span className="text-[9px] text-white/25">{act.type} &middot; {act.deal_title || ''}</span>
                        </div>
                        <button onClick={() => setAiExecModal({ activity: act, deal: deals.find(d => d.id === act.deal_id) })}
                          className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-semibold bg-[#d4a017]/10 border border-[#d4a017]/20 text-[#d4a017] hover:bg-[#d4a017]/20 transition-all opacity-0 group-hover:opacity-100">
                          <I d={ic.bot} size={10} />{aiInfo.label}
                        </button>
                      </div>
                    )
                  })}
                  {todayActs.length === 0 && <EmptyState icon={ic.check} title="Agenda limpa!" sub="Nenhuma atividade para hoje" />}
                </div>
              </div>

              {/* Overdue */}
              <div className="rounded-xl border border-red-500/10 bg-red-500/[0.02] p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400"><I d={ic.alert} size={14} /></div>
                  <h3 className="text-sm font-bold text-red-400/80">Vencidas</h3>
                  <Badge color="#ef4444" pulse>{overdueActs.length}</Badge>
                </div>
                <div className="space-y-1.5 max-h-[55vh] overflow-y-auto">
                  {overdueActs.map(act => {
                    const aiInfo = getActivityAILabel(act)
                    return (
                      <div key={act.id} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition group">
                        <button onClick={() => doComplete(act.id)}
                          className="w-5 h-5 rounded-md border border-red-500/20 flex items-center justify-center hover:border-emerald-400 hover:bg-emerald-400/10 transition shrink-0">
                          <I d={ic.check} size={10} cls="opacity-0 group-hover:opacity-40" />
                        </button>
                        <div className="flex-1 min-w-0">
                          <span className="text-[11px] text-white/70 block truncate">{act.subject}</span>
                          <span className="text-[9px] text-red-400/50">{act.type} &middot; {act.due_date}</span>
                        </div>
                        <button onClick={() => setAiExecModal({ activity: act, deal: deals.find(d => d.id === act.deal_id) })}
                          className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-semibold bg-[#d4a017]/10 border border-[#d4a017]/20 text-[#d4a017] hover:bg-[#d4a017]/20 transition-all opacity-0 group-hover:opacity-100">
                          <I d={ic.bot} size={10} />{aiInfo.label}
                        </button>
                      </div>
                    )
                  })}
                  {overdueActs.length === 0 && <EmptyState icon={ic.check} title="Tudo em dia!" sub="Nenhuma vencida" />}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ ENRICHMENT TAB ═══ */}
        {tab === 'enrich' && (
          <div className="animate-slide-up space-y-4">
            {/* Header */}
            <div className="relative overflow-hidden rounded-[26px] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f7f8fa_52%,#eef2f6_100%)] p-5 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#11263a] via-[#d4a017] to-[#11263a]" />
              <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-[#d4a017]/12 blur-3xl" />
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Enriquecimento IA</h2>
                <p className="text-xs text-slate-600">
                  {enrichDeals.length} leads incompletos em <span className="text-[#d4a017]">{importStage?.name || 'Importacao'}</span>
                  {prospStage && <span className="text-slate-400"> &rarr; mover para {prospStage.name}</span>}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
                  <span className="rounded-full border border-[#d4a017]/20 bg-[#d4a017]/10 px-2.5 py-1 font-semibold tracking-[0.18em] text-[#9a7300]">
                    OPENAI {status?.ai?.model || 'gpt-5.2'}
                  </span>
                  <span className="text-slate-500">Historico ativo: {enrichHistory.length} empresas</span>
                  <span className="text-slate-500">Puladas automaticamente: {enrichSkippedHistory}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-white border border-slate-200 shadow-sm">
                  <span className="text-[10px] text-slate-500">Qtd:</span>
                  <input type="number" min="1" max={enrichDeals.length || 100} value={enrichCount}
                    onChange={e => setEnrichCount(Math.max(1, Math.min(parseInt(e.target.value) || 1, enrichDeals.length || 100)))}
                    className="w-14 bg-transparent text-[12px] font-mono text-[#d4a017] font-bold text-center outline-none" />
                  <span className="text-[10px] text-slate-400">/{enrichDeals.length}</span>
                </div>
                <button onClick={doEnrichBatch} disabled={enriching || enrichDeals.length === 0}
                  className="h-9 px-5 rounded-lg text-[11px] font-bold bg-gradient-to-r from-[#d4a017] to-[#b8860b] text-black disabled:opacity-30 transition hover:shadow-lg hover:shadow-[#d4a017]/20 flex items-center gap-1.5">
                  <I d={ic.bot} size={14} />
                  {enriching ? `${enrichProgress.current}/${enrichProgress.total}...` : `Enriquecer ${enrichCount} leads`}
                </button>
              </div>
            </div>
            </div>

            {/* Progress bar */}
            {enriching && (
              <div className="rounded-xl border border-[#d4a017]/20 bg-[#d4a017]/5 p-4">
                <div className="flex items-center gap-3 mb-2">
                  <Spinner size={16} />
                  <span className="text-[12px] text-[#d4a017] font-semibold">Enriquecendo {enrichProgress.current}/{enrichProgress.total}...</span>
                  <span className="text-[10px] text-white/20 ml-auto">Os resultados aparecem abaixo em tempo real</span>
                </div>
                <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full bg-[#d4a017] transition-all duration-500 progress-shimmer"
                    style={{ width: (enrichProgress.current / Math.max(enrichProgress.total, 1) * 100) + '%' }} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-4">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[12px] font-bold text-white/70">Fila pronta para enriquecimento</h3>
                  <span className="text-[10px] text-white/25">A IA ignora empresas ja processadas com sucesso</span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div><div className="text-lg font-bold font-mono text-[#f2cf66]">{enrichDeals.length}</div><div className="text-[9px] text-white/30">Na fila</div></div>
                  <div><div className="text-lg font-bold font-mono text-white/50">{enrichSkippedHistory}</div><div className="text-[9px] text-white/30">No historico</div></div>
                  <div><div className="text-lg font-bold font-mono text-emerald-400">{enrichHistory.filter(h => h.status === 'approved').length}</div><div className="text-[9px] text-white/30">Aprovadas</div></div>
                </div>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[12px] font-bold text-white/70">Historico recente</h3>
                  <span className="text-[10px] text-white/20">{enrichHistory.length} registradas</span>
                </div>
                <div className="space-y-2 max-h-[220px] overflow-y-auto">
                  {enrichHistory.slice(0, 6).map(item => (
                    <div key={item.companyKey} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-white/75 truncate">{item.companyName}</span>
                        <Badge color={item.status === 'approved' ? '#10b981' : item.status === 'failed' ? '#ef4444' : '#d4a017'}>
                          {item.status === 'approved' ? 'APROVADA' : item.status === 'failed' ? 'FALHA' : 'PROCESSADA'}
                        </Badge>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[10px] text-white/28">
                        <span>{item.score != null ? `FIDC ${item.score}/100` : 'Score pendente'}</span>
                        <span>{item.lastAttemptAt ? fmtDateTime(item.lastAttemptAt) : '-'}</span>
                      </div>
                    </div>
                  ))}
                  {enrichHistory.length === 0 && <EmptyState icon={ic.clock} title="Sem historico ainda" sub="Os proximos enriquecimentos passam a alimentar esta memoria" />}
                </div>
              </div>
            </div>

            {/* Results with approval */}
            {enrichResults.length > 0 && (
              <div className="space-y-3">
                {/* Summary */}
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[12px] font-bold text-white/60">Resultados — Aprovar para mover a Prospeccao</h3>
                    {!enriching && (() => {
                      const approvable = enrichResults.filter(r => r.success && r.fields_updated?.length > 0 && enrichApproval[r.deal_id] !== 'done')
                      return approvable.length > 0 ? (
                        <button onClick={doApproveAll}
                          className="h-8 px-4 rounded-lg text-[10px] font-bold bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/25 transition flex items-center gap-1.5">
                          <I d={ic.check} size={12} />
                          Aprovar todos ({approvable.length}) e mover
                        </button>
                      ) : null
                    })()}
                  </div>

                  <div className="grid grid-cols-4 gap-3 text-center mb-4">
                    <div><div className="text-lg font-bold font-mono text-emerald-400">{enrichResults.filter(r => r.success && r.fields_updated?.length > 0).length}</div><div className="text-[9px] text-white/30">Enriquecidos</div></div>
                    <div><div className="text-lg font-bold font-mono text-white/40">{enrichResults.filter(r => r.success && (!r.fields_updated || r.fields_updated.length === 0)).length}</div><div className="text-[9px] text-white/30">Sem novos dados</div></div>
                    <div><div className="text-lg font-bold font-mono text-red-400">{enrichResults.filter(r => !r.success).length}</div><div className="text-[9px] text-white/30">Falhas</div></div>
                    <div><div className="text-lg font-bold font-mono text-[#d4a017]">{Object.values(enrichApproval).filter(v => v === 'done').length}</div><div className="text-[9px] text-white/30">Movidos</div></div>
                  </div>

                  {/* Individual results */}
                  <div className="space-y-2 max-h-[55vh] overflow-y-auto">
                    {enrichResults.map((r, i) => {
                      const approval = enrichApproval[r.deal_id]
                      const hasData = r.success && r.fields_updated?.length > 0
                      return (
                        <div key={r.deal_id || i} className={cn(
                          'rounded-lg border p-3 transition-all',
                          approval === 'done' ? 'border-emerald-500/20 bg-emerald-500/5' :
                          hasData ? 'border-[#d4a017]/15 bg-[#d4a017]/5' :
                          !r.success ? 'border-red-500/15 bg-red-500/5' :
                          'border-white/[0.06] bg-white/[0.02]'
                        )}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[12px] font-semibold text-white/80">{r._company || `Deal #${r.deal_id}`}</span>
                                {approval === 'done' && <Badge color="#10b981">MOVIDO</Badge>}
                                {!r.success && <Badge color="#ef4444">FALHA</Badge>}
                                {r.skipped && <Badge color="#64748b">HISTORICO</Badge>}
                                {hasData && !approval && <Badge color="#d4a017">PRONTO</Badge>}
                              </div>

                              {r.success && r.data_found && (() => {
                                const emp = r.data_found.company || {}
                                const pes = r.data_found.pessoa || {}
                                const fidc = r.data_found.fidc_potential || {}
                                return (
                                  <div className="mt-2 space-y-2">
                                    {/* Empresa */}
                                    <div className="rounded-md bg-white/[0.03] border border-white/[0.05] p-2">
                                      <div className="text-[9px] uppercase tracking-wider text-[#d4a017]/60 font-bold mb-1">Empresa</div>
                                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-0.5 text-[10px]">
                                        {emp.nome_fantasia && <div><span className="text-white/25">Nome Fantasia:</span> <span className="text-white/70">{emp.nome_fantasia}</span></div>}
                                        {emp.razao_social && <div><span className="text-white/25">Razao Social:</span> <span className="text-white/60">{emp.razao_social}</span></div>}
                                        {emp.cnpj && <div><span className="text-white/25">CNPJ:</span> <span className="text-white/60 font-mono">{emp.cnpj}</span></div>}
                                        {emp.data_abertura && <div><span className="text-white/25">Abertura:</span> <span className="text-white/60">{emp.data_abertura}</span></div>}
                                        {emp.faturamento_anual && <div><span className="text-white/25">Faturamento:</span> <span className="text-emerald-400 font-semibold">{emp.faturamento_anual}</span></div>}
                                        {emp.num_funcionarios && <div><span className="text-white/25">Funcionarios:</span> <span className="text-white/60">{emp.num_funcionarios}</span></div>}
                                        {emp.num_filiais && <div><span className="text-white/25">Filiais:</span> <span className="text-white/60">{emp.num_filiais}</span></div>}
                                        {emp.segmento && <div><span className="text-white/25">Segmento:</span> <span className="text-white/60">{emp.segmento}</span></div>}
                                        {emp.cnae_primario && <div><span className="text-white/25">CNAE:</span> <span className="text-white/60">{emp.cnae_primario}</span></div>}
                                        {emp.telefone && <div><span className="text-white/25">Tel:</span> <span className="text-emerald-400">{emp.telefone}</span></div>}
                                        {emp.email && <div><span className="text-white/25">Email:</span> <span className="text-emerald-400">{emp.email}</span></div>}
                                        {emp.site && <div><span className="text-white/25">Site:</span> <span className="text-blue-400">{emp.site}</span></div>}
                                        {emp.linkedin && <div><span className="text-white/25">LinkedIn:</span> <span className="text-blue-400">{emp.linkedin}</span></div>}
                                        {(emp.cidade || emp.estado) && <div><span className="text-white/25">Local:</span> <span className="text-white/60">{[emp.cidade, emp.estado].filter(Boolean).join(' / ')}</span></div>}
                                        {emp.endereco && <div className="col-span-2"><span className="text-white/25">Endereco:</span> <span className="text-white/50">{emp.endereco}</span></div>}
                                      </div>
                                    </div>
                                    {/* Pessoa / Contato */}
                                    {(pes.nome || pes.telefone || pes.email) && (
                                      <div className="rounded-md bg-white/[0.03] border border-white/[0.05] p-2">
                                        <div className="text-[9px] uppercase tracking-wider text-blue-400/60 font-bold mb-1">Contato / Decisor</div>
                                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-0.5 text-[10px]">
                                          {pes.nome && <div><span className="text-white/25">Nome:</span> <span className="text-white/70 font-semibold">{pes.nome}</span></div>}
                                          {pes.cargo && <div><span className="text-white/25">Cargo:</span> <span className="text-white/60">{pes.cargo}</span></div>}
                                          {pes.telefone && <div><span className="text-white/25">Tel:</span> <span className="text-emerald-400">{pes.telefone}</span></div>}
                                          {pes.email && <div><span className="text-white/25">Email:</span> <span className="text-emerald-400">{pes.email}</span></div>}
                                          {pes.linkedin && <div><span className="text-white/25">LinkedIn:</span> <span className="text-blue-400">{pes.linkedin}</span></div>}
                                        </div>
                                      </div>
                                    )}
                                    {/* FIDC Score + Resumo */}
                                    <div className="flex items-center gap-3 text-[10px]">
                                      {fidc.score != null && (
                                        <span className="px-2 py-0.5 rounded bg-[#d4a017]/10 border border-[#d4a017]/20 text-[#d4a017] font-bold">
                                          FIDC {fidc.score}/100
                                        </span>
                                      )}
                                      {r.fields_updated?.length > 0 && (
                                        <span className="text-emerald-400/60">Atualizado: {r.fields_updated.join(', ')}</span>
                                      )}
                                    </div>
                                  </div>
                                )
                              })()}

                              {r.data_found?.resumo && (
                                <p className="text-[10px] text-white/30 mt-1.5 italic leading-relaxed">{r.data_found.resumo}</p>
                              )}

                              {r.error && <p className="text-[10px] text-red-400/70 mt-1">{r.error}</p>}
                              {r.skipped && <p className="text-[10px] text-white/35 mt-1">Empresa ignorada porque ja existe enriquecimento salvo no historico.</p>}
                            </div>

                            {/* Approval button */}
                            <div className="shrink-0">
                              {hasData && approval !== 'done' && (
                                <button onClick={() => doApproveAndMove(r.deal_id)}
                                  disabled={approval === 'moving'}
                                  className="h-8 px-3 rounded-lg text-[10px] font-bold bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/25 transition flex items-center gap-1.5 disabled:opacity-50">
                                  {approval === 'moving' ? <Spinner size={12} /> : <I d={ic.arrowRight} size={12} />}
                                  {approval === 'moving' ? 'Movendo...' : 'Aprovar & Mover'}
                                </button>
                              )}
                              {approval === 'done' && (
                                <span className="text-[10px] text-emerald-400/60 font-medium flex items-center gap-1">
                                  <I d={ic.check} size={12} /> Em Prospeccao
                                </span>
                              )}
                              {approval === 'error' && (
                                <button onClick={() => doApproveAndMove(r.deal_id)}
                                  className="h-8 px-3 rounded-lg text-[10px] font-bold bg-red-500/15 border border-red-500/25 text-red-400 hover:bg-red-500/25 transition">
                                  Tentar novamente
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Deals list (preview) */}
            {enrichResults.length === 0 && !enriching && (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                <div className="p-3 border-b border-white/[0.04]">
                  <span className="text-[10px] uppercase tracking-wider text-white/20 font-semibold">
                    Primeiros {Math.min(enrichCount, enrichDeals.length)} leads que serao enriquecidos
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className="text-left p-3 text-white/25 font-medium">#</th>
                        <th className="text-left p-3 text-white/25 font-medium">Empresa</th>
                        <th className="text-left p-3 text-white/25 font-medium">Contato</th>
                        <th className="text-center p-3 text-white/25 font-medium">Tel</th>
                        <th className="text-center p-3 text-white/25 font-medium">Email</th>
                        <th className="text-center p-3 text-white/25 font-medium">Dados faltantes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enrichDeals.slice(0, enrichCount).map((d, i) => (
                        <tr key={d.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition">
                          <td className="p-3 text-white/15 font-mono">{i + 1}</td>
                          <td className="p-3 text-white/70 font-medium truncate max-w-[200px]">{d.company || d.title}</td>
                          <td className="p-3 text-white/40 truncate max-w-[150px]">{d.contact || '-'}</td>
                          <td className="p-3 text-center">{d.missing.includes('phone') ? <span className="text-red-400">&#10006;</span> : <span className="text-emerald-400">&#10004;</span>}</td>
                          <td className="p-3 text-center">{d.missing.includes('email') ? <span className="text-red-400">&#10006;</span> : <span className="text-emerald-400">&#10004;</span>}</td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {d.missing.map(m => (
                                <span key={m} className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400/70">{m}</span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {enrichDeals.length === 0 && <EmptyState icon={ic.check} title="Nenhum lead incompleto nesta etapa!" sub="Todos os leads de Importacao ja tem dados" />}
              </div>
            )}
          </div>
        )}

        {/* ═══ METRICS TAB ═══ */}
        {tab === 'metrics' && (
          <div className="animate-slide-up space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Metricas do Pipeline</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {/* Conversion Funnel */}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <h3 className="text-[10px] uppercase tracking-wider text-white/25 font-semibold mb-3">Funil de Conversao</h3>
                {dashboard?.funnel && <FunnelBar stages={dashboard.funnel} maxCount={Math.max(...dashboard.funnel.map(s => s.count), 1)} />}
              </div>

              {/* Stage Velocity */}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <h3 className="text-[10px] uppercase tracking-wider text-white/25 font-semibold mb-3">Velocidade por Etapa (dias)</h3>
                {dashboard?.stageVelocity && (
                  <div className="space-y-2">
                    {dashboard.stageVelocity.map((s, i) => (
                      <div key={s.id} className="flex items-center gap-2">
                        <span className="text-[9px] text-white/30 w-20 truncate text-right">{s.name.split('-')[0]?.trim()?.substring(0, 12)}</span>
                        <div className="flex-1 h-4 rounded bg-white/[0.03] overflow-hidden">
                          <div className="h-full rounded transition-all" style={{ width: Math.min((s.avgDays / 30) * 100, 100) + '%', background: STAGE_COLORS[i % STAGE_COLORS.length] + '50' }} />
                        </div>
                        <span className="text-[10px] font-mono text-white/40 w-8 text-right">{s.avgDays}d</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Activity Types Donut */}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <h3 className="text-[10px] uppercase tracking-wider text-white/25 font-semibold mb-3">Atividades por Tipo</h3>
                <div className="flex items-center gap-4">
                  <DonutChart data={actTypeData} size={80} />
                  <div className="space-y-1">
                    {actTypeData.map(d => (
                      <div key={d.label} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                        <span className="text-[10px] text-white/40">{d.label}</span>
                        <span className="text-[10px] font-mono text-white/25">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Key Numbers */}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <h3 className="text-[10px] uppercase tracking-wider text-white/25 font-semibold mb-3">Indicadores</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center"><span className="text-[11px] text-white/40">Total Pipeline</span><span className="text-[13px] font-bold font-mono text-white/70">{totalDeals}</span></div>
                  <div className="flex justify-between items-center"><span className="text-[11px] text-white/40">Leads Frios (&gt;7d)</span><span className="text-[13px] font-bold font-mono text-amber-400">{dashboard?.coldLeads || 0}</span></div>
                  <div className="flex justify-between items-center"><span className="text-[11px] text-white/40">Travados (&gt;14d)</span><span className="text-[13px] font-bold font-mono text-red-400">{dashboard?.stuckDeals || 0}</span></div>
                  <div className="flex justify-between items-center"><span className="text-[11px] text-white/40">Atividades Hoje</span><span className="text-[13px] font-bold font-mono text-[#d4a017]">{todayActs.length}</span></div>
                  <div className="flex justify-between items-center"><span className="text-[11px] text-white/40">Vencidas</span><span className="text-[13px] font-bold font-mono text-red-400">{overdueActs.length}</span></div>
                </div>
              </div>

              {/* Recent Activities Timeline */}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 md:col-span-2">
                <h3 className="text-[10px] uppercase tracking-wider text-white/25 font-semibold mb-3">Proximas Atividades</h3>
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                  {activities.slice(0, 20).map(act => (
                    <div key={act.id} className="flex items-center gap-3 p-2 rounded-lg bg-white/[0.01] hover:bg-white/[0.03] transition">
                      <div className="w-1 h-6 rounded-full" style={{ background: act.due_date && act.due_date < todayStr ? '#ef4444' : act.due_date === todayStr ? '#d4a017' : '#6b7280' }} />
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] text-white/60 block truncate">{act.subject}</span>
                        <span className="text-[9px] text-white/20">{act.type} &middot; {act.due_date || 'sem data'}</span>
                      </div>
                      <span className="text-[9px] font-mono text-white/15 shrink-0">{act.due_date}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ AI STRATEGY ═══ */}
        {tab === 'ai' && (
          <div className="animate-slide-up">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <div className="lg:col-span-2 space-y-3">
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg bg-[#d4a017]/10 flex items-center justify-center text-[#d4a017]"><I d={ic.brain} size={14} /></div>
                    <h3 className="text-sm font-bold text-white/80">Estrategista IA</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 mb-3">
                    {[
                      { l: 'Priorizar Leads', p: 'Analise meu pipeline atual. Quais os 5 deals que devo priorizar hoje e por que? Considere: atividades vencidas, tempo sem contato, e estagio no funil.' },
                      { l: 'Plano do Dia', p: 'Crie meu plano de trabalho para hoje, distribuindo: ligacoes pela manha, follow-ups LinkedIn a tarde, e emails de valor. Priorize por urgencia.' },
                      { l: 'Objecoes FIDC', p: 'Me de as 5 objecoes mais comuns que empresas tem sobre FIDC e scripts de resposta para cada uma. Foque em empresas de medio porte.' },
                      { l: 'Analise Pipeline', p: 'Analise a saude do meu pipeline. Onde estao os gargalos? Quais etapas tem mais deals parados? Sugira acoes para destravar.' },
                    ].map(q => (
                      <button key={q.l} onClick={() => setAiPrompt(q.p)}
                        className="text-[10px] text-left px-2.5 py-2 rounded-lg border border-white/[0.06] text-white/35 hover:border-[#d4a017]/25 hover:text-[#d4a017]/70 hover:bg-[#d4a017]/5 transition-all">
                        {q.l}
                      </button>
                    ))}
                  </div>
                  <textarea placeholder="Pergunte sobre pipeline, estrategia, leads..." value={aiPrompt}
                    onChange={e => setAiPrompt(e.target.value)}
                    className="w-full h-20 p-3 rounded-lg text-xs bg-white/[0.03] border border-white/[0.06] text-white/70 placeholder:text-white/15 resize-none outline-none focus:border-[#d4a017]/25 transition"
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askAI() } }} />
                  <button onClick={askAI} disabled={aiChatLoading || !aiPrompt.trim()}
                    className="w-full h-9 mt-2 rounded-lg text-[11px] font-bold transition-all disabled:opacity-30 bg-gradient-to-r from-[#d4a017] to-[#b8860b] text-black hover:shadow-lg hover:shadow-[#d4a017]/20">
                    {aiChatLoading ? 'Processando...' : 'Enviar para IA'}
                  </button>
                </div>
              </div>

              <div className="lg:col-span-3">
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 min-h-[400px]">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-white/60">Resposta</h3>
                    {aiResponse && (
                      <button onClick={() => doCopy(aiResponse, 'ai')} className="text-[10px] text-white/25 hover:text-[#d4a017] transition">
                        {copied === 'ai' ? 'Copiado!' : 'Copiar'}
                      </button>
                    )}
                  </div>
                  {aiChatLoading ? (
                    <div className="flex items-center justify-center py-20">
                      <div className="flex gap-1.5">
                        {[0, 0.15, 0.3].map(d => (
                          <div key={d} className="w-2 h-2 rounded-full bg-[#d4a017]" style={{ animation: `pulse-gold 1s infinite ${d}s` }} />
                        ))}
                      </div>
                    </div>
                  ) : aiHistory.length > 0 ? (
                    <div className="space-y-3 max-h-[65vh] overflow-y-auto">
                      {aiHistory.map((msg, i) => (
                        <div key={i} className={cn('rounded-lg p-3', msg.role === 'user' ? 'bg-[#d4a017]/5 border border-[#d4a017]/10' : 'bg-white/[0.02] border border-white/[0.04]')}>
                          <div className="text-[9px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: msg.role === 'user' ? '#d4a017' : '#ffffff40' }}>
                            {msg.role === 'user' ? 'Voce' : 'IA'}
                          </div>
                          <pre className="text-[12px] text-white/60 whitespace-pre-wrap leading-relaxed font-sans">{msg.text}</pre>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState icon={ic.brain} title="Assistente pronto" sub="Faca uma pergunta sobre pipeline, estrategia ou prospeccao" />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
          </main>
        </div>
      </div>

      {/* ═══ MODALS ═══ */}

      {/* Add Activity Modal */}
      {showAddActivity && selected && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowAddActivity(false)}>
          <div className="law-modal-card w-full max-w-md rounded-[24px] p-5 shadow-[0_28px_90px_rgba(15,23,42,0.18)]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900">Nova Atividade</h3>
              <button onClick={() => setShowAddActivity(false)} className="text-slate-400 hover:text-slate-700"><I d={ic.x} size={16} /></button>
            </div>
            <div className="space-y-3">
              <input placeholder="Assunto..." value={newActivity.subject} onChange={e => setNewActivity(p => ({ ...p, subject: e.target.value }))}
                className="w-full h-9 px-3 rounded-lg text-xs bg-white/[0.04] border border-white/[0.08] text-white/80 placeholder:text-white/20 outline-none focus:border-[#d4a017]/30" />
              <div className="flex gap-2">
                <select value={newActivity.type} onChange={e => setNewActivity(p => ({ ...p, type: e.target.value }))}
                  className="flex-1 h-9 px-3 rounded-lg text-xs bg-white/[0.04] border border-white/[0.08] text-white/60 outline-none">
                  <option value="call">Ligacao</option><option value="task">Tarefa</option><option value="email">Email</option><option value="meeting">Reuniao</option>
                </select>
                <input type="date" value={newActivity.due_date} onChange={e => setNewActivity(p => ({ ...p, due_date: e.target.value }))}
                  className="flex-1 h-9 px-3 rounded-lg text-xs bg-white/[0.04] border border-white/[0.08] text-white/60 outline-none" />
              </div>
              <textarea placeholder="Nota..." value={newActivity.note} onChange={e => setNewActivity(p => ({ ...p, note: e.target.value }))}
                className="w-full h-16 p-3 rounded-lg text-xs bg-white/[0.04] border border-white/[0.08] text-white/70 placeholder:text-white/20 resize-none outline-none" />
              <button onClick={doAddActivity} disabled={!newActivity.subject}
                className="w-full h-9 rounded-lg text-[11px] font-bold bg-gradient-to-r from-[#d4a017] to-[#b8860b] text-black disabled:opacity-30 transition hover:shadow-lg hover:shadow-[#d4a017]/20">
                Criar Atividade
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Note Modal */}
      {showNoteModal && selected && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowNoteModal(false)}>
          <div className="law-modal-card w-full max-w-md rounded-[24px] p-5 shadow-[0_28px_90px_rgba(15,23,42,0.18)]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900">Adicionar Nota</h3>
              <button onClick={() => setShowNoteModal(false)} className="text-slate-400 hover:text-slate-700"><I d={ic.x} size={16} /></button>
            </div>
            <textarea placeholder="Escreva sua nota..." value={noteContent} onChange={e => setNoteContent(e.target.value)}
              className="w-full h-32 p-3 rounded-lg text-xs bg-white/[0.04] border border-white/[0.08] text-white/70 placeholder:text-white/20 resize-none outline-none mb-3" />
            <button onClick={doAddNote} disabled={!noteContent.trim()}
              className="w-full h-9 rounded-lg text-[11px] font-bold bg-gradient-to-r from-[#d4a017] to-[#b8860b] text-black disabled:opacity-30 transition hover:shadow-lg hover:shadow-[#d4a017]/20">
              Salvar Nota no Pipedrive
            </button>
          </div>
        </div>
      )}

      {/* AI Execute Modal */}
      {aiExecModal && (
        <AIExecuteModal
          activity={aiExecModal.activity}
          deal={aiExecModal.deal}
          onClose={() => setAiExecModal(null)}
          onDone={() => loadData()}
          addToast={addToast}
        />
      )}
    </div>
  )
}
