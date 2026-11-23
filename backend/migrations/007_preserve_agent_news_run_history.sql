ALTER TABLE agent_news_source_runs
  DROP FOREIGN KEY agent_news_source_runs_source_fk,
  MODIFY source_id CHAR(36) CHARACTER SET ascii NULL;

ALTER TABLE agent_news_source_runs
  ADD CONSTRAINT agent_news_source_runs_source_fk
    FOREIGN KEY (source_id) REFERENCES agent_news_sources(id) ON DELETE SET NULL;
