# Graphiti + Neo4j 知識圖譜整合

## 概述

整合 Graphiti + Neo4j 來儲存和查詢 Slack、LINE、Email 訊息，建立跨平台的客戶溝通知識圖譜。

## 系統架構

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Web (Next.js)                     │
├─────────────────────────────────────────────────────────────┤
│  Slack Webhook    LINE Webhook    Gmail IMAP                │
│       │                │              │                      │
│       └────────────────┼──────────────┘                      │
│                        ▼                                     │
│              Graphiti Python Service (8001)                  │
│                        │                                     │
│                        ▼                                     │
│                   Neo4j (7687)                               │
└─────────────────────────────────────────────────────────────┘
```

## 服務配置

### Docker Compose

```bash
# 啟動服務
sudo docker compose -f docker-compose.neo4j.yml up -d

# 查看狀態
sudo docker compose -f docker-compose.neo4j.yml ps

# 查看日誌
sudo docker compose -f docker-compose.neo4j.yml logs -f graphiti
```

### 服務端口

| 服務 | 端口 | 說明 |
|------|------|------|
| Neo4j Browser | 7474 | Web 管理介面 |
| Neo4j Bolt | 7687 | 資料庫連線 |
| Graphiti API | 8001 | REST API |
| Redis | 6379 | 快取/佇列 |

### 認證資訊

- **Neo4j**: `neo4j` / `graphiti123`
- **Neo4j Browser**: http://localhost:7474

## API 端點

### Graphiti Python Service (Port 8001)

| 端點 | 方法 | 說明 |
|------|------|------|
| `/health` | GET | 健康檢查 |
| `/messages` | POST | 寫入單一訊息 |
| `/messages/bulk` | POST | 批量寫入訊息 |
| `/search` | POST | 搜尋訊息 |
| `/ask` | POST | RAG 問答 |
| `/partner/{id}/messages` | GET | 取得客戶訊息 |

### Next.js API Routes

| 端點 | 方法 | 說明 |
|------|------|------|
| `/api/graphiti/search` | POST | 搜尋訊息（需登入） |
| `/api/graphiti/ask` | POST | RAG 問答（需登入） |
| `/api/graphiti/sync` | POST | 同步訊息（需 ADMIN） |
| `/api/slack/webhook` | POST | Slack Events API |
| `/api/slack/sync-history` | POST | Slack 歷史同步 |
| `/api/line/webhook` | POST | LINE Webhook（已整合 Graphiti） |
| `/api/line/sync-history` | POST | LINE 歷史同步 |

## 前端頁面

### 知識圖譜頁面 (`/knowledge`)

功能：
- **智能問答**：對話式 RAG 介面，支援自然語言查詢
- **訊息搜尋**：關鍵字搜尋，顯示來源平台標籤

## 檔案結構

```
/opt/client-web/
├── docker-compose.neo4j.yml      # Docker 配置
├── services/graphiti/
│   ├── Dockerfile                # Python 服務容器
│   ├── requirements.txt          # Python 依賴
│   ├── main.py                   # FastAPI 服務
│   └── .env.example              # 環境變數範例
├── src/lib/graphiti.ts           # Next.js 客戶端
├── src/app/api/graphiti/
│   ├── search/route.ts           # 搜尋 API
│   ├── ask/route.ts              # 問答 API
│   └── sync/route.ts             # 同步 API
├── src/app/api/slack/
│   ├── webhook/route.ts          # Slack Webhook
│   └── sync-history/route.ts     # 歷史同步
├── src/app/api/line/
│   ├── webhook/route.ts          # LINE Webhook（已整合）
│   └── sync-history/route.ts     # 歷史同步
└── src/app/knowledge/
    └── page.tsx                  # 知識圖譜頁面
```

## 環境變數

```bash
# .env.local

# Neo4j (for Graphiti Python Service)
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=graphiti123

# Graphiti API
GRAPHITI_URL=http://localhost:8001

# OpenAI (for embeddings and LLM)
OPENAI_API_KEY=sk-xxx

# Slack Webhook
SLACK_SIGNING_SECRET=your-signing-secret
```

## 使用範例

### 寫入訊息

```bash
curl -X POST http://localhost:8001/messages \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "SLACK",
    "external_id": "msg-001",
    "content": "客戶反映網路連線問題",
    "sender_name": "工程師",
    "channel_name": "support"
  }'
```

### 搜尋訊息

```bash
curl -X POST http://localhost:8001/search \
  -H "Content-Type: application/json" \
  -d '{"query": "網路問題", "limit": 10}'
```

### RAG 問答

```bash
curl -X POST http://localhost:8001/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "最近有哪些客戶反映問題？"}'
```

## Slack Webhook 設定

1. 前往 [Slack API](https://api.slack.com/apps) → 你的 App
2. **Event Subscriptions** → Enable Events
3. Request URL: `https://your-domain/api/slack/webhook`
4. Subscribe to bot events:
   - `message.channels`
   - `message.groups`
   - `message.im`
5. 複製 **Signing Secret** 到 `.env.local`

## LINE Webhook

已整合到現有的 `/api/line/webhook`，收到文字訊息時會自動同步到 Graphiti。

## Odoo x_crm_customer_id 整合

同時完成了 Odoo 資料庫 `x_crm_customer_id` 欄位的整合：

- 同步客戶時會自動將 CRM Partner ID 回寫到 Odoo
- 支援雙向關聯查詢

### 相關 API

- `POST /api/odoo/sync-customers` - 同步客戶並回寫 CRM ID

### 測試指令

```bash
# 測試同步
DATABASE_URL="postgresql://..." npx tsx scripts/test-sync.ts
```

## 維護指令

```bash
# 重啟所有服務
sudo docker compose -f docker-compose.neo4j.yml restart

# 查看 Graphiti 日誌
sudo docker logs client-web-graphiti -f

# 重建 Graphiti 服務
sudo docker compose -f docker-compose.neo4j.yml up -d --build graphiti

# 清空知識圖譜（危險）
curl -X DELETE http://localhost:8001/clear

# 重啟 Next.js
pm2 restart client-web
```

## 待辦事項

- [ ] 自動關聯訊息到 Partner（透過 email/電話比對）
- [ ] LLM 實體提取（產品、專案、錯誤代碼）
- [ ] Email (Gmail) 訊息同步
- [ ] 訊息情緒分析
- [ ] 客戶詳情頁整合知識圖譜

---

*最後更新: 2026-01-14*
