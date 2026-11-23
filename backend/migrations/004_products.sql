CREATE TABLE IF NOT EXISTS products (
  id CHAR(36) CHARACTER SET ascii PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  -- ponytail: Local-first stores images inline; move to object storage when product volume grows.
  product_image LONGTEXT NOT NULL,
  product_image_name VARCHAR(255) NOT NULL,
  base_image LONGTEXT NOT NULL,
  base_image_name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  product_type VARCHAR(500) NOT NULL,
  branding VARCHAR(500) NOT NULL,
  linked_accounts JSON NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX products_name_index (name),
  FULLTEXT INDEX products_search_index (name, description, product_type, branding)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
