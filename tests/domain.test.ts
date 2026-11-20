import { test } from 'node:test';
import assert from 'node:assert/strict';
import { credibility, decompositionSchema, defaultComparison, diagnosisSchema, finalizeAudit, normalizeCandidates, querySchema, rankAudits, safeUrl } from '../server/domain.js';
import { parseModelJson } from '../server/providers.js';
import type { Audit, Candidate, Evidence } from '../shared/types.js';

const candidate: Candidate = { id: '1', title: '测试问题', author: '作者', avatar: '', url: 'https://www.zhihu.com/question/1/answer/1', excerpt: '在总摄入热量受控时，替代含糖饮料可以减少热量。', original_rank: 1, votes: 2000, edited_at: null, content_scope: 'search_excerpt' };
const decomposition = { core_claim: '替代含糖饮料减少热量', premises: ['总热量受控'], fact_claims: ['无糖饮料比含糖饮料热量少'] };
const diagnosis = { logic_score: 80, reality_score: 90, boundary_score: 70, passed_tags: ['数据有外部佐证'], flaw_tags: [], audit_summary: '结论有前提，热量差异需要核实。', fact_checks: [{ claim: decomposition.fact_claims[0], status: 'supported' as const, explanation: '依据支持。', source_ids: ['e1'], evidence_quotes: [{source_id: 'e1', quote: '不加糖的饮料通常不含来自糖的能量'}] }], annotations: [{ quote: '总摄入热量受控', dimension: 'boundary' as const, score: 70, explanation: '明确限定条件。' }, { quote: '伪造的引文', dimension: 'logic' as const, score: 99, explanation: '不应该出现。' }] };
const evidence: Evidence[] = [{ id: 'e1', title: '来源', url: 'https://example.org/study', snippet: '不加糖的饮料通常不含来自糖的能量。', published_at: null, provider: 'zhihu_global' }];
test('可信度由固定权重计算且四舍五入到一位小数', () => {
  assert.equal(credibility(80, 90, 70), 82);
  assert.equal(credibility(91.5, 81.2, 70.7), 83.2);
});
test('请求拒绝<=3、超过10、非整数、空问题和伪装的问题链接', () => {
  for (const count of [3, 11, 5.5]) assert.equal(querySchema.safeParse({ query: '问题', count }).success, false);
  assert.equal(querySchema.safeParse({ query: ' ', count: 6 }).success, false);
  assert.equal(querySchema.safeParse({ query: '问题', count: 6, question_url: 'https://zhihu.com.evil.test/question/1' }).success, false);
});
test('只保留有来源摘要的真实回答并保留原默认位置', () => {
  const raw = [
    { Url: 'https://zhuanlan.zhihu.com/p/7', ContentType: 'Article', ContentText: '文章' },
    { Url: candidate.url, ContentType: 'Answer', ContentID: '1', ContentText: '<em>来源</em>片段', VoteUpCount: 42 },
    { Url: candidate.url, ContentType: 'Answer', ContentID: '1', ContentText: '重复' },
    { Url: 'https://www.zhihu.com/answer/2', ContentType: 'Answer', ContentID: '2', ContentText: '' },
  ];
  const normalized = normalizeCandidates(raw, 'search_excerpt');
  assert.equal(normalized.length, 1); assert.equal(normalized[0].original_rank, 2); assert.equal(normalized[0].excerpt, '来源片段');
});
test('未知引用不能构成验证依据，无依据时限制现实评分并撤掉佐证标签', () => {
  const audit = finalizeAudit(candidate, decomposition, diagnosis, [], false, []);
  assert.equal(audit.reality_score, 50); assert.equal(audit.fact_checks[0].status, 'unverified');
  assert.equal(audit.total_credibility, 66); assert.ok(audit.flaw_tags.includes('外部证据不足'));
  assert.equal(audit.passed_tags.length, 0); assert.equal(audit.annotations.length, 1);
});
test('有检索依据的引用被保留，伪造高亮被删除', () => {
  const audit = finalizeAudit(candidate, decomposition, diagnosis, evidence, true, []);
  assert.equal(audit.reality_score, 90); assert.equal(audit.annotations.length, 1);
  assert.deepEqual(audit.fact_checks[0].source_ids, ['e1']);
});
test('真实 URL 也必须附带可在证据中定位的引文，且事实陈述不能错配', () => {
  const fakeQuote = { ...diagnosis, fact_checks: [{ ...diagnosis.fact_checks[0], evidence_quotes: [{ source_id: 'e1', quote: '捏造的证据结论与数字' }] }] };
  assert.equal(finalizeAudit(candidate, decomposition, fakeQuote, evidence, true, []).fact_checks[0].status, 'unverified');
  const mismatched = { ...diagnosis, fact_checks: [{ ...diagnosis.fact_checks[0], claim: '不同的事实' }] };
  assert.equal(finalizeAudit(candidate, decomposition, mismatched, evidence, true, []).fact_checks[0].status, 'unverified');
});
test('排序不受点赞影响，同分保留默认顺序', () => {
  const a = finalizeAudit(candidate, decomposition, diagnosis, evidence, true, []);
  const b: Audit = { ...a, id: '2', votes: 999999, original_rank: 2, total_credibility: 60 };
  const c: Audit = { ...a, id: '3', votes: 0, original_rank: 3 };
  assert.deepEqual(rankAudits([b, c, a]).map(a => a.id), ['1', '3', '2']);
});
test('默认前三保留失败项位置，失败项不获得分数', () => {
  const a = finalizeAudit(candidate, decomposition, diagnosis, evidence, true, []);
  const second = { ...candidate, id: '2', original_rank: 2 };
  const rows = defaultComparison([candidate, second], [a], [{ id: '2', original_rank: 2, message: '超时' }]);
  assert.equal(rows[1].id, '2'); assert.equal('total_credibility' in rows[1], false);
});
test('模型数组超出需求时仅取前两条事实，但错误分数仍拒绝', () => {
  const parsed = decompositionSchema.parse({ ...decomposition, fact_claims: ['一', '二', '三'] });
  assert.deepEqual(parsed.fact_claims, ['一', '二']);
  assert.equal(diagnosisSchema.safeParse({ ...diagnosis, logic_score: 110 }).success, false);
});
test('拒绝脚本链接和伪装知乎域名', () => {
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('https://zhihu.com.evil.test/answer/1', true), '');
  assert.equal(safeUrl('https://www.zhihu.com/answer/1', true), 'https://www.zhihu.com/answer/1');
});
test('解析带代码围栏的 JSON，拒绝非 JSON 输出', () => {
  assert.deepEqual(parseModelJson('```json\n{"logic_score": 70}\n```'), { logic_score: 70 });
  assert.throws(() => parseModelJson('以下是结果：不确定'));
});
