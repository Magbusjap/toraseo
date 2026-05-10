PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS eval_cases (
  id TEXT PRIMARY KEY,
  analysis_type TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  check_language TEXT NOT NULL DEFAULT 'und',
  source_path TEXT,
  target_query TEXT,
  platform TEXT,
  notes TEXT,
  expected_json TEXT NOT NULL DEFAULT '{}',
  input_meta_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS eval_runs (
  id TEXT PRIMARY KEY,
  case_id TEXT REFERENCES eval_cases(id) ON DELETE SET NULL,
  analysis_type TEXT NOT NULL,
  mode TEXT NOT NULL,
  provider_id TEXT,
  model TEXT,
  prompt_version TEXT,
  schema_version TEXT,
  app_version TEXT,
  source_path TEXT,
  summary TEXT,
  next_step TEXT,
  generated_at TEXT,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  latency_ms INTEGER,
  estimated_cost REAL,
  selected_tools_json TEXT NOT NULL DEFAULT '[]',
  completed_tools_json TEXT NOT NULL DEFAULT '[]',
  report_json TEXT NOT NULL DEFAULT '{}',
  warning_count INTEGER NOT NULL DEFAULT 0,
  critical_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'imported'
);

CREATE TABLE IF NOT EXISTS eval_run_metrics (
  run_id TEXT NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
  metric_id TEXT NOT NULL,
  label TEXT NOT NULL,
  value REAL,
  suffix TEXT,
  tone TEXT,
  description TEXT,
  raw_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (run_id, metric_id)
);

CREATE TABLE IF NOT EXISTS eval_comparisons (
  id TEXT PRIMARY KEY,
  case_id TEXT REFERENCES eval_cases(id) ON DELETE SET NULL,
  mcp_run_id TEXT REFERENCES eval_runs(id) ON DELETE SET NULL,
  api_run_id TEXT REFERENCES eval_runs(id) ON DELETE SET NULL,
  verdict TEXT NOT NULL DEFAULT 'unknown',
  source_path TEXT,
  report_markdown TEXT NOT NULL DEFAULT '',
  generated_at TEXT,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  failures_json TEXT NOT NULL DEFAULT '[]',
  warnings_json TEXT NOT NULL DEFAULT '[]',
  metric_delta_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS formula_versions (
  id TEXT PRIMARY KEY,
  analysis_type TEXT NOT NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  description TEXT,
  weights_json TEXT NOT NULL DEFAULT '{}',
  source_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (analysis_type, version)
);

CREATE TABLE IF NOT EXISTS formula_test_runs (
  id TEXT PRIMARY KEY,
  case_id TEXT REFERENCES eval_cases(id) ON DELETE SET NULL,
  run_id TEXT REFERENCES eval_runs(id) ON DELETE SET NULL,
  comparison_id TEXT REFERENCES eval_comparisons(id) ON DELETE SET NULL,
  formula_id TEXT REFERENCES formula_versions(id) ON DELETE SET NULL,
  analysis_type TEXT NOT NULL DEFAULT 'article_text',
  eval_batch_id TEXT,
  same_text_group_id TEXT,
  repeat_index INTEGER NOT NULL DEFAULT 1,
  source_text_hash TEXT,
  source_text_label TEXT,
  check_language TEXT NOT NULL DEFAULT 'und',
  mode TEXT NOT NULL DEFAULT 'manual',
  provider_id TEXT,
  model TEXT,
  ai_intelligence_model TEXT,
  ai_difference_percent REAL,
  ai_power_label TEXT,
  ai_power_score REAL,
  ai_power_source TEXT,
  ai_power_json TEXT NOT NULL DEFAULT '{}',
  analysis_score_cgs REAL,
  analysis_score_percent REAL,
  expected_score_cgs REAL,
  manual_score_cgs REAL,
  formula_name TEXT NOT NULL,
  formula_score REAL,
  formula_score_unit TEXT NOT NULL DEFAULT 'cgs',
  formula_expression TEXT,
  formula_parts_json TEXT NOT NULL DEFAULT '[]',
  formula_additions_json TEXT NOT NULL DEFAULT '[]',
  formula_subtractions_json TEXT NOT NULL DEFAULT '[]',
  formula_multiplications_json TEXT NOT NULL DEFAULT '[]',
  formula_divisions_json TEXT NOT NULL DEFAULT '[]',
  formula_numbers_json TEXT NOT NULL DEFAULT '{}',
  formula_explanation_question TEXT,
  formula_explanation_answer TEXT,
  deviation_from_baseline_cgs REAL,
  deviation_from_baseline_percent REAL,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE VIEW IF NOT EXISTS formula_test_repeat_deltas AS
WITH ranked AS (
  SELECT
    formula_test_runs.*,
    ROW_NUMBER() OVER (
      PARTITION BY same_text_group_id, formula_name
      ORDER BY repeat_index, created_at, id
    ) AS repeat_rank
  FROM formula_test_runs
  WHERE same_text_group_id IS NOT NULL
),
baseline AS (
  SELECT
    same_text_group_id,
    formula_name,
    id AS baseline_id,
    formula_score AS baseline_formula_score,
    analysis_score_cgs AS baseline_analysis_score_cgs
  FROM ranked
  WHERE repeat_rank = 1
)
SELECT
  r.id,
  r.case_id,
  r.run_id,
  r.same_text_group_id,
  r.repeat_index,
  r.provider_id,
  r.model,
  r.ai_intelligence_model,
  r.formula_name,
  r.formula_score,
  b.baseline_id,
  b.baseline_formula_score,
  ROUND(r.formula_score - b.baseline_formula_score, 4) AS formula_score_delta,
  CASE
    WHEN b.baseline_formula_score IS NULL OR b.baseline_formula_score = 0 THEN NULL
    ELSE ROUND(((r.formula_score - b.baseline_formula_score) / b.baseline_formula_score) * 100, 4)
  END AS formula_score_delta_percent,
  r.analysis_score_cgs,
  b.baseline_analysis_score_cgs,
  ROUND(r.analysis_score_cgs - b.baseline_analysis_score_cgs, 4) AS analysis_score_delta_cgs,
  CASE
    WHEN b.baseline_analysis_score_cgs IS NULL OR b.baseline_analysis_score_cgs = 0 THEN NULL
    ELSE ROUND(((r.analysis_score_cgs - b.baseline_analysis_score_cgs) / b.baseline_analysis_score_cgs) * 100, 4)
  END AS analysis_score_delta_percent,
  r.ai_difference_percent,
  r.created_at
FROM ranked r
LEFT JOIN baseline b
  ON b.same_text_group_id = r.same_text_group_id
 AND b.formula_name = r.formula_name;

CREATE TABLE IF NOT EXISTS manual_reviews (
  id TEXT PRIMARY KEY,
  case_id TEXT REFERENCES eval_cases(id) ON DELETE SET NULL,
  run_id TEXT REFERENCES eval_runs(id) ON DELETE SET NULL,
  comparison_id TEXT REFERENCES eval_comparisons(id) ON DELETE SET NULL,
  reviewer TEXT,
  rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  status TEXT NOT NULL DEFAULT 'open',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS qa_sessions (
  id TEXT PRIMARY KEY,
  session_type TEXT NOT NULL,
  analysis_type TEXT,
  title TEXT NOT NULL,
  area TEXT,
  object_under_test TEXT,
  check_language TEXT NOT NULL DEFAULT 'und',
  app_version TEXT,
  environment TEXT,
  tester TEXT,
  verdict TEXT NOT NULL DEFAULT 'needs_review',
  severity TEXT NOT NULL DEFAULT 'medium',
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  summary TEXT,
  linked_case_id TEXT REFERENCES eval_cases(id) ON DELETE SET NULL,
  linked_run_id TEXT REFERENCES eval_runs(id) ON DELETE SET NULL,
  linked_comparison_id TEXT REFERENCES eval_comparisons(id) ON DELETE SET NULL,
  evidence_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS qa_findings (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES qa_sessions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  finding_type TEXT NOT NULL DEFAULT 'observation',
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  expected TEXT,
  actual TEXT,
  recommendation TEXT,
  app_area TEXT,
  screen_from TEXT,
  screen_to TEXT,
  object_selector TEXT,
  screenshot_path TEXT,
  linked_case_id TEXT REFERENCES eval_cases(id) ON DELETE SET NULL,
  linked_run_id TEXT REFERENCES eval_runs(id) ON DELETE SET NULL,
  linked_comparison_id TEXT REFERENCES eval_comparisons(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS qa_article_text_reviews (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES qa_sessions(id) ON DELETE CASCADE,
  case_id TEXT REFERENCES eval_cases(id) ON DELETE SET NULL,
  mcp_run_id TEXT REFERENCES eval_runs(id) ON DELETE SET NULL,
  api_run_id TEXT REFERENCES eval_runs(id) ON DELETE SET NULL,
  comparison_id TEXT REFERENCES eval_comparisons(id) ON DELETE SET NULL,
  checked_report_area TEXT,
  mcp_baseline_match TEXT NOT NULL DEFAULT 'needs_review',
  required_signals_status TEXT NOT NULL DEFAULT 'needs_review',
  tool_coverage_status TEXT NOT NULL DEFAULT 'needs_review',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS qa_article_preview_reviews (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES qa_sessions(id) ON DELETE CASCADE,
  case_id TEXT REFERENCES eval_cases(id) ON DELETE SET NULL,
  run_id TEXT REFERENCES eval_runs(id) ON DELETE SET NULL,
  comparison_id TEXT REFERENCES eval_comparisons(id) ON DELETE SET NULL,
  check_language TEXT NOT NULL DEFAULT 'und',
  preview_area TEXT NOT NULL DEFAULT 'article_preview',
  preview_mode TEXT,
  expected_behavior TEXT,
  actual_behavior TEXT,
  annotation_alignment_status TEXT NOT NULL DEFAULT 'needs_review',
  recommendation_link_status TEXT NOT NULL DEFAULT 'needs_review',
  visual_readability_status TEXT NOT NULL DEFAULT 'needs_review',
  overall_result TEXT NOT NULL DEFAULT 'needs_review',
  screenshot_path TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS qa_article_annotation_checks (
  id TEXT PRIMARY KEY,
  preview_review_id TEXT NOT NULL REFERENCES qa_article_preview_reviews(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES qa_sessions(id) ON DELETE CASCADE,
  marker_id TEXT,
  recommendation_id TEXT,
  paragraph_index INTEGER,
  character_start INTEGER,
  character_end INTEGER,
  text_fragment TEXT,
  annotation_type TEXT NOT NULL DEFAULT 'recommendation',
  expected_behavior TEXT,
  actual_behavior TEXT,
  result TEXT NOT NULL DEFAULT 'needs_review',
  severity TEXT NOT NULL DEFAULT 'medium',
  screenshot_path TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS qa_article_compare_reviews (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES qa_sessions(id) ON DELETE CASCADE,
  case_id TEXT REFERENCES eval_cases(id) ON DELETE SET NULL,
  run_id TEXT REFERENCES eval_runs(id) ON DELETE SET NULL,
  checked_report_area TEXT,
  text_a_role TEXT,
  text_b_role TEXT,
  comparison_goal TEXT,
  winner_logic_status TEXT NOT NULL DEFAULT 'needs_review',
  column_layout_status TEXT NOT NULL DEFAULT 'needs_review',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS qa_page_url_reviews (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES qa_sessions(id) ON DELETE CASCADE,
  case_id TEXT REFERENCES eval_cases(id) ON DELETE SET NULL,
  run_id TEXT REFERENCES eval_runs(id) ON DELETE SET NULL,
  url TEXT,
  extraction_status TEXT NOT NULL DEFAULT 'needs_review',
  robots_boundary_status TEXT NOT NULL DEFAULT 'needs_review',
  report_contract_status TEXT NOT NULL DEFAULT 'needs_review',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS qa_site_url_reviews (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES qa_sessions(id) ON DELETE CASCADE,
  case_id TEXT REFERENCES eval_cases(id) ON DELETE SET NULL,
  run_id TEXT REFERENCES eval_runs(id) ON DELETE SET NULL,
  url TEXT,
  crawl_policy_status TEXT NOT NULL DEFAULT 'needs_review',
  tool_coverage_status TEXT NOT NULL DEFAULT 'needs_review',
  report_contract_status TEXT NOT NULL DEFAULT 'needs_review',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS qa_site_compare_reviews (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES qa_sessions(id) ON DELETE CASCADE,
  case_id TEXT REFERENCES eval_cases(id) ON DELETE SET NULL,
  run_id TEXT REFERENCES eval_runs(id) ON DELETE SET NULL,
  url_a TEXT,
  url_b TEXT,
  url_c TEXT,
  competitor_count INTEGER,
  comparison_logic_status TEXT NOT NULL DEFAULT 'needs_review',
  up_to_three_rule_status TEXT NOT NULL DEFAULT 'needs_review',
  column_layout_status TEXT NOT NULL DEFAULT 'needs_review',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS qa_system_design_reviews (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES qa_sessions(id) ON DELETE CASCADE,
  component TEXT NOT NULL,
  design_area TEXT,
  current_design TEXT,
  expected_design TEXT,
  risk TEXT,
  decision TEXT,
  recommendation TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS qa_ux_ui_reviews (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES qa_sessions(id) ON DELETE CASCADE,
  app_area TEXT NOT NULL,
  screen_from TEXT,
  screen_to TEXT,
  interaction TEXT,
  expected TEXT,
  actual TEXT,
  result TEXT NOT NULL DEFAULT 'needs_review',
  severity TEXT NOT NULL DEFAULT 'medium',
  screenshot_path TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS qa_typography_reviews (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES qa_sessions(id) ON DELETE CASCADE,
  app_area TEXT NOT NULL,
  screen_name TEXT,
  element_name TEXT,
  font_family TEXT,
  font_size TEXT,
  line_height TEXT,
  font_weight TEXT,
  expected TEXT,
  actual TEXT,
  result TEXT NOT NULL DEFAULT 'needs_review',
  severity TEXT NOT NULL DEFAULT 'medium',
  screenshot_path TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS automated_test_runs (
  id TEXT PRIMARY KEY,
  runner TEXT NOT NULL,
  test_type TEXT NOT NULL,
  command TEXT,
  app_version TEXT,
  status TEXT NOT NULL DEFAULT 'started',
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  duration_ms INTEGER,
  report_path TEXT,
  raw_output_path TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS automated_test_results (
  id TEXT PRIMARY KEY,
  test_run_id TEXT NOT NULL REFERENCES automated_test_runs(id) ON DELETE CASCADE,
  test_name TEXT NOT NULL,
  file_path TEXT,
  status TEXT NOT NULL,
  duration_ms INTEGER,
  error_message TEXT,
  linked_session_id TEXT REFERENCES qa_sessions(id) ON DELETE SET NULL,
  linked_case_id TEXT REFERENCES eval_cases(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_eval_cases_analysis_type
  ON eval_cases(analysis_type);

CREATE INDEX IF NOT EXISTS idx_eval_cases_check_language
  ON eval_cases(check_language);

CREATE INDEX IF NOT EXISTS idx_eval_runs_case_mode
  ON eval_runs(case_id, mode);

CREATE INDEX IF NOT EXISTS idx_eval_runs_analysis_type
  ON eval_runs(analysis_type);

CREATE INDEX IF NOT EXISTS idx_eval_run_metrics_metric
  ON eval_run_metrics(metric_id, value);

CREATE INDEX IF NOT EXISTS idx_eval_comparisons_case
  ON eval_comparisons(case_id);

CREATE INDEX IF NOT EXISTS idx_formula_test_runs_case
  ON formula_test_runs(case_id, analysis_type);

CREATE INDEX IF NOT EXISTS idx_formula_test_runs_repeat
  ON formula_test_runs(same_text_group_id, formula_name, repeat_index);

CREATE INDEX IF NOT EXISTS idx_formula_test_runs_model
  ON formula_test_runs(provider_id, model, ai_intelligence_model);

CREATE INDEX IF NOT EXISTS idx_formula_test_runs_formula
  ON formula_test_runs(formula_id, formula_name);

CREATE INDEX IF NOT EXISTS idx_qa_sessions_type
  ON qa_sessions(session_type, analysis_type);

CREATE INDEX IF NOT EXISTS idx_qa_sessions_check_language
  ON qa_sessions(check_language);

CREATE INDEX IF NOT EXISTS idx_qa_sessions_links
  ON qa_sessions(linked_case_id, linked_run_id, linked_comparison_id);

CREATE INDEX IF NOT EXISTS idx_qa_findings_session
  ON qa_findings(session_id, status, severity);

CREATE INDEX IF NOT EXISTS idx_qa_article_text_reviews_session
  ON qa_article_text_reviews(session_id, case_id);

CREATE INDEX IF NOT EXISTS idx_qa_article_preview_reviews_session
  ON qa_article_preview_reviews(session_id, case_id);

CREATE INDEX IF NOT EXISTS idx_qa_article_preview_reviews_language
  ON qa_article_preview_reviews(check_language, overall_result);

CREATE INDEX IF NOT EXISTS idx_qa_article_annotation_checks_preview
  ON qa_article_annotation_checks(preview_review_id, result);

CREATE INDEX IF NOT EXISTS idx_qa_article_compare_reviews_session
  ON qa_article_compare_reviews(session_id, case_id);

CREATE INDEX IF NOT EXISTS idx_qa_page_url_reviews_session
  ON qa_page_url_reviews(session_id, case_id);

CREATE INDEX IF NOT EXISTS idx_qa_site_url_reviews_session
  ON qa_site_url_reviews(session_id, case_id);

CREATE INDEX IF NOT EXISTS idx_qa_site_compare_reviews_session
  ON qa_site_compare_reviews(session_id, case_id);

CREATE INDEX IF NOT EXISTS idx_qa_system_design_reviews_session
  ON qa_system_design_reviews(session_id, component);

CREATE INDEX IF NOT EXISTS idx_qa_ux_ui_reviews_session
  ON qa_ux_ui_reviews(session_id, app_area);

CREATE INDEX IF NOT EXISTS idx_qa_typography_reviews_session
  ON qa_typography_reviews(session_id, app_area);

CREATE INDEX IF NOT EXISTS idx_automated_test_runs_runner
  ON automated_test_runs(runner, test_type, status);

CREATE INDEX IF NOT EXISTS idx_automated_test_results_run
  ON automated_test_results(test_run_id, status);
