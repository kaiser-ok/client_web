-- ============================================
-- Partner 統一架構遷移腳本
-- 從 Customer + Supplier 遷移到 Partner + PartnerRole
-- ============================================

-- 執行前請確保已備份資料庫！
-- PGPASSWORD=chunwencheng pg_dump -h localhost -U chunwencheng -d client_web -F c -f backup.dump

BEGIN;

-- ============================================
-- Step 1: 建立新表
-- ============================================

-- 1.1 建立 partners 表
CREATE TABLE IF NOT EXISTS partners (
  id VARCHAR(30) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  aliases TEXT[] DEFAULT '{}',
  contact VARCHAR(255),
  phone VARCHAR(100),
  email VARCHAR(255),
  website VARCHAR(500),
  jira_label VARCHAR(255),
  odoo_id INTEGER UNIQUE,
  odoo_tags TEXT[] DEFAULT '{}',
  slack_channel_id VARCHAR(100),
  source VARCHAR(50) DEFAULT 'MANUAL',
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  parent_id VARCHAR(30),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 1.2 建立 partner_roles 表
CREATE TABLE IF NOT EXISTS partner_roles (
  id VARCHAR(30) PRIMARY KEY,
  partner_id VARCHAR(30) NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(partner_id, role)
);

-- 1.3 建立 partner_views 表
CREATE TABLE IF NOT EXISTS partner_views (
  id VARCHAR(30) PRIMARY KEY,
  partner_id VARCHAR(30) NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  user_email VARCHAR(255) NOT NULL,
  view_count INTEGER DEFAULT 1,
  last_viewed_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(partner_id, user_email)
);

-- 1.4 建立 partner_files 表
CREATE TABLE IF NOT EXISTS partner_files (
  id VARCHAR(30) PRIMARY KEY,
  partner_id VARCHAR(30) NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  filename VARCHAR(500) NOT NULL,
  stored_path VARCHAR(500) NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type VARCHAR(100),
  source VARCHAR(50) DEFAULT 'MANUAL',
  jira_id VARCHAR(100),
  jira_issue_key VARCHAR(50),
  uploaded_by VARCHAR(255) NOT NULL,
  uploaded_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  UNIQUE(partner_id, year, stored_path)
);

-- 建立索引
CREATE INDEX IF NOT EXISTS idx_partners_parent_id ON partners(parent_id);
CREATE INDEX IF NOT EXISTS idx_partners_is_active ON partners(is_active);
CREATE INDEX IF NOT EXISTS idx_partners_name ON partners(name);
CREATE INDEX IF NOT EXISTS idx_partner_roles_role ON partner_roles(role);
CREATE INDEX IF NOT EXISTS idx_partner_roles_partner_id ON partner_roles(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_views_user_email ON partner_views(user_email);
CREATE INDEX IF NOT EXISTS idx_partner_views_view_count ON partner_views(view_count);
CREATE INDEX IF NOT EXISTS idx_partner_views_last_viewed_at ON partner_views(last_viewed_at);
CREATE INDEX IF NOT EXISTS idx_partner_files_partner_year ON partner_files(partner_id, year);
CREATE INDEX IF NOT EXISTS idx_partner_files_jira_id ON partner_files(jira_id);

-- ============================================
-- Step 2: 從 customers 遷移資料到 partners
-- ============================================

INSERT INTO partners (
  id, name, aliases, contact, phone, email, website,
  jira_label, odoo_id, odoo_tags, slack_channel_id,
  source, notes, is_active, parent_id, created_at, updated_at
)
SELECT
  id,
  name,
  COALESCE(aliases, '{}'),
  contact,
  phone,
  email,
  NULL, -- website (customers 沒有這欄位)
  jira_label,
  odoo_id,
  COALESCE(odoo_tags, '{}'),
  slack_channel_id,
  COALESCE(source, 'MANUAL'),
  notes,
  true, -- is_active
  parent_id,
  created_at,
  updated_at
FROM customers
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- Step 3: 為 customers 建立對應的 PartnerRole
-- ============================================

-- 根據 customer_type 決定角色：DEALER -> PARTNER, END_USER -> CUSTOMER
INSERT INTO partner_roles (id, partner_id, role, is_primary, metadata, created_at, updated_at)
SELECT
  'role_' || id,
  id,
  CASE
    WHEN customer_type = 'DEALER' THEN 'PARTNER'
    ELSE 'CUSTOMER'
  END,
  true,
  jsonb_build_object('salesRep', sales_rep, 'dealer', partner),
  NOW(),
  NOW()
FROM customers
ON CONFLICT (partner_id, role) DO NOTHING;

-- ============================================
-- Step 4: 處理 suppliers
-- ============================================

-- 4.1 對於已存在的 Partner（相同 odooId），新增 SUPPLIER 角色
INSERT INTO partner_roles (id, partner_id, role, is_primary, created_at, updated_at)
SELECT
  'role_sup_' || s.id,
  p.id,
  'SUPPLIER',
  false,
  NOW(),
  NOW()
FROM suppliers s
JOIN partners p ON p.odoo_id = s.odoo_id
WHERE s.odoo_id IS NOT NULL
ON CONFLICT (partner_id, role) DO NOTHING;

-- 4.2 對於不存在的 Supplier（無相同 odooId），建立新的 Partner
INSERT INTO partners (
  id, name, aliases, contact, phone, email, website,
  jira_label, odoo_id, odoo_tags, slack_channel_id,
  source, notes, is_active, parent_id, created_at, updated_at
)
SELECT
  s.id,
  s.name,
  '{}',
  NULL,
  s.phone,
  s.email,
  s.website,
  NULL,
  s.odoo_id,
  '{}',
  NULL,
  'ODOO',
  s.notes,
  COALESCE(s.is_active, true),
  NULL,
  s.created_at,
  s.updated_at
FROM suppliers s
WHERE NOT EXISTS (
  SELECT 1 FROM partners p WHERE p.odoo_id = s.odoo_id AND s.odoo_id IS NOT NULL
)
AND NOT EXISTS (
  SELECT 1 FROM partners p WHERE p.id = s.id
)
ON CONFLICT (id) DO NOTHING;

-- 4.3 為新建的 Supplier Partner 建立 SUPPLIER 角色
INSERT INTO partner_roles (id, partner_id, role, is_primary, created_at, updated_at)
SELECT
  'role_' || s.id,
  s.id,
  'SUPPLIER',
  true,
  NOW(),
  NOW()
FROM suppliers s
WHERE EXISTS (SELECT 1 FROM partners p WHERE p.id = s.id)
ON CONFLICT (partner_id, role) DO NOTHING;

-- ============================================
-- Step 5: 遷移 customer_views 到 partner_views
-- ============================================

INSERT INTO partner_views (id, partner_id, user_email, view_count, last_viewed_at)
SELECT id, customer_id, user_email, view_count, last_viewed_at
FROM customer_views
ON CONFLICT (partner_id, user_email) DO NOTHING;

-- ============================================
-- Step 6: 遷移 customer_files 到 partner_files
-- ============================================

INSERT INTO partner_files (
  id, partner_id, year, filename, stored_path, file_size,
  mime_type, source, jira_id, jira_issue_key, uploaded_by, uploaded_at, deleted_at
)
SELECT
  id, customer_id, year, filename, stored_path, file_size,
  mime_type, source, jira_id, jira_issue_key, uploaded_by, uploaded_at, deleted_at
FROM customer_files
ON CONFLICT (partner_id, year, stored_path) DO NOTHING;

-- ============================================
-- Step 7: 更新關聯表的外鍵欄位
-- ============================================

-- 7.1 activities: 新增 partner_id 欄位
ALTER TABLE activities ADD COLUMN IF NOT EXISTS partner_id VARCHAR(30);
UPDATE activities SET partner_id = customer_id WHERE partner_id IS NULL;
ALTER TABLE activities ALTER COLUMN partner_id SET NOT NULL;
ALTER TABLE activities ADD CONSTRAINT fk_activities_partner
  FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_activities_partner_id ON activities(partner_id);

-- 7.2 open_items: 新增 partner_id 欄位，重命名 partner -> dealer
ALTER TABLE open_items ADD COLUMN IF NOT EXISTS partner_id VARCHAR(30);
UPDATE open_items SET partner_id = customer_id WHERE partner_id IS NULL;
ALTER TABLE open_items ALTER COLUMN partner_id SET NOT NULL;
ALTER TABLE open_items ADD CONSTRAINT fk_open_items_partner
  FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_open_items_partner_id ON open_items(partner_id);
-- 重命名 partner 欄位為 dealer（避免混淆）
ALTER TABLE open_items RENAME COLUMN partner TO dealer;

-- 7.3 deals: 新增 partner_id 欄位
ALTER TABLE deals ADD COLUMN IF NOT EXISTS partner_id VARCHAR(30);
UPDATE deals SET partner_id = customer_id WHERE partner_id IS NULL;
ALTER TABLE deals ALTER COLUMN partner_id SET NOT NULL;
ALTER TABLE deals ADD CONSTRAINT fk_deals_partner
  FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_deals_partner_id ON deals(partner_id);

-- 7.4 projects: 新增 partner_id 和更新 end_user_id
ALTER TABLE projects ADD COLUMN IF NOT EXISTS partner_id VARCHAR(30);
UPDATE projects SET partner_id = customer_id WHERE partner_id IS NULL;
ALTER TABLE projects ALTER COLUMN partner_id SET NOT NULL;
ALTER TABLE projects ADD CONSTRAINT fk_projects_partner
  FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_projects_partner_id ON projects(partner_id);

-- 7.5 quotations: 新增 partner_id 欄位
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS partner_id VARCHAR(30);
UPDATE quotations SET partner_id = customer_id WHERE partner_id IS NULL;
ALTER TABLE quotations ALTER COLUMN partner_id SET NOT NULL;
ALTER TABLE quotations ADD CONSTRAINT fk_quotations_partner
  FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_quotations_partner_id ON quotations(partner_id);

-- 7.6 technical_notes: 新增 partner_id 欄位
ALTER TABLE technical_notes ADD COLUMN IF NOT EXISTS partner_id VARCHAR(30);
UPDATE technical_notes SET partner_id = customer_id WHERE partner_id IS NULL;
ALTER TABLE technical_notes ALTER COLUMN partner_id SET NOT NULL;
ALTER TABLE technical_notes ADD CONSTRAINT fk_technical_notes_partner
  FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_technical_notes_partner_id ON technical_notes(partner_id);

-- 7.7 line_users: 新增 partner_id，合併 customer_id 和 supplier_id
ALTER TABLE line_users ADD COLUMN IF NOT EXISTS partner_id VARCHAR(30);
-- 先用 customer_id
UPDATE line_users SET partner_id = customer_id WHERE customer_id IS NOT NULL AND partner_id IS NULL;
-- 再用 supplier_id（如果 supplier 已遷移到 partners）
UPDATE line_users lu SET partner_id = p.id
FROM suppliers s
JOIN partners p ON (p.odoo_id = s.odoo_id OR p.id = s.id)
WHERE lu.supplier_id = s.id AND lu.partner_id IS NULL;
-- 重命名欄位
ALTER TABLE line_users RENAME COLUMN partner_name TO contact_name;
ALTER TABLE line_users RENAME COLUMN partner_phone TO contact_phone;
ALTER TABLE line_users ADD CONSTRAINT fk_line_users_partner
  FOREIGN KEY (partner_id) REFERENCES partners(id);
CREATE INDEX IF NOT EXISTS idx_line_users_partner_id ON line_users(partner_id);

-- 7.8 line_channels: 新增 partner_id
ALTER TABLE line_channels ADD COLUMN IF NOT EXISTS partner_id VARCHAR(30);
UPDATE line_channels SET partner_id = customer_id WHERE customer_id IS NOT NULL AND partner_id IS NULL;
ALTER TABLE line_channels ADD CONSTRAINT fk_line_channels_partner
  FOREIGN KEY (partner_id) REFERENCES partners(id);
CREATE INDEX IF NOT EXISTS idx_line_channels_partner_id ON line_channels(partner_id);

-- 7.9 line_channel_associations: 新增 partner_id，合併 customer_id 和 supplier_id
ALTER TABLE line_channel_associations ADD COLUMN IF NOT EXISTS partner_id VARCHAR(30);
-- 先用 customer_id
UPDATE line_channel_associations SET partner_id = customer_id WHERE customer_id IS NOT NULL AND partner_id IS NULL;
-- 再用 supplier_id
UPDATE line_channel_associations lca SET partner_id = p.id
FROM suppliers s
JOIN partners p ON (p.odoo_id = s.odoo_id OR p.id = s.id)
WHERE lca.supplier_id = s.id AND lca.partner_id IS NULL;
-- 設為 NOT NULL 並加上約束
ALTER TABLE line_channel_associations ALTER COLUMN partner_id SET NOT NULL;
ALTER TABLE line_channel_associations ADD CONSTRAINT fk_line_channel_associations_partner
  FOREIGN KEY (partner_id) REFERENCES partners(id);
-- 更新 unique constraint
ALTER TABLE line_channel_associations DROP CONSTRAINT IF EXISTS line_channel_associations_channel_id_customer_id_key;
ALTER TABLE line_channel_associations DROP CONSTRAINT IF EXISTS line_channel_associations_channel_id_supplier_id_key;
ALTER TABLE line_channel_associations ADD CONSTRAINT line_channel_associations_channel_partner_unique
  UNIQUE (channel_id, partner_id);
CREATE INDEX IF NOT EXISTS idx_line_channel_associations_partner_id ON line_channel_associations(partner_id);

-- 7.10 slack_channel_mappings: 更新欄位名稱
ALTER TABLE slack_channel_mappings RENAME COLUMN customer_id TO partner_id;
ALTER TABLE slack_channel_mappings RENAME COLUMN customer_name TO partner_name;

-- 7.11 deleted_slack_activities: 更新欄位名稱
ALTER TABLE deleted_slack_activities RENAME COLUMN customer_id TO partner_id;
ALTER TABLE deleted_slack_activities RENAME COLUMN customer_name TO partner_name;

-- 7.12 document_chunks: 更新欄位名稱
ALTER TABLE document_chunks RENAME COLUMN customer_id TO partner_id;

-- 7.13 dashboard_stats: 更新欄位名稱
ALTER TABLE dashboard_stats RENAME COLUMN customer_count TO partner_count;

-- ============================================
-- Step 8: 設定 partners 的 parent_id 外鍵
-- ============================================

ALTER TABLE partners ADD CONSTRAINT fk_partners_parent
  FOREIGN KEY (parent_id) REFERENCES partners(id);

-- ============================================
-- Step 9: 刪除舊欄位
-- ============================================

-- 刪除 activities 舊欄位
ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_customer_id_fkey;
DROP INDEX IF EXISTS idx_activities_customer_id;
ALTER TABLE activities DROP COLUMN IF EXISTS customer_id;

-- 刪除 open_items 舊欄位
ALTER TABLE open_items DROP CONSTRAINT IF EXISTS open_items_customer_id_fkey;
DROP INDEX IF EXISTS idx_open_items_customer_id;
ALTER TABLE open_items DROP COLUMN IF EXISTS customer_id;

-- 刪除 deals 舊欄位
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_customer_id_fkey;
DROP INDEX IF EXISTS idx_deals_customer_id;
ALTER TABLE deals DROP COLUMN IF EXISTS customer_id;

-- 刪除 projects 舊欄位
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_customer_id_fkey;
DROP INDEX IF EXISTS idx_projects_customer_id;
ALTER TABLE projects DROP COLUMN IF EXISTS customer_id;

-- 刪除 quotations 舊欄位
ALTER TABLE quotations DROP CONSTRAINT IF EXISTS quotations_customer_id_fkey;
DROP INDEX IF EXISTS idx_quotations_customer_id;
ALTER TABLE quotations DROP COLUMN IF EXISTS customer_id;

-- 刪除 technical_notes 舊欄位
ALTER TABLE technical_notes DROP CONSTRAINT IF EXISTS technical_notes_customer_id_fkey;
DROP INDEX IF EXISTS idx_technical_notes_customer_id;
ALTER TABLE technical_notes DROP COLUMN IF EXISTS customer_id;
-- 更新 unique constraint
ALTER TABLE technical_notes DROP CONSTRAINT IF EXISTS technical_notes_customer_id_slack_timestamp_key;
ALTER TABLE technical_notes ADD CONSTRAINT technical_notes_partner_id_slack_timestamp_key
  UNIQUE (partner_id, slack_timestamp);

-- 刪除 line_users 舊欄位
ALTER TABLE line_users DROP CONSTRAINT IF EXISTS line_users_customer_id_fkey;
ALTER TABLE line_users DROP CONSTRAINT IF EXISTS line_users_supplier_id_fkey;
DROP INDEX IF EXISTS idx_line_users_customer_id;
DROP INDEX IF EXISTS idx_line_users_supplier_id;
DROP INDEX IF EXISTS idx_line_users_dealer_customer_id;
ALTER TABLE line_users DROP COLUMN IF EXISTS customer_id;
ALTER TABLE line_users DROP COLUMN IF EXISTS supplier_id;
ALTER TABLE line_users DROP COLUMN IF EXISTS dealer_customer_id;

-- 刪除 line_channels 舊欄位
ALTER TABLE line_channels DROP CONSTRAINT IF EXISTS line_channels_customer_id_fkey;
DROP INDEX IF EXISTS idx_line_channels_customer_id;
ALTER TABLE line_channels DROP COLUMN IF EXISTS customer_id;

-- 刪除 line_channel_associations 舊欄位
ALTER TABLE line_channel_associations DROP CONSTRAINT IF EXISTS line_channel_associations_customer_id_fkey;
ALTER TABLE line_channel_associations DROP CONSTRAINT IF EXISTS line_channel_associations_supplier_id_fkey;
DROP INDEX IF EXISTS idx_line_channel_associations_customer_id;
DROP INDEX IF EXISTS idx_line_channel_associations_supplier_id;
ALTER TABLE line_channel_associations DROP COLUMN IF EXISTS customer_id;
ALTER TABLE line_channel_associations DROP COLUMN IF EXISTS supplier_id;

-- ============================================
-- Step 10: 刪除舊表
-- ============================================

DROP TABLE IF EXISTS customer_views;
DROP TABLE IF EXISTS customer_files;
DROP TABLE IF EXISTS suppliers;
DROP TABLE IF EXISTS customers;

-- ============================================
-- 完成
-- ============================================

COMMIT;

-- 驗證遷移結果
SELECT 'partners' as table_name, COUNT(*) as count FROM partners
UNION ALL
SELECT 'partner_roles', COUNT(*) FROM partner_roles
UNION ALL
SELECT 'partner_views', COUNT(*) FROM partner_views
UNION ALL
SELECT 'partner_files', COUNT(*) FROM partner_files;
