SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'app_settings' AND column_name = 'llm_base_url') = 0,
  'ALTER TABLE app_settings ADD COLUMN llm_base_url VARCHAR(2048) NOT NULL DEFAULT ''''',
  'SELECT 1'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'app_settings' AND column_name = 'llm_model') = 0,
  'ALTER TABLE app_settings ADD COLUMN llm_model VARCHAR(200) NOT NULL DEFAULT ''''',
  'SELECT 1'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'app_settings' AND column_name = 'llm_api_key_encrypted') = 0,
  'ALTER TABLE app_settings ADD COLUMN llm_api_key_encrypted TEXT NULL',
  'SELECT 1'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;
