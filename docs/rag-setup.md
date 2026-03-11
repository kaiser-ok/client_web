# RAG / Dify 整合設定指南

## 已完成項目

- ✅ Prisma Schema 擴展（DocumentChunk 模型）
- ✅ Embedding 服務 (`src/lib/embedding.ts`)
- ✅ Dify API 整合 (`src/lib/dify.ts`)
- ✅ RAG API 端點
  - `POST /api/rag/chat` - AI 對話（結合 RAG）
  - `GET/POST /api/rag/search` - 向量搜尋
  - `GET/POST /api/rag/sync` - 資料同步
- ✅ pgvector 擴展安裝及索引建立
- ✅ LINE 訊息同步到向量資料庫（129 個分塊）
- ✅ Embedding 生成（OpenAI text-embedding-3-small）
- ✅ AI 對話介面 (`/chat` 頁面)

## 待手動執行項目

### 1. 安裝 pgvector 擴展

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y postgresql-16-pgvector

# 在 PostgreSQL 中啟用
psql -d client_web -c "CREATE EXTENSION vector;"

# 添加 embedding 欄位
psql -d client_web -c "ALTER TABLE document_chunks ADD COLUMN embedding vector(1536);"

# 創建索引（加速搜尋）
psql -d client_web -c "CREATE INDEX ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);"
```

### 2. 啟動 Docker 服務

```bash
sudo systemctl start docker
sudo systemctl enable docker
```

### 3. 啟動 Dify

```bash
cd ~/dify/docker
docker compose up -d

# 等待啟動完成（約 2-3 分鐘）
docker compose ps

# 訪問 http://localhost:8080/install 進行初始化設定
```

### 4. 配置 Dify API Key

1. 登入 Dify 控制台 (http://localhost:8080)
2. 創建新應用 → 選擇「對話型」
3. 配置知識庫和提示詞
4. 獲取 API Key
5. 更新 `.env.local`:

```env
DIFY_API_URL="http://localhost:8080/v1"
DIFY_API_KEY="your-app-api-key"
```

### 5. 配置 OpenAI API Key（用於 Embedding）

```env
OPENAI_API_KEY="sk-your-api-key"
```

或使用其他相容 OpenAI API 的服務：

```env
OPENAI_BASE_URL="https://your-api-endpoint/v1"
OPENAI_API_KEY="your-api-key"
EMBEDDING_MODEL="text-embedding-3-small"
```

## API 使用範例

### 同步 LINE 訊息到向量資料庫

```bash
curl -X POST http://localhost:3000/api/rag/sync \
  -H "Content-Type: application/json" \
  -d '{"type": "line", "channelId": "your-channel-id"}'
```

### 同步所有資料

```bash
curl -X POST http://localhost:3000/api/rag/sync \
  -H "Content-Type: application/json" \
  -d '{"type": "all"}'
```

### RAG 對話

```bash
curl -X POST http://localhost:3000/api/rag/chat \
  -H "Content-Type: application/json" \
  -d '{
    "query": "這個客戶上個月提到什麼問題？",
    "customerId": "customer-id"
  }'
```

### 向量搜尋

```bash
curl "http://localhost:3000/api/rag/search?q=報價&sourceType=LINE&limit=5"
```

## 架構圖

```
┌─────────────────────────────────────────────────────────────┐
│                       client-web                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  LINE 訊息 ──┐                                               │
│  活動記錄 ───┼──▶ /api/rag/sync ──▶ DocumentChunk 表        │
│  (未來: Email)─┘                          │                 │
│                                           ▼                 │
│                              ┌─────────────────────┐        │
│                              │ PostgreSQL+pgvector │        │
│                              │   embedding 向量     │        │
│                              └──────────┬──────────┘        │
│                                         │                   │
│  用戶查詢 ──▶ /api/rag/chat ──▶ 向量搜尋 ──▶ LLM 生成回答    │
│                    │                                        │
│                    ▼                                        │
│              ┌──────────┐                                   │
│              │   Dify   │ (可選，用於複雜 Agent 流程)        │
│              └──────────┘                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 檔案結構

```
src/
├── lib/
│   ├── embedding.ts      # Embedding 服務
│   └── dify.ts           # Dify API 整合
├── app/
│   ├── chat/page.tsx     # AI 對話介面
│   └── api/rag/
│       ├── chat/route.ts     # RAG 對話 API
│       ├── search/route.ts   # 向量搜尋 API
│       └── sync/route.ts     # 資料同步 API
└── components/layout/
    ├── Sidebar.tsx       # 側邊欄（含 AI 助理選單）
    └── MobileNav.tsx     # 行動版導航
```

## 測試腳本

```
scripts/
├── test-rag-sync.ts         # 測試 LINE 訊息同步
├── generate-embeddings.ts   # 批量生成 Embedding
└── test-rag-search.ts       # 測試向量搜尋
```

執行方式：
```bash
# 載入環境變數後執行
source .env.local
npx tsx scripts/test-rag-sync.ts
npx tsx scripts/generate-embeddings.ts
npx tsx scripts/test-rag-search.ts
```
