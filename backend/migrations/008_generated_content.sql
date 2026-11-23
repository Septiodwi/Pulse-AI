CREATE TABLE IF NOT EXISTS generated_content (
  id CHAR(36) PRIMARY KEY,
  signal_key VARCHAR(73) UNIQUE,
  status ENUM('PREVIEW','DRAFT','REVIEW','APPROVED','REJECTED') NOT NULL,
  payload JSON NOT NULL,
  INDEX generated_content_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
