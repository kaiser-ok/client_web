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
