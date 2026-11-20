import { ArrowRight, ArrowUpRight, Check, ChevronDown, ExternalLink, FileText, Link2, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useId, useState } from 'react';
import AnimatedCollapse from './AnimatedCollapse';
import type { Annotation, Audit, Dimension } from '../shared/types';

const dimensions: { key: Dimension; label: string; field: 'logic_score' | 'reality_score' | 'boundary_score'; weight: string }[] = [
  { key: 'logic', label: '逻辑严密', field: 'logic_score', weight: '40%' },
  { key: 'reality', label: '现实吻合', field: 'reality_score', weight: '40%' },
  { key: 'boundary', label: '前提边界', field: 'boundary_score', weight: '20%' },
];
export function ScoreRing({ score, small = false }: { score: number; small?: boolean }) {
  return <div className={`score-ring ${small ? 'small' : ''} ${score < 60 ? 'low' : score < 80 ? 'medium' : ''}`} aria-label={`综合可信度 ${score} 分，满分100`}>
    <svg viewBox="0 0 88 88" aria-hidden="true"><circle className="ring-track" cx="44" cy="44" r="38"/><circle className="ring-value" cx="44" cy="44" r="38" pathLength="100" strokeDasharray={`${score} 100`} transform="rotate(-90 44 44)"/></svg>
    <span><strong>{Number.isInteger(score) ? score : score.toFixed(1)}</strong>{!small && <small>/ 100</small>}</span>
  </div>;
}
function HighlightedText({ text, annotations, activeIndex, onActiveChange }: {
  text: string; annotations: Annotation[]; activeIndex: number | null; onActiveChange: (index: number | null) => void;
}) {
  const matches = annotations.map((a, annotationIndex) => ({ ...a, annotationIndex, start: text.indexOf(a.quote), end: text.indexOf(a.quote) + a.quote.length }))
    .filter(a => a.start >= 0).sort((a, b) => a.start - b.start || b.end - a.end);
  const output: React.ReactNode[] = [];
  let cursor = 0;
  matches.forEach((a, i) => {
    if (a.start < cursor) return;
    output.push(text.slice(cursor, a.start));
    output.push(<mark key={i} onMouseEnter={() => onActiveChange(a.annotationIndex)} onMouseLeave={() => onActiveChange(null)} className={`highlight-${a.dimension} ${activeIndex === a.annotationIndex ? 'annotation-active' : ''}`} title={`${dimensions.find(d => d.key === a.dimension)?.label} ${a.score}/100 · ${a.explanation}`}>{a.quote}<sup>{a.score}</sup></mark>);
    cursor = a.end;
  });
  output.push(text.slice(cursor));
  return <p className="source-text">{output}</p>;
}
export function AuditDetails({ audit }: { audit: Audit }) {
  const [activeAnnotation, setActiveAnnotation] = useState<number | null>(null);
  return <div className="audit-details">
    <div className="detail-heading"><FileText size={15}/><h4>来源片段 · 逐段诊断</h4></div>
    <div className="legend">{dimensions.map(d => <span key={d.key}><i className={`dot-${d.key}`}/>{d.label}</span>)}</div>
    <HighlightedText text={audit.excerpt} annotations={audit.annotations} activeIndex={activeAnnotation} onActiveChange={setActiveAnnotation}/>
    {!!audit.annotations.length && <div className="annotation-list">{audit.annotations.map((a, i) => <div key={i} onMouseEnter={() => setActiveAnnotation(i)} onMouseLeave={() => setActiveAnnotation(null)} className={`annotation annotation-${a.dimension} ${activeAnnotation === i ? 'annotation-active' : ''}`}><span>{dimensions.find(d => d.key === a.dimension)?.label} <b>{a.score}</b></span><p>{a.explanation}</p></div>)}</div>}
    {!!audit.premises.length && <div className="premises"><h4>原文明确给出的前提</h4><ul>{audit.premises.map((p, i) => <li key={i}>{p}</li>)}</ul></div>}
    <div className="detail-heading"><ShieldCheck size={15}/><h4>事实核查记录</h4></div>
    {audit.fact_checks.length ? audit.fact_checks.map((check, i) => <div className="fact-check" key={i}>
      <div><span className={`fact-status ${check.status}`}>{({ supported: '有依据支持', contradicted: '与依据相矛盾', mixed: '证据存在分歧', unverified: '尚未核实' })[check.status]}</span><strong>{check.claim}</strong></div>
      <p>{check.explanation}</p>
      {!!check.evidence_quotes?.length && <div className="evidence-quotes">{check.evidence_quotes.map((q, i) => <blockquote key={i}>“{q.quote}”<span>{q.source_id}</span></blockquote>)}</div>}
      <div className="citation-links">{check.source_ids.map(id => { const e = audit.evidence.find(e => e.id === id); return e ? <a key={id} href={e.url} target="_blank" rel="noopener noreferrer"><Link2 size={12}/>{e.title || new URL(e.url).hostname}<ExternalLink size={11}/></a> : null; })}</div>
    </div>) : <p className="microcopy">该片段未提取到可单独核实的客观事实；未把主观意见判定为事实错误。</p>}
    <details className="evidence-details"><summary>查看检索依据（{audit.evidence.length}）<ChevronDown size={14}/></summary><div>{audit.evidence.map(e => <div className="evidence-item" key={e.id}><a href={e.url} target="_blank" rel="noopener noreferrer">{e.title}<ArrowUpRight size={13}/></a><span>{e.provider === 'zhihu_global' ? '全网搜索' : 'DeepSeek 联网'} · {e.published_at ? new Date(e.published_at).toLocaleDateString('zh-CN') : '发布时间未知'}</span><p>{e.snippet || '该来源未提供可阅读的检索片段。'}</p></div>)}</div></details>
    {!!audit.limitations.length && <div className="limitations"><TriangleAlert size={14}/><div>{audit.limitations.map((l, i) => <p key={i}>{l}</p>)}</div></div>}
  </div>;
}
export default function AnswerCard({ answer, rank }: { answer: Audit; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const authorLabel = answer.content_scope === 'answer_summary' && answer.author === '知乎用户' ? '作者信息未提供' : answer.author;
  return <article className={`answer-card ${rank === 1 ? 'first-card' : ''}`}>
    <div className="card-topline">
      <div className="rank-label"><span className="rank-number">{String(rank).padStart(2, '0')}</span><span>{rank === 1 ? '本次最高评分' : '可信度排名'}</span></div>
      <div className="rank-comparison" aria-label={`原排名第${answer.original_rank}，现排名第${rank}`}><span>原排名 <b>#{answer.original_rank}</b></span><ArrowRight size={15}/><span>现排名 <b>#{rank}</b></span></div>
    </div>
    <div className="card-body">
      <div className="card-title-row"><div className="card-main"><div className="author"><span className="author-avatar">{authorLabel.slice(0, 1)}</span><span>{authorLabel}</span><span className="author-separator">·</span><span className="author-source">知乎回答</span>{answer.votes !== null && <span className="answer-votes">{new Intl.NumberFormat('zh-CN', { notation: 'compact' }).format(answer.votes)} 赞同</span>}</div><h3>{answer.core_claim}</h3></div><ScoreRing score={answer.total_credibility}/></div>
      <div className="dimension-bars">{dimensions.map(d => <div key={d.key} className={`dimension-${d.key}`}><div><span>{d.label}</span><strong>{answer[d.field]}</strong></div><div className="mini-track"><i className={`bar-${d.key}`} style={{ width: `${answer[d.field]}%` }}/></div></div>)}</div>
      <div className="tags">{answer.passed_tags.map((tag, i) => <span className="tag-passed" key={`pass-${i}`}><Check size={13}/>{tag}</span>)}{answer.flaw_tags.map((tag, i) => <span className="tag-warning" key={`flaw-${i}`}><TriangleAlert size={13}/>{tag}</span>)}</div>
      <div className="diagnosis"><div><ShieldCheck size={16}/><span>AI 核查诊断</span><span className="web-label">{answer.evidence.some(e => e.provider === 'zhihu_global') ? '知乎全网取证' : answer.web_search_used ? '历史联网取证' : '外部依据见核查记录'}</span></div><p>{answer.audit_summary}</p></div>
      <p className="original-excerpt">“{answer.excerpt.slice(0, 120)}{answer.excerpt.length > 120 ? '…' : ''}”</p>
      <div className="card-actions"><a href={answer.url} target="_blank" rel="noopener noreferrer" className="original-link">前往知乎阅读原文做判断<ArrowUpRight size={17}/></a><button type="button" className="text-button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} aria-controls={detailsId}>{expanded ? '收起来源与诊断' : '展开来源与诊断'}<ChevronDown size={16} className={expanded ? 'disclosure-chevron open' : 'disclosure-chevron'}/></button></div>
      <AnimatedCollapse open={expanded} id={detailsId}><AuditDetails audit={answer}/></AnimatedCollapse>
    </div>
  </article>;
}
