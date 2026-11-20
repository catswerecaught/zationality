import { z } from 'zod';
import type { Audit, Candidate, Evidence, Report } from '../shared/types.js';

export const querySchema = z.object({
  query: z.string().trim().min(2, '请输入至少两个字符').max(300, '问题请控制在 300 字以内'),
  count: z.number().int().min(4).max(10),
  use_cache: z.boolean().default(true),
  question_url: z.string().url().optional().refine(v => !v || /^https:\/\/(www\.)?zhihu\.com\/question\/\d+\/?(?:\?.*)?$/.test(v), '请输入有效的知乎问题链接'),
});
export const decompositionSchema = z.object({
  core_claim: z.string().min(1).max(300),
  premises: z.array(z.string().max(200)).max(16).transform(items => items.slice(0, 6)),
  fact_claims: z.array(z.string().min(1).max(200)).max(8).transform(items => items.slice(0, 2)),
});
export function conciseSummary(value: string) {
  const chars = Array.from(value);
  if (chars.length <= 100) return value;
  const truncated = chars.slice(0, 99).join('');
  const lastStop = Math.max(truncated.lastIndexOf('。'), truncated.lastIndexOf('；'), truncated.lastIndexOf(';'));
  return lastStop > 35 ? truncated.slice(0, lastStop).replace(/[，,]$/, '') + '。' : truncated + '…';
}
const score = z.number().min(0).max(100);
export const diagnosisSchema = z.object({
  logic_score: score, reality_score: score, boundary_score: score,
  passed_tags: z.array(z.string().max(30)).max(12).transform(items => items.slice(0, 5)),
  flaw_tags: z.array(z.string().max(30)).max(12).transform(items => items.slice(0, 5)),
  audit_summary: z.string().min(1).max(400).transform(conciseSummary),
  fact_checks: z.array(z.object({
    claim: z.string().max(200), status: z.enum(['supported', 'contradicted', 'mixed', 'unverified']),
    explanation: z.string().max(300), source_ids: z.array(z.string()).max(8),
    evidence_quotes: z.array(z.object({ source_id: z.string(), quote: z.string().min(8).max(500) })).max(8).default([]),
  })).max(8).transform(items => items.slice(0, 2)),
  annotations: z.array(z.object({
    quote: z.string().min(2).max(300), dimension: z.enum(['logic', 'reality', 'boundary']),
    score, explanation: z.string().max(200),
  })).max(18).transform(items => items.slice(0, 9)),
});
export function credibility(logic: number, reality: number, boundary: number) {
  return Math.round((0.4 * logic + 0.4 * reality + 0.2 * boundary) * 10) / 10;
}
export function safeUrl(value: unknown, zhihuOnly = false): string {
  try {
    const u = new URL(String(value));
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) return '';
    if (zhihuOnly && !(u.hostname === 'zhihu.com' || u.hostname.endsWith('.zhihu.com'))) return '';
    return u.toString();
  } catch { return ''; }
}
export function plainText(value: unknown): string {
  return String(value ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}
export function normalizeCandidates(items: any[], scope: Candidate['content_scope']): Candidate[] {
  const seen = new Set<string>();
  return items.flatMap((item, index) => {
    const url = safeUrl(item.Url, true);
    const excerpt = plainText(item.ContentText ?? item.Summary).slice(0, 16000);
    const type = String(item.ContentType ?? '').toLowerCase();
    if (!url || !excerpt || !(type === 'answer' || type === '回答' || /\/answer\/\d+/.test(url))) return [];
    // The canonical answer URL is more stable than opaque search ContentIDs.
    const id = new URL(url).pathname.match(/\/answer\/(\d+)/)?.[1] ?? String(item.ContentID ?? item.ContentToken ?? new URL(url).pathname);
    if (seen.has(id)) return [];
    seen.add(id);
    return [{
      id, title: plainText(item.Title) || '知乎问题下的回答', author: plainText(item.AuthorName) || '知乎用户',
      avatar: safeUrl(item.AuthorAvatar), url, excerpt, original_rank: index + 1,
      votes: typeof item.VoteUpCount === 'number' ? item.VoteUpCount : null,
      edited_at: Number(item.EditTime) > 0 ? new Date(Number(item.EditTime) * 1000).toISOString() : null,
      content_scope: scope,
    }];
  });
}
export function finalizeAudit(candidate: Candidate, decomposition: z.infer<typeof decompositionSchema>, raw: z.infer<typeof diagnosisSchema>, evidence: Evidence[], webSearchUsed: boolean, limitations: string[]): Audit {
  const ids = new Set(evidence.map(e => e.id));
  const fact_checks = decomposition.fact_claims.map((claim, index) => {
    const check = raw.fact_checks[index];
    const matchesClaim = check?.claim.trim() === claim.trim();
    const evidence_quotes = matchesClaim ? (check?.evidence_quotes ?? []).filter(q => evidence.some(e => e.id === q.source_id && e.snippet.includes(q.quote))) : [];
    const quotedIds = new Set(evidence_quotes.map(q => q.source_id));
    const source_ids = matchesClaim ? (check?.source_ids ?? []).filter(id => ids.has(id) && quotedIds.has(id)) : [];
    const status = source_ids.length ? (check?.status ?? 'unverified') : 'unverified';
    return { claim, status, source_ids, evidence_quotes: evidence_quotes.filter(q => source_ids.includes(q.source_id)),
      explanation: !matchesClaim ? '没有取得与该事实陈述准确匹配的核查结果，暂不作事实判断。' : !source_ids.length ? '核查依据缺少可定位的原句，仅作未验证处理。' : check.explanation };
  });
  let reality = raw.reality_score;
  const flaws = [...raw.flaw_tags];
  const passed = [...raw.passed_tags];
  if (!fact_checks.length || fact_checks.every(c => c.status === 'unverified')) {
    reality = Math.min(reality, 50);
    flaws.push('外部证据不足');
    passed.splice(0, passed.length, ...passed.filter(t => !/佐证|吻合|事实|核实|验证|数据/.test(t)));
    limitations.push('未取得可引用的事实验证依据；现实分上限为 50，未验证不等于失实。');
  }
  const annotations = raw.annotations.filter(a => candidate.excerpt.includes(a.quote)).map(a => ({ ...a, score: a.dimension === 'reality' ? Math.min(a.score, reality) : a.score }));
  return { ...candidate, ...decomposition, ...raw, reality_score: reality,
    total_credibility: credibility(raw.logic_score, reality, raw.boundary_score),
    passed_tags: [...new Set(passed)], flaw_tags: [...new Set(flaws)],
    annotations, fact_checks, evidence, web_search_used: webSearchUsed, limitations,
  };
}
export function rankAudits(audits: Audit[]) {
  return [...audits].sort((a, b) => b.total_credibility - a.total_credibility || a.original_rank - b.original_rank);
}
export function defaultComparison(candidates: Candidate[], audits: Audit[], failures: Report['failures']) {
  return candidates.slice(0, 3).map(c => audits.find(a => a.id === c.id) ?? { ...c, audit_error: failures.find(f => f.id === c.id)?.message ?? '质检未完成' });
}
