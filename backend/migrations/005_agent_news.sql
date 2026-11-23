CREATE TABLE agent_news_agents (
  id CHAR(36) CHARACTER SET ascii PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(16) NOT NULL,
  frequency_minutes SMALLINT UNSIGNED NOT NULL,
  active_days VARCHAR(20) NOT NULL,
  start_time CHAR(5) NOT NULL,
  end_time CHAR(5) NOT NULL,
  timezone VARCHAR(80) NOT NULL,
  general_keywords JSON NOT NULL,
  last_attempt_at DATETIME(3) NULL,
  last_success_at DATETIME(3) NULL,
  last_execution_status VARCHAR(24) NULL,
  next_run_at DATETIME(3) NULL,
  created_by CHAR(36) CHARACTER SET ascii NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT agent_news_created_by_fk FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX agent_news_status_next_idx (status, next_run_at),
  INDEX agent_news_created_by_idx (created_by),
  FULLTEXT INDEX agent_news_search_idx (name, description)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE agent_news_products (
  agent_id CHAR(36) CHARACTER SET ascii NOT NULL,
  product_id CHAR(36) CHARACTER SET ascii NOT NULL,
  PRIMARY KEY (agent_id, product_id),
  CONSTRAINT agent_news_products_agent_fk FOREIGN KEY (agent_id) REFERENCES agent_news_agents(id) ON DELETE CASCADE,
  CONSTRAINT agent_news_products_product_fk FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
  INDEX agent_news_products_product_idx (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE agent_news_sources (
  id CHAR(36) CHARACTER SET ascii PRIMARY KEY,
  agent_id CHAR(36) CHARACTER SET ascii NOT NULL,
  platform VARCHAR(16) NOT NULL,
  actor_id VARCHAR(160) NOT NULL,
  is_enabled BOOLEAN NOT NULL,
  input_config_json JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT agent_news_sources_agent_fk FOREIGN KEY (agent_id) REFERENCES agent_news_agents(id) ON DELETE CASCADE,
  UNIQUE KEY agent_news_source_platform_unique (agent_id, platform),
  INDEX agent_news_sources_enabled_idx (agent_id, is_enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE agent_news_executions (
  id CHAR(36) CHARACTER SET ascii PRIMARY KEY,
  agent_id CHAR(36) CHARACTER SET ascii NOT NULL,
  trigger_type VARCHAR(16) NOT NULL,
  status VARCHAR(24) NOT NULL,
  started_at DATETIME(3) NULL,
  completed_at DATETIME(3) NULL,
  error_message VARCHAR(1000) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT agent_news_executions_agent_fk FOREIGN KEY (agent_id) REFERENCES agent_news_agents(id) ON DELETE CASCADE,
  INDEX agent_news_executions_agent_created_idx (agent_id, created_at DESC),
  INDEX agent_news_executions_status_idx (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE agent_news_source_runs (
  id CHAR(36) CHARACTER SET ascii PRIMARY KEY,
  execution_id CHAR(36) CHARACTER SET ascii NOT NULL,
  source_id CHAR(36) CHARACTER SET ascii NOT NULL,
  actor_id VARCHAR(160) NOT NULL,
  platform VARCHAR(16) NOT NULL,
  apify_run_id VARCHAR(80) NULL,
  dataset_id VARCHAR(80) NULL,
  status VARCHAR(24) NOT NULL,
  started_at DATETIME(3) NULL,
  completed_at DATETIME(3) NULL,
  results_count INT UNSIGNED NOT NULL DEFAULT 0,
  new_items_count INT UNSIGNED NOT NULL DEFAULT 0,
  duplicate_items_count INT UNSIGNED NOT NULL DEFAULT 0,
  error_message VARCHAR(1000) NULL,
  usage_metadata_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT agent_news_source_runs_execution_fk FOREIGN KEY (execution_id) REFERENCES agent_news_executions(id) ON DELETE CASCADE,
  CONSTRAINT agent_news_source_runs_source_fk FOREIGN KEY (source_id) REFERENCES agent_news_sources(id) ON DELETE CASCADE,
  INDEX agent_news_source_runs_execution_idx (execution_id),
  INDEX agent_news_source_runs_apify_idx (apify_run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE agent_news_contents (
  id CHAR(36) CHARACTER SET ascii PRIMARY KEY,
  agent_id CHAR(36) CHARACTER SET ascii NOT NULL,
  source_run_id CHAR(36) CHARACTER SET ascii NOT NULL,
  execution_id CHAR(36) CHARACTER SET ascii NOT NULL,
  platform VARCHAR(16) NOT NULL,
  external_post_id VARCHAR(255) NOT NULL,
  post_url VARCHAR(2048) NULL,
  author VARCHAR(255) NULL,
  text TEXT NULL,
  thumbnail_url VARCHAR(2048) NULL,
  search_term VARCHAR(500) NULL,
  published_at DATETIME(3) NULL,
  retrieved_at DATETIME(3) NOT NULL,
  engagement_json JSON NOT NULL,
  raw_data_json JSON NOT NULL,
  CONSTRAINT agent_news_contents_agent_fk FOREIGN KEY (agent_id) REFERENCES agent_news_agents(id) ON DELETE CASCADE,
  CONSTRAINT agent_news_contents_source_run_fk FOREIGN KEY (source_run_id) REFERENCES agent_news_source_runs(id) ON DELETE CASCADE,
  CONSTRAINT agent_news_contents_execution_fk FOREIGN KEY (execution_id) REFERENCES agent_news_executions(id) ON DELETE CASCADE,
  UNIQUE KEY agent_news_content_unique (agent_id, platform, external_post_id),
  INDEX agent_news_contents_agent_retrieved_idx (agent_id, retrieved_at DESC),
  INDEX agent_news_contents_platform_published_idx (platform, published_at DESC),
  FULLTEXT INDEX agent_news_contents_text_idx (text, author)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE agent_news_content_products (
  content_id CHAR(36) CHARACTER SET ascii NOT NULL,
  product_id CHAR(36) CHARACTER SET ascii NOT NULL,
  PRIMARY KEY (content_id, product_id),
  CONSTRAINT agent_news_content_products_content_fk FOREIGN KEY (content_id) REFERENCES agent_news_contents(id) ON DELETE CASCADE,
  CONSTRAINT agent_news_content_products_product_fk FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  INDEX agent_news_content_products_product_idx (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
