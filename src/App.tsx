import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowUp, ArrowUpRight, Check, ChevronDown, CircleHelp, Clock3, Database, Flame, FlaskConical, History, Layers3, LoaderCircle, Moon, RefreshCw, Search, ShieldCheck, Square, Sun, Trash2, TriangleAlert, X, Zap } from 'lucide-react';
import type { HistoryItem, HotItem, Progress, QuotaItem, Report } from '../shared/types';
import AnswerCard from './AnswerCard';
import AnimatedCollapse from './AnimatedCollapse';
import CountSelector from './CountSelector';
import { getJson, streamAnalysis } from './api';

const phases: { key: Progress['phase']; label: string }[] = [{ key: 'recall', label: '召回回答' }, { key: 'decompose', label: '拆解论证' }, { key: 'verify', label: '交叉取证' }, { key: 'score', label: '三维诊断' }, { key: 'rank', label: '可信重排' }];
function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? 'compact-brand' : ''}`}><span className="brand-icon"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M8 8h17L9 24h16M8 16h17" stroke="currentColor" strokeWidth="2.3"/></svg></span>{!compact && <div><strong>Zationality<span className="brand-period">.</span></strong><small>知乎问答逻辑与现实可信度重排引擎</small></div>}</div>;
}
function MethodDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="method-dialog" onClose={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}><div className="modal-header"><span className="eyebrow">THE METHODOLOGY</span><button className="icon-button" onClick={onClose} aria-label="关闭评分说明"><X size={20}/></button></div><h2>把论证拆开，让证据说话。</h2><p>我们评估一条回答当前能被检验的部分，让你选择更值得阅读的原文。</p><div className="formula"><span>可信度</span><b>0.4 <i>×</i> 逻辑</b><b>+</b><b>0.4 <i>×</i> 现实</b><b>+</b><b>0.2 <i>×</i> 前提</b></div><div className="method-rows"><div><span className="method-index logic-color">01</span><div><h3>逻辑严密性 <small>40%</small></h3><p>结论是否由前提合理推出？检查因果倒置、以偏概全、偷换概念、滑坡推论等。</p></div></div><div><span className="method-index reality-color">02</span><div><h3>现实吻合度 <small>40%</small></h3><p>抽取 1–2 条客观事实，通过知乎全网搜索取证，比较证据、时间和语境。</p></div></div><div><span className="method-index boundary-color">03</span><div><h3>适用前提 <small>20%</small></h3><p>作者是否明确说明结论成立的条件、适用人群与例外？区分合理边界和绝对断言。</p></div></div></div><div className="method-note"><TriangleAlert size={17}/><p>模型判断仍可能有误。分数不是事实正确的概率，不反映作者整体可信度，也不替代专业意见。证据不足的回答不会被等同于错误；无可核实依据时现实分最高为 50。</p></div><button className="primary-button modal-done" onClick={onClose}>了解，保留我的判断权<Check size={16}/></button></dialog>;
}
export default function App() {
  const [query, setQuery] = useState('');
  const [count, setCount] = useState(5);
  const [useCache, setUseCache] = useState(true);
  const [dark, setDark] = useState(() => localStorage.getItem('zationality-theme') === 'dark');
  const [hot, setHot] = useState<HotItem[]>([]);
  const [hotError, setHotError] = useState('');
  const [quota, setQuota] = useState<QuotaItem[]>([]);
  const [quotaError, setQuotaError] = useState('');
  const [quotaTime, setQuotaTime] = useState('');
  const [quotaOpen, setQuotaOpen] = useState(false);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const [clearError, setClearError] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [workspaceActive, setWorkspaceActive] = useState(false);
  const [hotReopened, setHotReopened] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [health, setHealth] = useState<{ deepseek_configured: boolean; model: string } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const startedAt = useRef(0);
  const loadHistory = () => getJson<{ items: HistoryItem[] }>('/api/reports').then(r => setHistory(r.items)).catch(() => {});
  const loadQuota = async () => {
    setQuotaLoading(true);
    try { const r = await getJson<{ items: QuotaItem[]; fetched_at: string }>('/api/quota'); setQuota(r.items); setQuotaTime(r.fetched_at); setQuotaError(''); }
    catch (e) { setQuotaError((e as Error).message); } finally { setQuotaLoading(false); }
  };
  useEffect(() => {
    getJson<{ items: HotItem[] }>('/api/hot').then(r => setHot(r.items)).catch(e => setHotError(e.message));
    void loadQuota(); void loadHistory();
    getJson<{ deepseek_configured: boolean; model: string }>('/api/health').then(setHealth).catch(() => {});
    return () => abort.current?.abort();
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; localStorage.setItem('zationality-theme', dark ? 'dark' : 'light'); }, [dark]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'Escape') { setHistoryOpen(false); setQuotaOpen(false); setClearConfirmOpen(false); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => { if (!busy) return; const id = setInterval(() => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)), 1000); return () => clearInterval(id); }, [busy]);
  async function analyze(text = query, questionUrl?: string) {
    if (busy) return;
    if (text.trim().length < 2) { setError('请输入至少两个字符的问题或关键词。'); searchRef.current?.focus(); return; }
    const controller = new AbortController(); abort.current = controller;
    setQuery(text); setError(''); setReport(null); setBusy(true); setElapsed(0); setHistoryOpen(false); setWorkspaceActive(true); setHotReopened(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setProgress({ phase: 'recall', message: '连接知乎，准备召回候选回答…', percent: 1, completed: 0, total: count });
    startedAt.current = Date.now();
    try {
      await streamAnalysis({ query: text.trim(), count, use_cache: useCache, ...(questionUrl ? { question_url: questionUrl } : {}) }, controller.signal,
        p => setProgress(prev => ({ ...p, percent: Math.max(prev?.percent ?? 0, p.percent) })),
        r => { setReport(r); void loadHistory(); void loadQuota(); });
    } catch (e) { setError(controller.signal.aborted ? '本次分析已取消。你可以调整问题后重新开始。' : (e as Error).message); }
    finally { setBusy(false); abort.current = null; }
  }
  async function openReport(id: string) {
    if (busy) return;
    try { const r = await getJson<Report>(`/api/reports/${id}`); setReport(r); setQuery(r.query); setHistoryOpen(false); setError(''); setProgress(null); setWorkspaceActive(true); setHotReopened(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    catch (e) { setError((e as Error).message); }
  }
  async function clearHistory() {
    if (busy) { setClearError('分析进行中，完成后再清空记录。'); return; }
    setClearBusy(true); setClearError('');
    try {
      const response = await fetch('/api/reports', { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '清空记录失败');
      setHistory([]); setClearConfirmOpen(false);
    } catch (error) { setClearError(error instanceof Error ? error.message : '清空记录失败'); }
    finally { setClearBusy(false); }
  }
  const hotExpanded = !busy && (!workspaceActive || hotReopened);
  const ready = health?.deepseek_configured;
  const phaseIndex = phases.findIndex(p => p.key === progress?.phase);
  return <div className="app-shell">
    <aside className="side-rail"><button className="rail-brand" aria-label="回到首页" onClick={() => { if (!busy) { setReport(null); setQuery(''); setProgress(null); setError(''); setWorkspaceActive(false); setHotReopened(false); window.scrollTo({ top: 0, behavior: 'smooth' }); } }}><Brand compact/></button><div className="rail-items"><button className={!historyOpen ? 'rail-button active' : 'rail-button'} title="研究工作台" aria-label="研究工作台" onClick={() => { setHistoryOpen(false); searchRef.current?.focus(); }}><Layers3 size={21}/></button><button className={historyOpen ? 'rail-button active' : 'rail-button'} title="分析记录" aria-label="分析记录" onClick={() => setHistoryOpen(!historyOpen)}><History size={21}/>{history.length > 0 && <i/>}</button><button className="rail-button" title="评分方法" aria-label="评分方法" onClick={() => setMethodOpen(true)}><FlaskConical size={21}/></button></div><div className="rail-bottom"><span className="rail-line"/><button className="rail-button" title={dark ? '切换浅色模式' : '切换深色模式'} aria-label={dark ? '切换浅色模式' : '切换深色模式'} onClick={() => setDark(!dark)}>{dark ? <Sun size={20}/> : <Moon size={20}/>}</button><span className="avatar-local" title="本地研究工作台">Z</span></div></aside>
    <div className="page-shell"><header className="topbar"><Brand/><div className="topbar-controls"><div className="quota-container"><button aria-label={quotaError ? '额度暂不可用' : 'API 实时额度'} className={`quota-badge ${quotaError ? 'quota-unavailable' : ''}`} aria-expanded={quotaOpen} onClick={() => { setQuotaOpen(!quotaOpen); if (!quotaOpen) void loadQuota(); }}><span className="live-dot"/><span>{quotaError ? '额度暂不可用' : 'API 额度'}</span>{quota.length > 0 && !quotaError && <b>{new Intl.NumberFormat('en').format(quota.find(q => q.APIID === 'zhihu_search')?.RemainingQuota ?? 0)}</b>}<ChevronDown size={13}/></button>{quotaOpen && <div className="quota-popover"><div><h3>开放平台 · 当日额度</h3><button className="icon-button" disabled={quotaLoading} aria-label="刷新额度" onClick={() => void loadQuota()}><RefreshCw size={14} className={quotaLoading ? 'spin' : ''}/></button></div>{quotaError ? <p className="inline-error">{quotaError}</p> : quota.map(q => <div className="quota-row" key={q.APIID}><span>{q.APIName}</span><b>{q.RemainingQuota.toLocaleString()}<small> / {q.TotalQuota.toLocaleString()}</small></b><div className="quota-track"><i style={{ width: `${Math.max(0, q.RemainingQuota / (q.TotalQuota || 1) * 100)}%` }}/></div></div>)}<p>查询不消耗业务额度{quotaTime && <> · {new Date(quotaTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 更新</>}</p></div>}</div><span className="control-divider"/><label className="cache-control"><Database size={14}/><span>演示缓存</span><input aria-label="演示缓存" className="sr-only" type="checkbox" checked={useCache} disabled={busy} onChange={e => setUseCache(e.target.checked)}/><span className={`toggle ${useCache ? 'on' : ''}`} aria-hidden="true"><i/></span></label><button className="method-button" aria-label="评分方法" onClick={() => setMethodOpen(true)}><CircleHelp size={16}/><span>评分方法</span></button></div></header>
    <main className={workspaceActive ? 'workspace-active' : 'workspace-welcome'}>
      <section className={`hero ${workspaceActive ? 'hero-active' : ''}`}>
        <div className="hero-intro" aria-hidden={workspaceActive}><h1>让好的论证，<em>浮出水面。</em></h1></div>
        <div className="composer-area" onPointerLeave={event => { if (event.pointerType === 'mouse') setHotReopened(false); }} onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setHotReopened(false); }}>
        <form className="search-pill" onSubmit={e => { e.preventDefault(); void analyze(); }}>
          <Search className="pill-search-icon" size={25} strokeWidth={1.7}/>
          <input onFocus={() => { if (!busy) setHotReopened(true); }} onClick={() => { if (!busy) setHotReopened(true); }} aria-controls="zhihu-hot-topics" aria-expanded={hotExpanded} ref={searchRef} value={query} disabled={busy} maxLength={300} onChange={e => setQuery(e.target.value)} placeholder="提出问题，检验每一个论证…" aria-label="输入问题或知乎问题链接"/>
          <div className="pill-controls">
            <CountSelector value={count} onChange={setCount} disabled={busy}/>
            {busy ? <button className="pill-send pill-stop" type="button" title="停止分析" aria-label="停止分析" onClick={() => abort.current?.abort()}><Square size={19} fill="currentColor"/></button>
              : <button className="pill-send" type="submit" title="开始可信度分析" aria-label="开始可信度分析" disabled={!query.trim() || (health !== null && !ready)}><ArrowUp size={24} strokeWidth={2.2}/></button>}
          </div>
        </form>
        {health && !ready && <p className="inline-error">DeepSeek 暂不可用，请检查本地服务配置。</p>}
        <AnimatedCollapse open={hotExpanded} id="zhihu-hot-topics" className="hot-collapse">
        <div className="hot-topics">
          <div className="hot-label"><Flame size={18} aria-hidden="true"/><span>知乎热榜</span></div>
          <div className="hot-chips">{hot.slice(0, 3).map((item, i) => <button className="hot-topic" onMouseDown={event => { if (event.button === 0) event.preventDefault(); }} disabled={busy} key={item.Url} title={item.Title} onClick={() => void analyze(item.Title, /zhihu\.com\/question\//.test(item.Url) ? item.Url : undefined)}>
            <span className={`hot-topic-dot hot-topic-dot-${i + 1}`} aria-hidden="true"/><span className="hot-topic-text">{item.Title}</span><ArrowUpRight className="hot-topic-arrow" size={19}/>
          </button>)}{!hot.length && <span className="hot-empty">{hotError ? '热榜暂不可用，可直接输入问题分析' : '正在连接知乎热榜…'}</span>}</div>
        </div>
        </AnimatedCollapse>
        </div>
      </section>
      {(error || busy || report) && <div className="analysis-region">
        {error && <div className="error-banner" role="alert"><TriangleAlert size={19}/><p>{error}</p><button className="icon-button" aria-label="关闭提示" onClick={() => setError('')}><X size={17}/></button></div>}
        {busy && progress && <section className="progress-panel" aria-live="polite"><div className="progress-top"><span className="analysis-icon"><LoaderCircle size={23} className="spin"/></span><div><h2>{progress.message}</h2><p>{progress.completed}/{progress.total} 条回答完成质检</p></div><div className="progress-numbers"><strong>{progress.percent}<small>%</small></strong><span>{elapsed}s</span></div></div><div className="progress-track"><i style={{ width: `${progress.percent}%` }}/></div><div className="progress-steps">{phases.map((p, i) => <span key={p.key} className={i <= phaseIndex ? 'step-active' : ''}><i>{i < phaseIndex ? <Check size={13}/> : i + 1}</i>{p.label}</span>)}</div></section>}
        {report && !busy && <section className="results-section" key={`${report.id}-${report.created_at}`}>
          <div className="results-toolbar"><div className="result-heading"><ShieldCheck size={25}/><div><h2>当下可信度 <span>Top {Math.min(3, report.audited_count)}</span></h2></div></div><div className="report-tools"><span className={`report-badge ${report.cache_hit ? 'cached' : ''}`}>{report.cache_hit ? <Database size={14}/> : <Activity size={14}/>} {report.cache_hit ? '历史报告' : '实时分析'}</span></div></div>
          <div className="report-metadata"><span><Layers3 size={15}/>{report.audited_count} / {report.recalled_count} 条完成质检</span><span><Clock3 size={15}/>{new Date(report.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span><span><Zap size={15}/>{(report.duration_ms / 1000).toFixed(1)}s</span><details className="report-notes"><summary>核查说明<ChevronDown size={14}/></summary>{report.cache_hit && <p>历史报告保留原核查时间，未重新验证。</p>}<ul>{report.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details></div>
          <div className="answer-list">{report.credible_top3.map((a, i) => <AnswerCard key={`${report.id}-${a.id}`} answer={a} rank={i + 1}/>)}</div>
        </section>}
      </div>}

    </main></div>
    {historyOpen && <><div className="panel-scrim" onClick={() => { setHistoryOpen(false); setClearConfirmOpen(false); }}/><section className="history-panel"><div className="history-heading"><h2>分析记录</h2><div className="history-heading-actions">{history.length > 0 && <button className="clear-history-button" disabled={busy || clearBusy} onClick={() => { setClearError(''); setClearConfirmOpen(true); }}><Trash2 size={15}/>清空记录</button>}<button className="icon-button" aria-label="关闭分析记录" onClick={() => { setHistoryOpen(false); setClearConfirmOpen(false); }}><X size={19}/></button></div></div>{history.length ? <>{history.map(h => <button className="history-item" key={h.id} disabled={busy} onClick={() => void openReport(h.id)}><span><Database size={14}/>{new Date(h.created_at).toLocaleDateString('zh-CN')}<small>{h.audited_count} 条诊断</small></span><strong>{h.query}</strong><ArrowUpRight size={16}/></button>)}<div className="history-tip"><Clock3 size={14}/><p>历史报告反映核查当时的证据。关闭演示缓存，可重新进行实时分析。</p></div></> : <div className="history-empty"><History size={30}/><h3>暂无分析记录</h3></div>}{clearConfirmOpen && <div className="clear-dialog-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget && !clearBusy) setClearConfirmOpen(false); }}><section className="clear-dialog" role="alertdialog" aria-modal="true" aria-labelledby="clear-dialog-title" aria-describedby="clear-dialog-description"><div className="clear-dialog-icon"><Trash2 size={20}/></div><h3 id="clear-dialog-title">清空所有分析记录？</h3><p id="clear-dialog-description">本地保存的历史报告将被删除，此操作无法撤销。</p>{clearError && <p className="clear-error" role="alert">{clearError}</p>}<div className="clear-dialog-actions"><button className="clear-cancel" disabled={clearBusy} onClick={() => setClearConfirmOpen(false)}>取消</button><button className="clear-confirm" disabled={clearBusy} onClick={() => void clearHistory()}>{clearBusy ? '正在清空…' : '删除全部记录'}</button></div></section></div>}</section></>}
    {methodOpen && <MethodDialog onClose={() => setMethodOpen(false)}/>}
  </div>;
}
