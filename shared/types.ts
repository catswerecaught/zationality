export type Dimension = 'logic' | 'reality' | 'boundary';
export type FactStatus = 'supported' | 'contradicted' | 'mixed' | 'unverified';
export interface Candidate {
  id: string; title: string; author: string; avatar: string; url: string;
  excerpt: string; original_rank: number; votes: number | null; edited_at: string | null;
  content_scope: 'search_excerpt' | 'answer_summary';
}
export interface Evidence {
  id: string; title: string; url: string; snippet: string; published_at: string | null;
  provider: 'zhihu_global' | 'deepseek_web_search';
}
export interface Annotation { quote: string; dimension: Dimension; score: number; explanation: string }
export interface FactCheck {
  claim: string; status: FactStatus; explanation: string; source_ids: string[];
  evidence_quotes: { source_id: string; quote: string }[];
}
export interface Audit extends Candidate {
  core_claim: string; premises: string[]; fact_claims: string[];
  logic_score: number; reality_score: number; boundary_score: number; total_credibility: number;
  passed_tags: string[]; flaw_tags: string[]; audit_summary: string;
  annotations: Annotation[]; fact_checks: FactCheck[]; evidence: Evidence[];
  web_search_used: boolean; limitations: string[];
}
export interface Report {
  id: string; query: string; requested_count: number; recalled_count: number; audited_count: number;
  created_at: string; duration_ms: number; model: string; cache_hit: boolean;
  search_provider?: 'zhihu_global'; pipeline_version?: string;
  default_top3: (Audit | (Candidate & { audit_error: string }))[];
  credible_top3: Audit[]; all_results: Audit[];
  failures: { id: string; original_rank: number; message: string }[]; warnings: string[];
}
export interface Progress {
  phase: 'recall' | 'decompose' | 'verify' | 'score' | 'rank'; message: string; percent: number;
  completed: number; total: number; candidate?: string;
}
export interface QuotaItem { APIID: string; APIName: string; TotalQuota: number; TotalUsed: number; RemainingQuota: number }
export interface HotItem { Title: string; Url: string; Summary: string }
export interface HistoryItem { id: string; query: string; requested_count: number; created_at: string; audited_count: number }
