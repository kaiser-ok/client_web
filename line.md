# LINE Official Account 整合

## 帳號資訊

| 項目 | 值 |
|------|-----|
| Bot ID | @076bnnbp |
| Channel ID | 2007434533 |

## 環境變數

```env
LINE_CHANNEL_ACCESS_TOKEN="qMBXhJjsVodLHgg2UMinmUSGLJkTuEUaClKhT5zpoiRhKe6YSh0cLXGjiJxmfuYzU693V+N+/FBB8jRJprEsNCf/cH+rxybrGwROdBVtRJQ6H7pQVSia2+Xcx2n+ggXUx7sWWs7FyT4gsTNIxAr33wdB04t89/1O/w1cDnyilFU="
LINE_CHANNEL_SECRET="77b346397d2de48d341aaf69c4519533"
```

## Webhook 設定

- **Webhook URL**: `https://ghttp-proxy.gentrice.net:50580/it_crm_line/api/line/webhook`
- **Use webhook**: 開啟
- **Auto-reply messages**: 關閉
- **Greeting messages**: 關閉

## 網路架構

```
LINE Platform
    ↓ HTTPS
ghttp-proxy.gentrice.net:50580  (HAProxy)
    ↓ TCP forward
localhost:443  (Nginx)
    ↓ reverse proxy
localhost:3000  (Next.js)
```

**重要**：`LINE_BASE_URL` 環境變數必須設為 `https://ghttp-proxy.gentrice.net:50580/it_crm_line`，此 URL 用於組裝對外公開的媒體 URL，LINE 伺服器需從此 URL 抓取圖片／檔案內容。若設定錯誤（例如少了 `ghttp-` 前綴），文字/Emoji 仍可正常運作，但圖片或檔案傳送後 LINE 用戶端會無法顯示。

**設定位置**：`.env.local`
```env
LINE_BASE_URL="https://ghttp-proxy.gentrice.net:50580/it_crm_line"
```

### Nginx 上傳大小限制

Nginx 預設 `client_max_body_size` 為 1MB，傳送較大的圖片或檔案時請求會被截斷，導致「發送失敗」且 Next.js 完全收不到請求。

**設定位置**：`/etc/nginx/sites-available/proj.gentrice.net`，在 `location /` 區塊內加入：
```nginx
client_max_body_size 50m;
```

套用方式：
```bash
sudo nginx -t && sudo systemctl reload nginx
```

## API 端點

| 端點 | 方法 | 用途 |
|------|------|------|
| `/api/line/webhook` | POST | 接收 LINE 訊息 |
| `/api/line/channels` | GET | 列出所有頻道（支援 `?label=xxx` 篩選） |
| `/api/line/channels/[id]` | GET | 取得頻道詳情與訊息（含 labels） |
| `/api/line/channels/[id]` | PUT | 更新頻道對應 |
| `/api/line/channels/[id]/import` | POST | 匯入歷史聊天記錄 |
| `/api/line/channels/[id]/messages` | POST | 發送訊息 |
| `/api/line/channels/[id]/associations` | GET/POST/DELETE | 管理頻道關聯 |
| `/api/line/channels/[id]/labels` | GET/PUT | 管理頻道標籤（手動加/移除） |
| `/api/line/channels/[id]/summary` | POST | 生成 LLM 摘要 |
| `/api/line/users` | GET | 列出所有用戶 |
| `/api/line/users/[id]` | GET/PUT | 取得/更新用戶身分 |
| `/api/line/events` | GET | SSE 即時更新 |
| `/api/line/line-events` | GET/POST | 事件列表查詢 / 建立新事件 |
| `/api/line/line-events/[eid]` | GET/PUT/DELETE | 事件詳情 / 更新 / 刪除 |
| `/api/line/line-events/[eid]/status` | PUT | 事件狀態變更（assign/start/resolve/close/reopen） |
| `/api/line/line-events/[eid]/history` | GET | 事件狀態變更歷史 |
| `/api/settings/line-labels` | GET/PUT/POST | 標籤定義與 LLM 設定 CRUD |

## 管理介面

- 頻道收件匣：`/line-inbox`
- 事件管理：`/line-events`
- 頻道管理：`/settings/line`
- 用戶身分管理：`/settings/line/users`
- 標籤設定：`/settings/line/labels`

## 加入好友

掃描 QR Code 或搜尋 ID：**@440dazqs**

---

# 訊息儲存機制

## 資料庫 Schema（PostgreSQL + Prisma）

### LineUser（LINE 使用者）

```prisma
model LineUser {
  id               String    @id @default(cuid())
  lineUserId       String    @unique              // LINE 提供的 userId
  displayName      String                         // LINE 顯示名稱
  pictureUrl       String?                        // 大頭貼 URL
  identityType     String    @default("UNKNOWN")  // STAFF, PARTNER, CUSTOMER, UNKNOWN
  staffEmail       String?                        // 若為員工，關聯 email
  customerId       String?                        // 若為客戶，關聯客戶
  supplierId       String?                        // 若為廠商(供應商)，關聯供應商
  dealerCustomerId String?                        // 若為廠商(經銷商)，關聯經銷商客戶
  partnerName      String?                        // 廠商聯絡人姓名
  partnerPhone     String?                        // 廠商聯絡人電話
  note             String?                        // 備註
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  @@map("line_users")
}
```

**身分類型**：
- `STAFF` - 公司員工（關聯 email）
- `PARTNER` - 合作夥伴/廠商（關聯供應商或經銷商）
- `CUSTOMER` - 客戶（關聯客戶記錄）
- `UNKNOWN` - 未分類（預設）

### LineChannel（LINE 頻道）

```prisma
model LineChannel {
  id              String        @id @default(cuid())
  lineChannelId   String        @unique            // groupId 或 roomId 或 userId (1:1)
  channelType     String                           // GROUP, ROOM, USER
  channelName     String?                          // 群組名稱（若可取得）
  customerId      String?                          // 關聯客戶（保留向後相容）
  projectId       String?                          // 關聯專案
  isActive        Boolean       @default(true)
  lastMessageAt   DateTime?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  messages        LineMessage[]
  associations    LineChannelAssociation[]

  @@map("line_channels")
}
```

**頻道類型**：
- `GROUP` - 群組
- `ROOM` - 聊天室
- `USER` - 1:1 對話

**頻道狀態**（`status`）：
| 值 | 顯示 | 顏色 | 說明 |
|----|------|------|------|
| `CLEAR` | （不顯示） | — | 預設狀態，無待處理事件 |
| `OPEN` | 待處理 | 紅 | 有新訊息需關注 |
| `IN_PROGRESS` | 處理中 | 橘 | 有進行中的事件 |

- 建立事件時自動設為 `IN_PROGRESS`
- 所有事件結案後自動設回 `CLEAR`（同時清除頻道標籤）

### LineEvent（服務事件）

```prisma
model LineEvent {
  id             String    @id @default(cuid())
  title          String
  description    String?
  status         String    @default("NEW")      // NEW | IN_PROGRESS | RESOLVED | CLOSED
  priority       String    @default("NORMAL")   // P1 | P2 | NORMAL
  source         String    @default("manual")
  partnerId      String?
  projectId      String?
  assigneeId     String?
  slaResponseDue DateTime?
  slaResolveDue  DateTime?
  slaResponseAt  DateTime?
  slaBreached    Boolean   @default(false)
  resolvedAt     DateTime?
  resolvedBy     String?
  closedAt       DateTime?
  closedBy       String?
  createdBy      String
  createdAt      DateTime  @default(now())
  channels       LineEventChannel[]
  labels         LineEventLabel[]
  histories      LineEventHistory[]
}
```

**事件狀態機**：
```
NEW → IN_PROGRESS (assign/start)
NEW / IN_PROGRESS → RESOLVED (resolve + 發送回覆訊息到 LINE)
RESOLVED → CLOSED (close + 清除頻道標籤)
RESOLVED / CLOSED → IN_PROGRESS (reopen)
```

**標記解決（resolve）**：可輸入回覆訊息，自動 push 到所有關聯 LINE 頻道，並存入訊息記錄。

### LineEventHistory（事件歷史）

```prisma
model LineEventHistory {
  id         String   @id @default(cuid())
  eventId    String
  action     String   // assign | start | resolve | close | reopen
  fromStatus String?
  toStatus   String?
  note       String?  // 例如：解決回覆內容前 100 字
  byEmail    String
  createdAt  DateTime @default(now())
}
```

### LineChannelAssociation（頻道關聯）

```prisma
model LineChannelAssociation {
  id          String       @id @default(cuid())
  channelId   String
  customerId  String?
  supplierId  String?
  role        String       @default("CUSTOMER") // CUSTOMER, PARTNER
  createdAt   DateTime     @default(now())

  @@unique([channelId, customerId])
  @@unique([channelId, supplierId])
  @@map("line_channel_associations")
}
```

支援一對多關聯：一個頻道可以關聯多個客戶/供應商。

### LineMessage（LINE 訊息）

```prisma
model LineMessage {
  id              String      @id @default(cuid())
  lineMessageId   String      @unique              // LINE 訊息 ID
  channelId       String                           // 關聯 LineChannel
  lineUserId      String                           // 發送者 LINE userId
  messageType     String                           // text, image, file, sticker, video, audio, location
  content         String?     @db.Text             // 文字內容
  mediaUrl        String?                          // 媒體檔案 URL
  replyToken      String?                          // 回覆用 token（有效期短）
  quoteToken      String?                          // 此訊息的引用 token（供下一則訊息 quote 本訊息用）
  quotedMessageId String?                          // 被引用訊息的 lineMessageId（此訊息是對哪則訊息的 quote 回覆）
  timestamp       DateTime                         // LINE 訊息時間
  processed       Boolean     @default(false)      // 是否已由 LLM 處理
  createdAt       DateTime    @default(now())

  @@index([channelId, timestamp])
  @@index([processed])
  @@index([lineUserId])
  @@map("line_messages")
}
```

**欄位說明**：

| 欄位 | 類型 | 說明 |
|------|------|------|
| `id` | String | 系統內部 ID (cuid) |
| `lineMessageId` | String (unique) | LINE 提供的訊息 ID，或匯入時生成的 `imported_xxx` |
| `channelId` | String | 關聯的 LineChannel ID |
| `lineUserId` | String | 發送者的 LINE userId |
| `messageType` | String | 訊息類型：`text`, `image`, `file`, `sticker`, `video`, `audio`, `location` |
| `content` | Text (nullable) | 文字內容 |
| `mediaUrl` | String (nullable) | 媒體檔案 URL（圖片/影片等） |
| `replyToken` | String (nullable) | LINE 回覆用 token（15 分鐘有效） |
| `quoteToken` | String (nullable) | 此訊息的引用 token，供其他訊息 quote 本訊息時使用 |
| `quotedMessageId` | String (nullable) | 被引用訊息的 `lineMessageId`，代表此訊息是對哪則訊息的 quote 回覆 |
| `timestamp` | DateTime | 訊息發送時間 |
| `processed` | Boolean | 是否已由 LLM 處理（預設 false） |
| `createdAt` | DateTime | 資料庫寫入時間 |

---

## Webhook 即時接收

**檔案位置**：`src/app/api/line/webhook/route.ts`

### 流程

```
LINE Platform → POST /api/line/webhook (with X-Line-Signature header)
    ↓
1. 驗證簽章（HMAC-SHA256）
    ↓
2. 解析 LineWebhookEvent
    ↓
3. 依事件類型處理：
   ├─ message → handleMessageEvent()
   ├─ follow → ensureUser()
   ├─ join → ensureChannel()
   ├─ leave → 標記頻道為不活躍
   └─ memberJoined/memberLeft → (optional logging)
    ↓
4. 返回 200 OK
```

### 訊息處理流程

```
handleMessageEvent()
    ↓
1. 確保使用者存在 (ensureUser)
   - 查詢或建立 LineUser
   - 從 LINE API 取得使用者資料
    ↓
2. 確保頻道存在 (ensureChannel)
   - 查詢或建立 LineChannel
   - 從 LINE API 取得群組名稱
    ↓
3. 解析訊息內容 (parseMessageContent)
    ↓
4. 下載媒體檔案（若有）
   - 貼圖：使用 LINE CDN URL
   - 圖片：下載到 /public/uploads/line
    ↓
5. 儲存到 LineMessage（upsert 防重複）
   - 儲存 quoteToken（此訊息的引用 token）
   - 儲存 quotedMessageId（若此訊息是 quote 回覆）
    ↓
6. 更新頻道 lastMessageAt；若 RESOLVED 則重新開啟為 OPEN
    ↓
7. 若有 RESOLVED 事件關聯此頻道，重新開啟為 IN_PROGRESS 並通知負責人
    ↓
8. 送入 Unified Message Pipeline（非同步，LLM 處理）
    ↓
9. 發射事件 (lineEvents.emit) 通知前端
```

### 簽章驗證

```typescript
// src/lib/line.ts
export function verifySignature(body: string, signature: string, secret?: string): boolean {
  const channelSecret = secret || LINE_CHANNEL_SECRET
  const expectedSignature = crypto
    .createHmac('SHA256', channelSecret)
    .update(body)
    .digest('base64')

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  )
}
```

---

## 歷史資料匯入

**檔案位置**：
- API：`src/app/api/line/channels/[id]/import/route.ts`
- 解析器：`src/lib/line-import-parser.ts`

### 支援格式

LINE 導出的 TXT 檔案格式：

```
[LINE] 群組名稱的聊天記錄
儲存日期： 2025/01/01 12:00

2025/01/01（一）
上午10:41	人員名稱	訊息內容
下午02:57	另一人	[圖片]

2025/01/02（二）
上午09:30	人員名稱	多行訊息
第二行內容
```

### 匯入流程

```
POST /api/line/channels/{channelId}/import
Body: { content: "TXT 檔案內容", skipDuplicates: true }
    ↓
1. 正規化內容（移除 BOM、統一換行）
    ↓
2. parseLineChatExport(content)
   ├─ 解析標題 → 群組名稱
   ├─ 解析儲存日期
   ├─ 逐行解析訊息
   │   ├─ 識別日期行（YYYY/MM/DD）
   │   ├─ 識別訊息行（時間\t發送者\t內容）
   │   ├─ 處理多行訊息
   │   └─ 偵測訊息類型
   └─ 返回 ParsedChatHistory
    ↓
3. 為每個發送者建立 LineUser
   - 生成確定性 ID：generateImportedUserId()
    ↓
4. 查詢現有訊息 ID（若 skipDuplicates=true）
    ↓
5. 生成訊息 ID 和 LineMessage 物件
   - generateImportedMessageId()
    ↓
6. 批次寫入（100 筆/批）
    ↓
7. 更新頻道資訊（名稱、lastMessageAt）
    ↓
8. 返回匯入統計
   { totalMessages, importedMessages, skippedMessages, createdUsers }
```

### 訊息類型偵測

```typescript
// src/lib/line-import-parser.ts
function detectMessageType(content: string) {
  if (content === '[貼圖]') return { type: 'sticker', content: null }
  if (content === '[照片]' || content === '[圖片]') return { type: 'image', content: null }
  if (content === '[影片]') return { type: 'video', content: null }
  if (content === '[語音訊息]') return { type: 'audio', content: null }
  if (content === '[檔案]' || content.startsWith('[檔案]')) return { type: 'file', content: ... }
  if (content === '[位置資訊]' || content === '[地點]') return { type: 'location', content: null }
  if (content === '[已收回訊息]') return { type: 'unsent', content: null }
  return { type: 'text', content }
}
```

### 去重機制

**匯入訊息 ID 生成**（確定性 hash，支援重複匯入）：

```typescript
// 使用者 ID：基於群組名稱 + 顯示名稱
export function generateImportedUserId(displayName: string, groupName: string): string {
  const str = `imported_${groupName}_${displayName}`
  const hash = hashString(str)
  return `imported_${Math.abs(hash).toString(36)}`
}

// 訊息 ID：基於群組名稱 + 發送者 + 時間戳 + 內容 + 索引
export function generateImportedMessageId(
  groupName: string,
  senderName: string,
  timestamp: Date,
  content: string | null,
  index: number
): string {
  const str = `${groupName}_${senderName}_${timestamp.getTime()}_${content || ''}_${index}`
  const hash = hashString(str)
  return `imported_${Math.abs(hash).toString(36)}_${index}`
}
```

---

## 媒體檔案儲存

| 類型 | 來源 | 儲存方式 |
|------|------|----------|
| 貼圖 | Webhook | 使用 LINE CDN URL |
| 圖片 | Webhook | 下載到 `/public/uploads/line/{timestamp}.{ext}` |
| 影片/音訊/檔案 | Webhook | 存 mediaUrl |
| 匯入的媒體 | 歷史匯入 | 僅標記類型，無實際檔案 |

---

## 即時更新機制

**檔案位置**：
- 事件發射器：`src/lib/line-events.ts`
- SSE 端點：`src/app/api/line/events/route.ts`

### 事件發射器

```typescript
// src/lib/line-events.ts
class LineEventEmitter {
  private listeners: Set<Listener> = new Set()

  subscribe(listener: Listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emit(channelId: string) {
    this.listeners.forEach(listener => listener(channelId))
  }
}

export const lineEvents = new LineEventEmitter()
```

### SSE 端點

```
GET /api/line/events?channelId={id}
    ↓
1. 初始化：取得目前 lastMessageAt
    ↓
2. 輪詢檢查（每 2 秒）
   - 查詢頻道 lastMessageAt
   - 若有更新，發送 SSE 事件
    ↓
3. 心跳保持連接（每 30 秒）
```

---

## LINE API 客戶端

**檔案位置**：`src/lib/line.ts`

### 主要功能

```typescript
export function createLineClient(token?: string) {
  return {
    // 使用者資訊
    getUserProfile(userId: string): Promise<LineUserProfile>
    getGroupMemberProfile(groupId: string, userId: string): Promise<LineUserProfile>
    getRoomMemberProfile(roomId: string, userId: string): Promise<LineUserProfile>
    getUserProfileFromEvent(event: LineWebhookEvent): Promise<LineUserProfile | null>

    // 群組資訊
    getGroupSummary(groupId: string): Promise<LineGroupSummary>

    // 訊息發送
    replyMessage(replyToken: string, messages: Array<...>): Promise<void>
    pushMessage(to: string, messages: Array<...>): Promise<void>

    // 媒體
    getMessageContent(messageId: string): Promise<Buffer>

    // 群組管理
    leaveGroup(groupId: string): Promise<void>
    leaveRoom(roomId: string): Promise<void>

    // 工具函數
    getChannelIdFromEvent(event: LineWebhookEvent): string
    getChannelTypeFromEvent(event: LineWebhookEvent): 'GROUP' | 'ROOM' | 'USER'
  }
}
```

### API 基礎 URL

- `https://api.line.me/v2` - 一般 API
- 認證方式：Bearer Token（Authorization header）

---

## 訊息回覆（Quote）機制

### 原理

LINE 訊息回覆使用原生 `quoteToken` 實現 quote 氣泡效果。每則訊息有兩個相關欄位：

| 欄位 | 方向 | 說明 |
|------|------|------|
| `quoteToken` | 本訊息 → 未來訊息 | LINE 給每則訊息的 token，供其他人 quote 本訊息時使用 |
| `quotedMessageId` | 本訊息 → 過去訊息 | 記錄本訊息 quote 了哪則訊息（`lineMessageId`） |

### 流程

1. **收到訊息（Webhook）**：
   - 存入 `quoteToken`（此訊息日後可被引用）
   - 若有 `quotedMessageId`，也存入（代表此訊息是 quote 回覆）

2. **發送 quote 回覆**：
   - 前端送出 `quoteToken`（原訊息的 token）+ `quotedLineMessageId`（原訊息的 `lineMessageId`）
   - 後端呼叫 LINE API 時帶入 `quoteToken`，LINE 平台自動顯示 quote 氣泡
   - 儲存 `quotedMessageId`，供 web 端顯示引用訊息區塊

```typescript
// 發送端（messages/route.ts）
lineTextMessage = {
  type: 'text',
  text: message.trim(),
  ...(quoteToken ? { quoteToken } : {})
}
```

### Web 端顯示

API 回傳訊息時，若有 `quotedMessageId`，會批次查詢被引用訊息並附帶 `quotedMessage` 物件：
```json
{
  "quotedMessage": {
    "displayName": "王小明",
    "content": "請問明天幾點？",
    "messageType": "text",
    "mediaUrl": null
  }
}
```
前端在訊息 bubble 上方顯示綠色左邊框的引用區塊；圖片/貼圖類型顯示縮圖。

### Fallback 邏輯

無 `quoteToken` 的訊息（系統發出的訊息、匯入的歷史訊息）使用文字 `> ` 前綴：

```typescript
if (quotingMessage.quoteToken) {
  quoteToken = quotingMessage.quoteToken  // 原生 LINE quote 氣泡
} else {
  // 純文字 fallback
  const quotedLine = quotedContent.split('\n').map(l => `> ${l}`).join('\n')
  fullMessage = `${quotingMessage.displayName}：\n${quotedLine}\n\n${fullMessage}`
}
```

---

## 即時通知機制

### 瀏覽器音效通知

使用 Web Audio API（不需外部音效檔）：
- 新訊息到達時播放雙音調提示音（880Hz → 1100Hz，0.5 秒）
- 右上角 🔔/🔕 按鈕可靜音，設定存於 `localStorage`
- 僅對非目前開啟的頻道有新訊息時觸發

### 頻道清單新訊息標示

當有未讀新訊息的頻道：
- 左側橘色 4px 邊框
- 黃底背景
- 頻道名稱呈橘色粗體
- 「新訊息」橘色 Tag 標籤
- 訊息數量角標放大顯示（`dot` 模式）

---

## 事件管理歷史區

`/line-events` 頁面使用 Tabs 分頁：
- **進行中**：顯示 NEW / IN_PROGRESS / RESOLVED 以及結案未滿 72 小時的 CLOSED 事件
- **歷史**：顯示結案超過 72 小時的 CLOSED 事件，依結案時間倒序排列

API 參數：`GET /api/line/line-events?history=true`

---

## 頻道自動標注系統

### 架構概述

LINE 頻道支援標籤標注（追蹤、P1、P2、抱怨、已完成等），可手動管理或由 LLM 自動分析標注。

### 資料模型

```prisma
model LineChannelLabel {
  id          String      @id @default(cuid())
  channelId   String
  channel     LineChannel @relation(...)
  labelId     String      // 對應設定中的 label ID
  source      String      @default("manual") // "manual" | "llm"
  confidence  Float?      // LLM 信心度 0-1
  appliedBy   String?     // email 或 "system"
  appliedAt   DateTime    @default(now())
  note        String?
  @@unique([channelId, labelId])
  @@map("line_channel_labels")
}
```

### 標籤設定

存儲在 `SystemConfig` 表，key 為 `line_label_config`，JSON 格式包含：
- `labels[]`: 標籤定義（id, label, color, keywords, autoApply 等）
- `llmSettings`: LLM 設定（enabled, debounceSeconds, minMessages, autoApplyThreshold 等）

類型定義：`src/types/line-label.ts`

預設 5 個標籤：
| ID | 標籤 | 顏色 | 用途 |
|----|------|------|------|
| `follow_up` | 追蹤 | 藍 | 需要後續追蹤 |
| `p1` | P1 故障 | 紅 | 高優先級故障 |
| `p2` | P2 問題 | 橘 | 中優先級問題 |
| `complaint` | 抱怨 | 粉 | 客戶不滿 |
| `resolved` | 已完成 | 綠 | 已解決 |

### LLM 自動標注流程

```
LINE 訊息進入 → message-pipeline 處理完畢
    ↓
呼叫 enqueueLabelAnalysis(channelId)
    ↓
BullMQ 加入 job（delay 120 秒 debounce）
    ↓
label-analysis worker 執行 analyzeChannelLabels()
    ↓
1. 載入標籤設定（帶 1 分鐘快取）
2. 取分析窗口內的文字訊息
3. 訊息數 < minMessages → 跳過
4. 載入現有標籤（保護手動標籤）
5. 呼叫 OpenAI GPT → JSON 回應 { add: [...], remove: [...] }
6. confidence >= threshold 且 autoApply=true → 自動套用
7. 手動標籤不會被 LLM 覆蓋或移除
```

### 手動標籤管理

```
PUT /api/line/channels/{id}/labels
Body: { action: "add" | "remove", labelId: "p1", note?: "..." }
```

- `source` 設為 `"manual"`
- 新增 `follow_up` 標籤會同步更新舊版 `needsFollowUp` 欄位
- 移除也會同步清除舊版追蹤欄位

### UI 功能

- **頻道列表**：每個頻道名稱下方顯示彩色 Tag 標籤（LLM 標籤用虛線邊框）
- **標籤篩選**：TagsOutlined 按鈕展開 Popover 多標籤篩選
- **聊天標頭**：TagsOutlined 按鈕展開標籤管理 Popover（顯示現有標籤 + 可新增/移除）
- **設定頁面**：`/settings/line/labels` 管理標籤定義和 LLM 設定

### Worker 啟動

在 `src/workers/message-pipeline-worker.ts` 中同時啟動：
- `startMessagePipelineWorker()` — 訊息處理 (concurrency: 5)
- `startLabelAnalysisWorker()` — 標籤分析 (concurrency: 2)

---

## 核心檔案位置

| 功能 | 檔案路徑 |
|------|---------|
| 資料庫 Schema | `prisma/schema.prisma` |
| Webhook 接收 | `src/app/api/line/webhook/route.ts` |
| TXT 解析器 | `src/lib/line-import-parser.ts` |
| 歷史匯入 API | `src/app/api/line/channels/[id]/import/route.ts` |
| LINE 客戶端 | `src/lib/line.ts` |
| 事件發射器 | `src/lib/line-events.ts` |
| 頻道管理 API | `src/app/api/line/channels/route.ts` |
| 頻道詳情 API | `src/app/api/line/channels/[id]/route.ts` |
| 訊息發送 API | `src/app/api/line/channels/[id]/messages/route.ts` |
| 頻道關聯 API | `src/app/api/line/channels/[id]/associations/route.ts` |
| 頻道標籤 API | `src/app/api/line/channels/[id]/labels/route.ts` |
| 使用者管理 API | `src/app/api/line/users/route.ts` |
| 使用者詳情 API | `src/app/api/line/users/[id]/route.ts` |
| 即時更新 API | `src/app/api/line/events/route.ts` |
| LLM 摘要 API | `src/app/api/line/channels/[id]/summary/route.ts` |
| 標籤類型定義 | `src/types/line-label.ts` |
| 標籤分析器 | `src/lib/line-label-analyzer.ts` |
| 標籤設定 API | `src/app/api/settings/line-labels/route.ts` |
| 標籤設定頁面 | `src/app/settings/line/labels/page.tsx` |
| 訊息管線 | `src/lib/message-pipeline.ts` |
| 管線 Worker | `src/workers/message-pipeline-worker.ts` |
| 事件列表 API | `src/app/api/line/line-events/route.ts` |
| 事件狀態 API | `src/app/api/line/line-events/[eid]/status/route.ts` |
| 事件歷史 API | `src/app/api/line/line-events/[eid]/history/route.ts` |
| 事件管理頁面 | `src/app/line-events/page.tsx` |
| 頻道收件匣 | `src/app/line-inbox/page.tsx` |
| 事件 SLA 計算 | `src/lib/line-event-sla.ts` |
| 事件通知 | `src/lib/line-event-notifier.ts` |
