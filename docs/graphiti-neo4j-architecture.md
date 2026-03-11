# Graphiti + Neo4j 訊息知識圖譜架構

## 1. 概述

使用 Graphiti + Neo4j 儲存和查詢來自 Slack、LINE、Email 的訊息，建立跨平台的客戶溝通知識圖譜。

### 核心功能
- **訊息關聯查詢**：查詢某客戶的所有溝通記錄（跨平台）
- **對話脈絡追蹤**：追蹤對話串、回覆關係、相關討論
- **知識圖譜 RAG**：結合 LLM 進行智能問答

---

## 2. Neo4j 圖形資料模型

### 2.1 節點類型 (Nodes)

```cypher
// 人員節點
(:Person {
  id: string,           // UUID
  name: string,
  email: string?,
  phone: string?,
  lineUserId: string?,
  slackUserId: string?,
  partnerId: string?,   // 關聯到 CRM Partner
  type: 'INTERNAL' | 'EXTERNAL'
})

// 組織節點
(:Organization {
  id: string,
  name: string,
  partnerId: string?,   // 關聯到 CRM Partner
  domain: string?       // email domain
})

// 訊息節點
(:Message {
  id: string,           // UUID
  externalId: string,   // 原始平台 ID
  platform: 'SLACK' | 'LINE' | 'EMAIL',
  content: string,
  contentEmbedding: float[],  // 向量嵌入
  timestamp: datetime,
  channelId: string?,
  threadId: string?,
  subject: string?,     // Email 主旨
  metadata: json
})

// 頻道/群組節點
(:Channel {
  id: string,
  externalId: string,
  platform: 'SLACK' | 'LINE' | 'EMAIL',
  name: string,
  type: 'PUBLIC' | 'PRIVATE' | 'DM' | 'GROUP'
})

// 主題節點 (由 LLM 提取)
(:Topic {
  id: string,
  name: string,
  description: string?,
  embedding: float[]
})

// 案件/議題節點
(:Issue {
  id: string,
  title: string,
  jiraKey: string?,
  status: string,
  partnerId: string?
})

// 實體節點 (由 LLM 提取)
(:Entity {
  id: string,
  name: string,
  type: 'PRODUCT' | 'PROJECT' | 'FEATURE' | 'ERROR' | 'OTHER',
  description: string?
})
```

### 2.2 關係類型 (Relationships)

```cypher
// 訊息發送關係
(Person)-[:SENT {timestamp: datetime}]->(Message)

// 訊息接收關係
(Message)-[:SENT_TO]->(Person)
(Message)-[:SENT_TO]->(Channel)

// 訊息回覆關係
(Message)-[:REPLIES_TO]->(Message)

// 訊息串關係
(Message)-[:IN_THREAD]->(Message)  // 指向 thread 起始訊息

// 人員所屬組織
(Person)-[:BELONGS_TO {role: string}]->(Organization)

// 訊息提及關係
(Message)-[:MENTIONS]->(Person)
(Message)-[:MENTIONS]->(Entity)

// 訊息主題關係
(Message)-[:ABOUT]->(Topic)

// 訊息與案件關係
(Message)-[:RELATED_TO]->(Issue)

// 人員與案件關係
(Person)-[:REPORTED]->(Issue)
(Person)-[:ASSIGNED_TO]->(Issue)

// 語意相似關係 (透過 embedding 計算)
(Message)-[:SIMILAR_TO {score: float}]->(Message)
```

### 2.3 索引設計

```cypher
// 唯一性約束
CREATE CONSTRAINT person_id IF NOT EXISTS FOR (p:Person) REQUIRE p.id IS UNIQUE;
CREATE CONSTRAINT message_id IF NOT EXISTS FOR (m:Message) REQUIRE m.id IS UNIQUE;
CREATE CONSTRAINT message_external IF NOT EXISTS FOR (m:Message) REQUIRE (m.platform, m.externalId) IS UNIQUE;
CREATE CONSTRAINT org_id IF NOT EXISTS FOR (o:Organization) REQUIRE o.id IS UNIQUE;
CREATE CONSTRAINT channel_id IF NOT EXISTS FOR (c:Channel) REQUIRE c.id IS UNIQUE;

// 搜尋索引
CREATE INDEX message_timestamp IF NOT EXISTS FOR (m:Message) ON (m.timestamp);
CREATE INDEX message_platform IF NOT EXISTS FOR (m:Message) ON (m.platform);
CREATE INDEX person_email IF NOT EXISTS FOR (p:Person) ON (p.email);
CREATE INDEX person_partner IF NOT EXISTS FOR (p:Person) ON (p.partnerId);

// 向量索引 (Neo4j 5.x+)
CREATE VECTOR INDEX message_embedding IF NOT EXISTS
FOR (m:Message) ON (m.contentEmbedding)
OPTIONS {indexConfig: {
  `vector.dimensions`: 1536,
  `vector.similarity_function`: 'cosine'
}};
```

---

## 3. Graphiti 整合架構

### 3.1 系統架構圖

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Web (Next.js)                      │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────────┐ │
│  │  Slack  │  │  LINE   │  │  Gmail  │  │   Query Interface   │ │
│  │ Webhook │  │ Webhook │  │  IMAP   │  │   (RAG + Search)    │ │
│  └────┬────┘  └────┬────┘  └────┬────┘  └──────────┬──────────┘ │
│       │            │            │                   │            │
│       ▼            ▼            ▼                   │            │
│  ┌─────────────────────────────────────────────┐   │            │
│  │           Message Queue (Bull/Redis)         │   │            │
│  └─────────────────────┬───────────────────────┘   │            │
│                        │                           │            │
│                        ▼                           │            │
│  ┌─────────────────────────────────────────────┐   │            │
│  │              Graphiti Service               │   │            │
│  │  ┌─────────────────────────────────────┐   │   │            │
│  │  │  1. Message Parser & Normalizer     │   │   │            │
│  │  │  2. Entity Extraction (LLM)         │   │   │            │
│  │  │  3. Embedding Generator             │   │   │            │
│  │  │  4. Relationship Builder            │   │   │            │
│  │  │  5. Auto-Linker (Partner/Issue)     │   │   │            │
│  │  └─────────────────────────────────────┘   │   │            │
│  └─────────────────────┬───────────────────────┘   │            │
│                        │                           │            │
│                        ▼                           ▼            │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                      Neo4j Database                          ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐││
│  │  │  Nodes   │ │Relations │ │ Vectors  │ │  Full-text Index │││
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘││
│  └─────────────────────────────────────────────────────────────┘│
│                        │                                         │
│                        ▼                                         │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    PostgreSQL (Prisma)                       ││
│  │              Partner, Deal, Issue, Activity...               ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 核心模組

```typescript
// src/lib/graphiti/index.ts

interface GraphitiConfig {
  neo4j: {
    uri: string
    username: string
    password: string
  }
  embedding: {
    provider: 'openai' | 'local'
    model: string
    dimensions: number
  }
  llm: {
    provider: 'openai' | 'vllm'
    model: string
  }
}

interface MessageInput {
  platform: 'SLACK' | 'LINE' | 'EMAIL'
  externalId: string
  content: string
  timestamp: Date
  sender: {
    id?: string
    name?: string
    email?: string
  }
  recipients?: Array<{
    id?: string
    name?: string
    email?: string
  }>
  channelId?: string
  threadId?: string
  replyToId?: string
  subject?: string
  metadata?: Record<string, unknown>
}

class GraphitiService {
  // 儲存訊息到知識圖譜
  async ingestMessage(input: MessageInput): Promise<void>

  // 批量匯入訊息
  async bulkIngest(inputs: MessageInput[]): Promise<void>

  // 查詢相關訊息 (向量 + 圖形)
  async searchMessages(query: string, options?: SearchOptions): Promise<Message[]>

  // 取得客戶的所有溝通記錄
  async getPartnerCommunications(partnerId: string): Promise<Message[]>

  // 取得對話脈絡
  async getConversationContext(messageId: string): Promise<ConversationContext>

  // RAG 問答
  async ask(question: string, context?: QueryContext): Promise<Answer>

  // 自動關聯訊息到 Partner
  async autoLinkToPartner(messageId: string): Promise<Partner | null>
}
```

---

## 4. 訊息同步流程

### 4.1 即時同步 (Webhook)

```typescript
// Slack Webhook -> Queue -> Graphiti
// LINE Webhook -> Queue -> Graphiti

// src/app/api/webhooks/slack/route.ts
export async function POST(req: Request) {
  const event = await req.json()

  if (event.type === 'message') {
    await messageQueue.add('slack-message', {
      platform: 'SLACK',
      externalId: event.ts,
      content: event.text,
      timestamp: new Date(parseFloat(event.ts) * 1000),
      sender: { id: event.user },
      channelId: event.channel,
      threadId: event.thread_ts,
    })
  }
}
```

### 4.2 批量同步 (歷史資料)

```typescript
// src/lib/graphiti/sync.ts

async function syncSlackHistory(channelId: string, since?: Date) {
  const messages = await slackClient.getChannelHistory(channelId, since)

  for (const batch of chunk(messages, 100)) {
    await graphiti.bulkIngest(batch.map(m => ({
      platform: 'SLACK',
      externalId: m.ts,
      content: m.text,
      timestamp: new Date(parseFloat(m.ts) * 1000),
      sender: { id: m.user },
      channelId,
      threadId: m.thread_ts,
    })))
  }
}

async function syncGmailHistory(email: string, since?: Date) {
  const emails = await gmailClient.fetchEmails(email, since)

  for (const batch of chunk(emails, 50)) {
    await graphiti.bulkIngest(batch.map(e => ({
      platform: 'EMAIL',
      externalId: e.messageId,
      content: e.body,
      timestamp: e.date,
      sender: { email: e.from },
      recipients: e.to.map(r => ({ email: r })),
      subject: e.subject,
      threadId: e.threadId,
    })))
  }
}
```

### 4.3 處理流程

```
1. 接收訊息
   ↓
2. 標準化訊息格式 (MessageInput)
   ↓
3. 識別/建立 Person 節點
   ├── 透過 email/slackId/lineUserId 匹配現有節點
   └── 若無則建立新節點
   ↓
4. LLM 分析 (可選，非同步)
   ├── 提取實體 (產品、專案、錯誤碼)
   ├── 分類主題
   └── 判斷情緒/緊急程度
   ↓
5. 生成 Embedding
   ↓
6. 建立圖形關係
   ├── SENT, SENT_TO
   ├── REPLIES_TO, IN_THREAD
   ├── MENTIONS
   └── ABOUT (主題)
   ↓
7. 自動關聯
   ├── 透過 email domain 匹配 Organization → Partner
   ├── 透過關鍵字匹配 Issue (Jira Key)
   └── LLM 建議關聯 (需人工確認)
   ↓
8. 儲存到 Neo4j
```

---

## 5. RAG 查詢介面

### 5.1 查詢類型

```typescript
// 1. 自然語言問答
await graphiti.ask("這個客戶上次反映什麼問題？", {
  partnerId: "xxx"
})

// 2. 語意搜尋
await graphiti.searchMessages("網路斷線問題", {
  platforms: ['SLACK', 'LINE'],
  dateRange: { from: '2024-01-01' },
  limit: 20
})

// 3. 圖形查詢
await graphiti.query(`
  MATCH (p:Person {partnerId: $partnerId})-[:SENT]->(m:Message)
  WHERE m.timestamp > $since
  RETURN m ORDER BY m.timestamp DESC
`, { partnerId, since })

// 4. 對話脈絡
await graphiti.getConversationContext(messageId)
// 返回: 原始訊息 + 前後文 + 相關訊息 + 涉及人員
```

### 5.2 RAG Pipeline

```
User Question
     ↓
┌─────────────────────────────────────┐
│  1. Query Understanding (LLM)       │
│     - 識別意圖                      │
│     - 提取實體 (客戶名、時間範圍)    │
│     - 生成搜尋策略                  │
└─────────────────────────────────────┘
     ↓
┌─────────────────────────────────────┐
│  2. Hybrid Retrieval                │
│     - Vector Search (語意相似)      │
│     - Graph Traversal (關係查詢)    │
│     - Keyword Search (精確匹配)     │
└─────────────────────────────────────┘
     ↓
┌─────────────────────────────────────┐
│  3. Context Building                │
│     - 合併檢索結果                  │
│     - 擴展關聯上下文                │
│     - 排序與截斷                    │
└─────────────────────────────────────┘
     ↓
┌─────────────────────────────────────┐
│  4. Answer Generation (LLM)         │
│     - 基於上下文生成回答            │
│     - 附帶來源引用                  │
└─────────────────────────────────────┘
     ↓
Answer with Citations
```

---

## 6. 實作計畫

### Phase 1: 基礎建設 (Week 1-2)
- [ ] 安裝設定 Neo4j (Docker)
- [ ] 建立 Neo4j schema 和索引
- [ ] 實作 GraphitiService 核心類別
- [ ] 實作 Embedding 生成 (OpenAI)

### Phase 2: 訊息同步 (Week 3-4)
- [ ] 實作 Slack 訊息同步
- [ ] 實作 LINE 訊息同步
- [ ] 實作 Email 訊息同步
- [ ] 建立 Message Queue (Bull)

### Phase 3: 智能關聯 (Week 5-6)
- [ ] 實作自動 Partner 關聯
- [ ] 實作 LLM 實體提取
- [ ] 實作 LLM 主題分類
- [ ] 建立人工確認介面

### Phase 4: RAG 查詢 (Week 7-8)
- [ ] 實作向量搜尋
- [ ] 實作圖形查詢
- [ ] 實作 RAG Pipeline
- [ ] 建立查詢 API 和 UI

---

## 7. 環境配置

```bash
# .env.local

# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your-password

# Redis (for Bull Queue)
REDIS_URL=redis://localhost:6379

# Embedding
OPENAI_API_KEY=sk-xxx
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536

# LLM (for entity extraction & RAG)
LLM_PROVIDER=openai  # or vllm
LLM_MODEL=gpt-4o-mini
```

---

## 8. Docker Compose

```yaml
version: '3.8'

services:
  neo4j:
    image: neo4j:5.15.0
    ports:
      - "7474:7474"  # Browser
      - "7687:7687"  # Bolt
    environment:
      - NEO4J_AUTH=neo4j/your-password
      - NEO4J_PLUGINS=["apoc", "graph-data-science"]
      - NEO4J_dbms_security_procedures_unrestricted=apoc.*,gds.*
    volumes:
      - neo4j_data:/data
      - neo4j_logs:/logs

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  neo4j_data:
  neo4j_logs:
  redis_data:
```

---

## 9. 範例查詢

```cypher
-- 查詢某客戶的所有溝通記錄
MATCH (o:Organization {partnerId: $partnerId})<-[:BELONGS_TO]-(p:Person)-[:SENT]->(m:Message)
RETURN m ORDER BY m.timestamp DESC LIMIT 50

-- 查詢對話串
MATCH (m:Message {id: $messageId})<-[:IN_THREAD]-(replies:Message)
RETURN m, replies ORDER BY replies.timestamp

-- 查詢相似訊息 (向量搜尋)
CALL db.index.vector.queryNodes('message_embedding', 10, $queryEmbedding)
YIELD node, score
RETURN node, score

-- 查詢某人最近的活動
MATCH (p:Person {email: $email})-[r:SENT|MENTIONS]-(m:Message)
WHERE m.timestamp > datetime() - duration('P30D')
RETURN p, r, m ORDER BY m.timestamp DESC

-- 查詢跨平台對話
MATCH (p1:Person)-[:SENT]->(m1:Message)-[:SIMILAR_TO]->(m2:Message)<-[:SENT]-(p2:Person)
WHERE m1.platform <> m2.platform
RETURN p1, m1, m2, p2
```
