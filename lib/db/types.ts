// Row shapes, matching supabase/migrations/0003_v2_intelligence_schema.sql.

export type TopicRow = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type KeywordRow = {
  id: string;
  topic_id: string;
  keyword: string;
  keyword_normalized: string;
  is_active: boolean;
  created_at: string;
};

export type SourceRow = {
  id: string;
  display_name: string;
  is_enabled: boolean;
  docs_url: string | null;
  notes: string | null;
};

export type RunStatus = "running" | "succeeded" | "partial" | "failed";
export type Trigger = "cron" | "manual" | "retry";

export type CollectionRunRow = {
  id: string;
  trigger: Trigger;
  status: RunStatus;
  idempotency_key: string | null;
  lookback_start: string | null;
  lookback_end: string | null;
  config_snapshot: Record<string, unknown>;
  stats: RunStats;
  pipeline_version: string;
  model: string | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
};

export type RunStats = {
  stage?: string;
  fetched?: number;
  uniqueInRun?: number;
  duplicatesWithinRun?: number;
  inserted?: number;
  alreadyStored?: number;
  analyzed?: number;
  relevant?: number;
  irrelevant?: number;
  analysisFailed?: number;
  pendingAfterRun?: number;
  newPainPoints?: number;
  reportId?: string | null;
  reportStatus?: string;
  reportError?: string | null;
  timingsMs?: Record<string, number>;
  warnings?: string[];
};

export type SourceRunRow = {
  id: string;
  run_id: string;
  source_id: string;
  status: "succeeded" | "partial" | "failed" | "skipped";
  window_start: string | null;
  window_end: string | null;
  requests: number;
  failed_requests: number;
  fetched_count: number;
  new_count: number;
  duplicate_count: number;
  truncated: boolean;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
};

export type DiscussionRow = {
  id: string;
  source_id: string;
  external_id: string;
  url: string;
  url_normalized: string;
  title: string;
  excerpt: string | null;
  author: string | null;
  score: number | null;
  comment_count: number | null;
  published_at: string;
  first_retrieved_at: string;
  last_retrieved_at: string;
  matched_keywords: string[];
  matched_topic_ids: string[];
  signals: Record<string, unknown>;
  analysis_status: "pending" | "analyzed" | "irrelevant" | "failed";
  analysis_attempts: number;
  analysis_error: string | null;
  is_excluded: boolean;
  exclusion_reason: string | null;
  excluded_at: string | null;
};

export type Frustration = "none" | "low" | "medium" | "high";

export type AnalysisRow = {
  discussion_id: string;
  is_relevant: boolean;
  relevance_reason: string;
  topic_id: string | null;
  pain_point_id: string | null;
  problem_summary: string | null;
  evidence_quote: string | null;
  quote_verified: boolean;
  is_unresolved: boolean | null;
  unresolved_evidence: string | null;
  workaround: string | null;
  tools_mentioned: string[];
  tool_dissatisfaction: boolean | null;
  frustration: Frustration | null;
  severity: number | null;
  model: string;
  prompt_version: string;
  run_id: string | null;
  analyzed_at: string;
};

export type PainPointRow = {
  id: string;
  topic_id: string | null;
  title: string;
  description: string;
  slug: string;
  created_by: "ai" | "user";
  merged_into: string | null;
  created_at: string;
};

export type ReportRow = {
  id: string;
  run_id: string | null;
  trigger: Trigger;
  status: "generating" | "succeeded" | "failed";
  timezone: string;
  period_start: string;
  period_end: string;
  prev_period_start: string;
  prev_period_end: string;
  metrics: unknown;
  brief: unknown;
  validation: unknown;
  model: string | null;
  prompt_version: string | null;
  pipeline_version: string;
  error: string | null;
  email_status: "not_configured" | "pending" | "sent" | "failed" | "skipped";
  email_provider_id: string | null;
  email_error: string | null;
  emailed_at: string | null;
  created_at: string;
  completed_at: string | null;
};

export type Decision = "investigate" | "validate" | "backlog" | "monitor" | "dismiss";

export type DecisionRow = {
  id: string;
  pain_point_id: string;
  decision: Decision;
  rationale: string | null;
  report_id: string | null;
  decided_by: string;
  created_at: string;
};
