-- ============================================
-- Partner 遷移回滾腳本
-- 從備份還原 Customer + Supplier 架構
-- ============================================

-- 注意：此腳本假設您有完整的資料庫備份
-- 建議直接從備份還原：
-- PGPASSWORD=chunwencheng pg_restore -h localhost -U chunwencheng -d client_web -c /opt/client-web/backups/pre-partner-refactor/db_backup_*.dump

-- 如果只想還原結構（不含資料），可以使用此腳本

BEGIN;

-- ============================================
-- Step 1: 刪除新建的表和約束
-- ============================================

-- 刪除外鍵約束
ALTER TABLE activities DROP CONSTRAINT IF EXISTS fk_activities_partner;
ALTER TABLE open_items DROP CONSTRAINT IF EXISTS fk_open_items_partner;
ALTER TABLE deals DROP CONSTRAINT IF EXISTS fk_deals_partner;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS fk_projects_partner;
ALTER TABLE quotations DROP CONSTRAINT IF EXISTS fk_quotations_partner;
ALTER TABLE technical_notes DROP CONSTRAINT IF EXISTS fk_technical_notes_partner;
ALTER TABLE line_users DROP CONSTRAINT IF EXISTS fk_line_users_partner;
ALTER TABLE line_channels DROP CONSTRAINT IF EXISTS fk_line_channels_partner;
ALTER TABLE line_channel_associations DROP CONSTRAINT IF EXISTS fk_line_channel_associations_partner;
ALTER TABLE partners DROP CONSTRAINT IF EXISTS fk_partners_parent;

-- 刪除新建的表
DROP TABLE IF EXISTS partner_roles CASCADE;
DROP TABLE IF EXISTS partner_views CASCADE;
DROP TABLE IF EXISTS partner_files CASCADE;
DROP TABLE IF EXISTS partners CASCADE;

-- ============================================
-- Step 2: 還原欄位名稱
-- ============================================

-- 如果欄位已被重命名，還原回去
ALTER TABLE open_items RENAME COLUMN dealer TO partner;
ALTER TABLE line_users RENAME COLUMN contact_name TO partner_name;
ALTER TABLE line_users RENAME COLUMN contact_phone TO partner_phone;
ALTER TABLE slack_channel_mappings RENAME COLUMN partner_id TO customer_id;
ALTER TABLE slack_channel_mappings RENAME COLUMN partner_name TO customer_name;
ALTER TABLE deleted_slack_activities RENAME COLUMN partner_id TO customer_id;
ALTER TABLE deleted_slack_activities RENAME COLUMN partner_name TO customer_name;
ALTER TABLE document_chunks RENAME COLUMN partner_id TO customer_id;
ALTER TABLE dashboard_stats RENAME COLUMN partner_count TO customer_count;

-- ============================================
-- Step 3: 從備份還原完整資料庫
-- ============================================

-- 執行以下命令還原完整備份：
-- PGPASSWORD=chunwencheng pg_restore -h localhost -U chunwencheng -d client_web -c /opt/client-web/backups/pre-partner-refactor/db_backup_*.dump

COMMIT;

-- 提示
SELECT '請執行以下命令還原完整備份:' as message
UNION ALL
SELECT 'PGPASSWORD=chunwencheng pg_restore -h localhost -U chunwencheng -d client_web -c /opt/client-web/backups/pre-partner-refactor/db_backup_*.dump';
