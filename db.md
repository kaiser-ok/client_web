# 資料庫連線資訊

## PostgreSQL

| 項目 | 值 |
|------|-----|
| Host | localhost |
| Port | 5432 |
| Database | client_web |
| Username | chunwencheng |
| Password | chunwencheng |

## 連線字串

```
DATABASE_URL="postgresql://chunwencheng:chunwencheng@localhost:5432/client_web"
```

## 常用指令

### 進入 psql
```bash
PGPASSWORD=chunwencheng psql -h localhost -U chunwencheng -d client_web
```

### 列出所有資料表
```bash
PGPASSWORD=chunwencheng psql -h localhost -U chunwencheng -d client_web -c "\dt"
```

### 查詢使用者
```bash
PGPASSWORD=chunwencheng psql -h localhost -U chunwencheng -d client_web -c "SELECT id, email, role FROM users;"
```

### 設定使用者為管理員
```bash
PGPASSWORD=chunwencheng psql -h localhost -U chunwencheng -d client_web -c "UPDATE users SET role = 'ADMIN' WHERE email = 'user@example.com';"
```

### Prisma 指令
```bash
# 同步 schema 到資料庫
DATABASE_URL="postgresql://chunwencheng:chunwencheng@localhost:5432/client_web" npx prisma db push

# 重新產生 Prisma Client
DATABASE_URL="postgresql://chunwencheng:chunwencheng@localhost:5432/client_web" npx prisma generate

# 開啟 Prisma Studio (GUI)
DATABASE_URL="postgresql://chunwencheng:chunwencheng@localhost:5432/client_web" npx prisma studio
```

## 資料表

| 資料表 | 說明 |
|--------|------|
| users | 使用者（NextAuth） |
| customers | 客戶 |
| activities | 活動紀錄 |
| deals | 成交/合約 |
| open_items | Jira 待處理項目 |
| dashboard_stats | 儀表板統計快取 |

---

# Odoo 資料庫（本地 Mirror）

本系統透過 `pg` Pool 直接讀取本地的 Odoo PostgreSQL mirror，取代原先連線遠端 Odoo DB。
連線實作位於 `src/lib/odoo.ts`，具備讀寫權限。

## PostgreSQL（目前使用）

| 項目 | 值 |
|------|-----|
| Host | localhost |
| Port | 5432 |
| Database | odoo |
| Username | proj |
| Password | p20j2ead0n1y |

## 連線字串

```
ODOO_DATABASE_URL="postgresql://proj:p20j2ead0n1y@localhost:5432/odoo"
```

## 常用指令

### 進入 psql
```bash
PGPASSWORD=p20j2ead0n1y psql -h localhost -U proj -d odoo
```

### 列出所有資料表
```bash
PGPASSWORD=p20j2ead0n1y psql -h localhost -U proj -d odoo -c "\dt"
```

## 環境變數

在 `.env.local` 中設定：
```
ODOO_DB_HOST=localhost
ODOO_DB_PORT=5432
ODOO_DB_NAME=odoo
ODOO_DB_USER=proj
ODOO_DB_PASSWORD=p20j2ead0n1y
```

## 用途

- 同步歷史成交案件資料
- 取得訂單、客戶、產品、發票等資訊
- 寫回 CRM 客戶 ID 及新建客戶至 Odoo

## 存取的 Odoo 資料表

| Odoo 資料表 | 對應本地 | 說明 | 方向 |
|-------------|----------|------|------|
| res_partner | Partner | 客戶/供應商 | 雙向（讀+寫） |
| sale_order | Deal | 成交訂單 | 讀取 |
| sale_order_line | Deal.productsJson | 訂單產品明細 | 讀取 |
| account_move | Activity (source=ERP) | 發票 | 讀取 |
| crm_tag | Partner.odooTags | 訂單標籤 | 讀取 |
| res_users | User | 員工 | 讀取 |
| product_template / product_product | — | 產品資訊 | 讀取 |
| project_type | Deal.projectType | 專案類型 | 讀取 |

## 同步 API 端點

| 端點 | 方法 | 功能 |
|------|------|------|
| `/api/odoo/sync-customers` | POST | 同步客戶到 Partner |
| `/api/odoo/sync-deals` | POST | 同步訂單到 Deal |
| `/api/odoo/sync-invoices` | POST | 同步發票為 Activity |
| `/api/odoo/sync-tags` | POST/PUT | 同步訂單標籤 |
| `/api/odoo/sync-employees` | POST | 同步員工為 User |
| `/api/partners/[id]/sync-deals` | POST | 單一客戶同步訂單 |

## 自動同步機制（遠端 → 本地 Mirror）

本地 Odoo mirror 透過 `pg_dump/pg_restore` 全量同步，由 cron 每天凌晨 2:00 自動執行。

### 同步腳本

```bash
# 手動執行同步
/opt/client-web/scripts/sync-odoo-mirror.sh

# 查看同步日誌
tail -f /opt/client-web/logs/odoo-mirror-sync.log
```

### 同步流程

1. `pg_dump -Fc` 從遠端 192.168.30.138 匯出 odoo 資料庫
2. 停止本地 Odoo 服務（`systemctl stop odoo17`）
3. `pg_restore --clean --if-exists` 還原到本地 odoo DB（覆蓋式更新）
4. 重啟本地 Odoo 服務（`systemctl start odoo17`）
5. 驗證本地資料庫可正常讀取

### Cron 排程

```cron
0 2 * * * /opt/client-web/scripts/sync-odoo-mirror.sh >> /opt/client-web/logs/odoo-mirror-sync.log 2>&1
```

### 注意事項

- 使用 `--no-owner --no-privileges` 避免本地權限問題
- 同步期間本地 Odoo 服務會暫停（約數分鐘）
- 有 lock file 機制防止重複執行
- dump 暫存於 `/tmp/odoo_mirror.dump`，完成後自動清除

---

# Odoo 遠端資料庫（原始來源，備參）

本地 Mirror 的資料來源，目前系統已不直接連線。

## PostgreSQL

| 項目 | 值 |
|------|-----|
| Host | 192.168.30.138 |
| Port | 5432 |
| Database | odoo |
| Username | proj |
| Password | p20j2ead0n1y |

## 連線字串

```
ODOO_DATABASE_URL="postgresql://proj:p20j2ead0n1y@192.168.30.138:5432/odoo"
```

## 常用指令

### 進入 psql
```bash
PGPASSWORD=p20j2ead0n1y psql -h 192.168.30.138 -U proj -d odoo
```

### 列出所有資料表
```bash
PGPASSWORD=p20j2ead0n1y psql -h 192.168.30.138 -U proj -d odoo -c "\dt"
```

---

# 資料模型（Prisma Schema 摘要）

完整 schema 請見 `prisma/schema.prisma`

### 核心模型

| Model | Table | 說明 |
|-------|-------|------|
| Partner | partners | 統一客戶/供應商/經銷商模型 |
| PartnerRole | partner_roles | Partner 角色（CUSTOMER, SUPPLIER, PARTNER） |
| PartnerView | partner_views | 使用者查看紀錄（per-user 排序用） |
| Activity | activities | 活動時間軸（source: JIRA, MANUAL, MEETING, LINE, EMAIL, DOC, SLACK, ERP） |
| OpenItem | open_items | Jira Issue 本地快照（含 waitingOn, nextAction, dealer） |
| User | users | 使用者（role: ADMIN, SALES, SUPPORT 等） |
| Deal | deals | 成交/合約（含 Odoo 同步欄位） |
| Contact | contacts | 跨通路聯絡人 |

### 專案與獎金

| Model | Table | 說明 |
|-------|-------|------|
| Project | projects | 專案管理（status: ACTIVE, COMPLETED, ON_HOLD, CANCELLED） |
| ProjectBonusEval | project_bonus_evals | 專案獎金評估（分數計算、保固攤分） |
| ProjectCost | project_costs | 專案外部成本（LABOR, HARDWARE, LICENSE 等） |
| ProjectBonusMember | project_bonus_members | 獎金分潤成員（含年度偏移、貢獻比例） |

### 報價單

| Model | Table | 說明 |
|-------|-------|------|
| Quotation | quotations | 報價單（編號 YYMMDD[A-Z]，可同步 Odoo） |
| QuotationItem | quotation_items | 報價明細（產品、SKU、數量、單價） |
| QuotationTemplate | quotation_templates | 報價範本（VOIP, SMART_NETWORK, EQUIPMENT, CUSTOM） |

### 檔案與知識庫

| Model | Table | 說明 |
|-------|-------|------|
| PartnerFile | partner_files | 客戶檔案（按年份組織，支援軟刪除） |
| TechnicalNote | technical_notes | 技術知識（從 Slack 擷取，含關鍵字/參與者） |
| DocumentChunk | document_chunks | RAG 向量搜尋（pgvector embedding） |
| ProductPriority | product_priorities | 產品優先順序 |
| ProductCategory | product_categories | 產品分類 |

### LINE 整合

| Model | Table | 說明 |
|-------|-------|------|
| LineUser | line_users | LINE 用戶（含身分類型: STAFF, PARTNER, CUSTOMER, UNKNOWN） |
| LineChannel | line_channels | LINE 頻道（GROUP, ROOM, USER），可關聯 Partner 和 Project |
| LineChannelAssociation | line_channel_associations | 頻道與 Partner 多對多關聯 |
| LineMessage | line_messages | LINE 訊息（text, image, file, sticker 等） |
| LineSummary | line_summaries | LINE 月度摘要（JSON） |

### Slack 整合

| Model | Table | 說明 |
|-------|-------|------|
| SlackChannelMapping | slack_channel_mappings | Slack 頻道對應 Partner |
| DeletedSlackActivity | deleted_slack_activities | 已刪除的 Slack 活動（審計用） |

### 系統與身分識別

| Model | Table | 說明 |
|-------|-------|------|
| DashboardStats | dashboard_stats | Dashboard 統計快取（singleton） |
| SystemConfig | system_configs | 系統設定 key-value |
| IdentityMapping | identity_mappings | 跨通路身分對應（LINE/Slack/Email → Partner/Contact） |
| ResolutionLog | resolution_logs | 身分解析日誌 |
| GraphSyncLog | graph_sync_logs | Neo4j 圖譜同步日誌 |
