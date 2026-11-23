ALTER TABLE agent_news_contents
  ADD COLUMN recommendation VARCHAR(24) NOT NULL DEFAULT 'PENDING' AFTER raw_data_json,
  ADD COLUMN relevance_score TINYINT UNSIGNED NULL AFTER recommendation,
  ADD COLUMN analysis_reason VARCHAR(1000) NULL AFTER relevance_score,
  ADD COLUMN matched_product_ids_json JSON NULL AFTER analysis_reason,
  ADD COLUMN analyzed_at DATETIME(3) NULL AFTER matched_product_ids_json,
  ADD COLUMN analysis_model VARCHAR(255) NULL AFTER analyzed_at,
  ADD INDEX agent_news_contents_recommendation_idx (recommendation, retrieved_at DESC);
