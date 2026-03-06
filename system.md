# 客戶活動中台系統 (Customer Account Management Platform)

## 系統概述

這是一個整合式的 **客戶活動中台系統**，使用 Next.js 16 + React 18 + TypeScript 建構。系統整合了多個外部服務（Jira、Odoo、Slack、LINE、Gmail），讓 Sales / IT / RD / PM 團隊能在同一個介面中完整掌握客戶狀態。

### 技術堆疊
- **前端**: Next.js 16, React 18, TypeScript, Ant Design 6.1, TailwindCSS
- **後端**: Next.js API Routes, Node.js
- **資料庫**: PostgreSQL (主要), Odoo (外部 ERP)
- **ORM**: Prisma 5.22
- **知識圖譜**: Neo4j (via Graphiti service)
- **向量資料庫**: pgvector (RAG 搜尋)
- **外部整合**: Jira API, Slack API, LINE Messaging API, Gmail IMAP, Odoo DB

---

## 1) 產品定位與目標

### 目標

讓 Sales / IT / RD / PM 在同一個客戶頁面，能立即回答：
- 這個客戶最近發生什麼事？（Timeline）
- 現在有哪些未解決問題？卡在哪？誰要接？（Open Items）
- 合約何時到期？需要續約提醒嗎？（Deals/Contracts）
- 客戶相關的技術知識在哪？（Technical Notes）
- 我在外面（手機）也能快速補最新資訊，並能一鍵回寫到 Jira（comment / Next action）

### 系統分工
- **Jira** = Issue 真相來源（source of truth）：狀態、優先級、指派、comment、workflow
- **本系統** = 客戶視角整合層：集中活動、顯示 Open Items 快照、提供快速輸入與回寫捷徑
- **Odoo** = ERP 資料來源：客戶清單、成交資料、訂單、報價單
- **Slack/LINE/Gmail** = 對話來源：自動彙整到活動時間軸
- **Graphiti (Neo4j)** = 知識圖譜：RAG 問答、跨對話搜尋

⸻

2) 單一客戶頁面（Account Page）資訊架構

此頁至少兩大區塊（可做成 tab 或上下區塊）：
	1.	Activity Timeline（活動時間軸）
	2.	Open Items（未解決問題，主要來自 Jira）

Timeline 看全貌，Open Items 看「現在要處理什麼」。

⸻

3) Activity Timeline（你們系統的核心功能之一）

Timeline 要包含的事件來源（統一成 Activity）
	•	手動輸入（業務現場紀錄、會議紀要）
	•	訪談逐字稿（錄音轉文字後的摘要/重點）
	•	LINE 訊息摘要（未來接入）
	•	Email 摘要（未來接入）
	•	文件/附件連結（未來接入）
	•	Jira 事件（工單建立、狀態變更、指派變更、留言等 → 轉成 Timeline 事件）

Timeline 每筆 Activity 建議顯示
	•	來源（JIRA / MANUAL / MEETING / LINE / EMAIL / DOC…）
	•	標題/摘要（1~2 行）
	•	標籤（#報修 #需求 #待回覆…）
	•	附件/連結
	•	建立人、時間
-（可選）關聯 Jira key（例如 ABC-123）

⸻

4) Open Items（桌機表格 + 手機友善）

你們偏好 表格呈現，但必須兼顧手機使用（業務在外）。

4.1 桌機版 Open Items 表格：建議欄位

（由左到右，Designer 可依寬度做隱藏策略）
	1.	Key（ABC-123，可點開 Jira）
	2.	Summary（標題，單行省略）
	3.	Status（badge）
	4.	Priority
	5.	Assignee
	6.	Waiting on（等待誰：部門） ✅
	7.	Next action（下一步） ✅
	8.	Due（到期日）（建議）
	9.	Updated（最後更新 + 距今）
	10.	Last reply（最後回覆摘要） ✅
	11.	Actions（回覆/展開/Jira）

列展開（row expansion / detail panel）

點「展開」在同一列下方顯示：
	•	最近 3 則 Jira comment 摘要（作者/時間/片段；可點開全文）
	•	一個「新增回覆」輸入框（送出即回寫 Jira comment）
	•	相關 Timeline 片段（例如 LINE/Email 最新摘要連結）

4.2 手機版 Open Items：改成「卡片列」呈現（同資料、不同視覺）

避免表格橫向捲動。建議每張卡片：
	•	第一行：Key + Status badge
	•	第二行：Summary（最多 2 行）
	•	Meta 行：Priority · Assignee · Waiting on · Updated(距今)（挑最重要的放）
	•	Next action：顯示前 30~40 字
	•	Last reply snippet：作者 + 前 30~40 字（建議保留）
	•	快捷按鈕：回覆、更多

「更多」用 Bottom Sheet（手機最順）

Bottom Sheet 內容：
	•	最近 comment（可滑）
	•	編輯 Waiting on / Next action / Due
	•	Open in Jira、複製 key
	•	相關 Timeline 片段

⸻

5) Open Items 必備功能：快速更新到 Jira

5.1 業務收到客戶處理辦法回應時，如何簡單更新 Jira

在 Open Item 上提供按鈕：
	•	「新增客戶回覆 → 同步到 Jira」

行為：
	•	在你們系統 Timeline 留一筆 Activity（保留脈絡）
	•	同時 寫入 Jira comment（最簡單、最符合 Jira Software 的做法）

（可選）同時提供：
	•	勾選「同步狀態」（若你們允許業務改狀態）
	•	附件：可先上傳你們系統並貼連結；或第二階段再做 Jira 附件上傳

⸻

6) Waiting on / Next action（需求已確認「需要」）

使用者要求 Open Items 必須有：
	•	Waiting on（等待誰）：用「部門」分類 ✅
	•	Next action（下一步）：一句話摘要 ✅
-（建議）Due：到期日（排序/追蹤很有用）

6.1 Waiting on（部門）字典建議（單選）
	•	Customer（客戶）
	•	Sales（業務）
	•	IT（IT/客服/維運）
	•	RD（研發）
	•	PM（產品/專案）
	•	Partner（經銷商/第三方，可選但建議保留）

6.2 Next action 填寫規範（UX 提示）
	•	80 字以內
	•	格式建議：動詞 + 對象 + 交付物
例：請客戶提供 log（WAN 介面，24hr）、RD 確認 2.3.1 是否已修、IT 安排遠端 12/19 14:00

6.3 資料真相來源建議
	•	最推薦：Jira 自訂欄位（Waiting on / Next action / Due），你們系統做顯示與 inline edit → 回寫 Jira，避免兩邊不一致。

⸻

7) 桌機/手機的篩選與排序（兩端都要有）

建議在 Open Items 上方提供：
	•	Filter：狀態（Open / In Progress）、Waiting on（部門）、只看我負責、Priority
	•	Sort：Due 最早、最久未更新、Priority 最高、最新回覆

⸻

8) Designer 需要產出的 UI/UX 交付物建議

請 Designer 至少出：
	1.	客戶頁 IA：Timeline 與 Open Items 的佈局（tab / split view / 上下）
	2.	Open Items 桌機表格：欄位、展開列、inline edit、操作入口
	3.	Open Items 手機列表卡片：卡片資訊層級、bottom sheet 內容、快捷操作
	4.	新增回覆（回寫 Jira comment）流程：桌機（展開列內）/手機（bottom sheet）
	5.	Waiting on / Next action / Due 的編輯流程：桌機 inline / 手機 bottom sheet
	6.	主要狀態（空狀態、loading、錯誤、無權限）樣式

⸻

下面我把內容再「收斂成一頁式 UI 規格表」，你可以直接貼給 designer（也方便跟工程師對齊）。

⸻

單一客戶頁 Account Page：UI/UX 一頁規格

A. 頁面目標

在同一頁完成：
	•	看全貌：Timeline（所有活動）
	•	看待辦：Open Items（Jira issues）
	•	快速補資訊：新增回覆/下一步/等待誰 → 回寫 Jira

⸻

1) 資訊架構與版型

桌機（Desktop）
	•	頁首：客戶基本資訊（客戶名、主要窗口、負責業務、快速新增）
	•	主體：Tabs（建議）
	•	Tab 1：Overview（Open Items + Timeline 摘要）
	•	Tab 2：Open Items（全表格）
	•	Tab 3：Timeline（全時間軸）

若不做 tabs，也可「上 Open Items、下 Timeline」；但資訊會偏長。

手機（Mobile）
	•	頁首縮短（客戶名 + 2 個主要按鈕）
	•	Tabs 仍保留（Open Items / Timeline）
	•	Open Items 用卡片列（禁止橫向捲動表格）

⸻

2) Open Items（Jira issues）— 欄位與互動

2.1 桌機：表格欄位定義

欄位	重要性	顯示規格	互動
Key	必要	ABC-123	點開 Jira / 複製
Summary	必要	1 行省略	點擊可開展開列或詳情抽屜
Status	必要	badge	可篩選
Priority	建議	P0/P1…	可排序
Assignee	必要	人名/頭像可選	可篩選「只看我負責」
Waiting on（部門）	必要	badge（短字）	inline edit（下拉）→ 回寫 Jira
Next action	必要	1 行省略	inline edit（文字）→ 回寫 Jira
Due	強烈建議	日期/逾期提示	inline edit（日期）→ 回寫 Jira
Updated	必要	2h / 3d	可排序（最久未更新）
Last reply	必要	作者+時間+片段	點擊展開看留言
Actions	必要	回覆 / 展開 / Jira	主動作放「回覆」

2.2 展開列（Row Expansion）內容
	•	最近 3 則 Jira comment（作者/時間/摘要；可「看全文」）
	•	新增回覆輸入框（送出 → 寫 Jira comment + 你們系統 Timeline 記錄）
	•	關聯 Timeline 片段（例：LINE/Email 的最近摘要，點開可看全文）

2.3 手機：卡片列（同資料、不同呈現）

每張卡片建議內容：
	•	第 1 行：Key + Status
	•	第 2 行：Summary（最多 2 行）
	•	Meta：Priority · Assignee · Waiting on · Updated
	•	Next action（前 30–40 字）
	•	Last reply snippet（前 30–40 字）
	•	快捷按鈕：回覆、更多

「更多」→ Bottom Sheet：
	•	最近留言列表（可滑）
	•	編輯 Waiting on / Next action / Due（一次儲存）
	•	Open in Jira / 複製 key

⸻

3) Waiting on / Next action（部門版）

Waiting on（單選字典）
	•	Customer（客戶）
	•	Sales（業務）
	•	IT（IT/維運/客服）
	•	RD（研發）
	•	PM（產品/專案）
	•	Partner（經銷商/第三方）

Next action（文字規範）
	•	80 字內，一句話：「動詞 + 對象 + 交付物」
	•	避免用語：處理中 / 再看看

Due（日期）
	•	允許空值，但 UI 要能排序「有 Due 的先處理」
	•	逾期提示（icon 或紅字即可）

⸻

4) 「快速更新到 Jira」流程（業務在外最重要）

動作：新增客戶回覆（回寫 Jira comment）

入口：
	•	桌機：Actions「回覆」或展開列內輸入框
	•	手機：卡片「回覆」→ Bottom Sheet 輸入

表單（MVP）：
	•	回覆內容（必填）
	•	回覆來源（電話/LINE/Email/現場，選填）
-（選填）同時更新 Waiting on / Next action / Due（手機尤其適合一次填完）

送出後：
	•	寫 Jira comment
	•	同步更新 Open Items 這列的 Last reply / Updated
	•	在 Timeline 生成一筆 Activity（留痕）

⸻

5) Open Items 的篩選與排序（桌機/手機共用）

Filters（工具列）：
	•	狀態（Open / In Progress）
	•	Waiting on（部門）
	•	只看我負責
	•	Priority（P0/P1）

Sort：
	•	Due 最早
	•	最久未更新
	•	Priority 最高
	•	最新回覆

⸻

6) Timeline（活動時間軸）— UI 要點

每筆 Activity 卡片：
	•	來源（Jira/Manual/Meeting/LINE/Email/Doc）
	•	標題/摘要（1–2 行）
	•	標籤
	•	建立人、時間
	•	關聯 Jira key（若有）
	•	附件/連結（若有）

（可選）Timeline 篩選：
	•	只看 Jira / 只看 LINE / 本週 / 標籤

⸻

7) 狀態設計（designer 必出）
	•	空狀態：無 open items / 無 timeline
	•	Loading：表格 skeleton、卡片 skeleton
	•	Error：Jira 讀取失敗（提供重試）
	•	權限不足：顯示「無權限查看 Jira 詳細」但仍可看基本欄位（若允許）

⸻

8) 系統啟動程序

### 環境需求
- Node.js (建議 18+)
- PostgreSQL 資料庫
- 可連接 Jira API（需設定相關環境變數）
- 可連接 Odoo 資料庫（選用，用於同步歷史資料）

### 啟動步驟

#### 1. 安裝依賴
```bash
npm install
```

#### 2. 設定環境變數
建立 `.env.local` 文件，包含以下設定：
```bash
# 資料庫連線
DATABASE_URL="postgresql://user:password@localhost:5432/client_web"

# NextAuth 設定
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key

# Google OAuth（登入用）
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Jira API（Open Items 同步）
JIRA_HOST=https://your-jira.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your-jira-api-token
# 支援多個 Project，用逗號分隔
JIRA_PROJECT_KEYS=CW,PROJ2,PROJ3
# 或使用單一 Project（向下相容）
# JIRA_PROJECT_KEY=CW

# Odoo 資料庫（選用，歷史資料同步）
ODOO_DB_HOST=192.168.x.x
ODOO_DB_PORT=5432
ODOO_DB_NAME=odoo
ODOO_DB_USER=readonly_user
ODOO_DB_PASSWORD=your-password
ODOO_WEB_URL=https://your-odoo.com  # Odoo Web URL（訂單連結用）

# Slack API
SLACK_BOT_TOKEN=xoxp-xxx-xxx-xxx-xxx

# LINE Messaging API
LINE_CHANNEL_ID=your-channel-id
LINE_CHANNEL_SECRET=your-channel-secret
LINE_CHANNEL_ACCESS_TOKEN=your-access-token

# Gmail IMAP（App Password）
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=your-app-password

# Graphiti 知識圖譜服務
GRAPHITI_URL=http://localhost:8003

# Neo4j（Graphiti 後端）
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-password

# vLLM 服務（LLM 處理）
VLLM_BASE_URL=http://192.168.x.x:8000
VLLM_MODEL=/models/your-model

# OpenRouter（備用 LLM）
OPENROUTER_API_KEY=your-openrouter-key

# 檔案存儲路徑
STORAGE_PATH=/path/to/storage
```

#### 3. 初始化資料庫
```bash
# 同步 Prisma schema 到資料庫
DATABASE_URL="postgresql://chunwencheng:chunwencheng@localhost:5432/client_web" npx prisma db push

# 產生 Prisma Client
DATABASE_URL="postgresql://chunwencheng:chunwencheng@localhost:5432/client_web" npx prisma generate
```

#### 4. 啟動開發伺服器
```bash
npm run dev
```
開發伺服器將在 http://localhost:3000 啟動

#### 5. 生產環境部署
```bash
# 建置
npm run build

# 啟動
npm run start
```

### 常用指令
| 指令 | 說明 |
|------|------|
| `npm run dev` | 啟動開發伺服器 |
| `npm run build` | 建置生產版本 |
| `npm run start` | 啟動生產伺服器 |
| `npm run lint` | 執行程式碼檢查 |
| `npx prisma studio` | 開啟資料庫 GUI 管理工具 |
| `npx prisma db push` | 同步 schema 到資料庫 |
| `npx prisma generate` | 產生 Prisma Client |
| `npx prisma migrate dev` | 執行開發環境 migration |

### 背景服務（使用 PM2）
```bash
# 啟動所有服務
pm2 start ecosystem.config.js

# 查看服務狀態
pm2 status

# 查看 logs
pm2 logs

# 重啟服務
pm2 restart all
```

### 故障排除

#### Prisma Client 錯誤
如果遇到 Prisma 相關錯誤，嘗試重新產生 Client：
```bash
rm -rf node_modules/.prisma
DATABASE_URL="postgresql://chunwencheng:chunwencheng@localhost:5432/client_web" npx prisma generate
```

#### 資料庫連線問題
確認 PostgreSQL 服務已啟動，並檢查連線資訊是否正確：
```bash
PGPASSWORD=chunwencheng psql -h localhost -U chunwencheng -d client_web -c "\dt"
```

⸻

9) 開發日誌

### 2025-12-19 更新內容：

**Slack 對話彙整功能**
- 整合 Slack API，可從客戶專屬頻道彙整對話內容
- 使用本地 vLLM (gpt-oss-120b) 進行對話分析
- LLM 自動將對話分為兩大類事件：
  - `業務/客戶類`：客戶需求、拜訪會議、報價合約等
  - `技術討論類`：工程師解決方案、技術分析、系統設定等
- 每個事件自動標註類別標籤，彙整結果顯示類別統計
- 預設彙整 30 天內的對話記錄

**活動時間軸功能增強**
- 新增「預計日期」(eventDate) 欄位，支援記錄未來事件
- 活動排序規則：今天及未來的預計日期在前，其餘按建立時間排序
- 未來事件顏色提醒：
  - 今日事件：紅色左邊框 + 淡紅背景
  - 未來事件：藍色左邊框 + 淡藍背景
  - 已過事件：一般樣式
- 新增活動編輯功能（所有使用者可編輯標題、內容、標籤、預計日期）
- 新增活動刪除功能（僅管理員可刪除）

**Jira 附件下載功能**
- BottomSheet 現在會顯示 Jira Issue 的附件
- 圖片附件：縮圖預覽 + 點擊放大 + 下載按鈕
- 其他檔案：顯示檔名、大小、作者 + 下載按鈕
- 透過代理 API 下載，處理 Jira 認證

**UI 修復**
- 修復 Dropdown 下拉選單偶爾無法展開的問題（改用 click 觸發）
- 修復 Ant Design List 組件棄用警告（DealsCard 改用自定義佈局）

**新增 API 端點**
- `PUT /api/activities` - 更新活動
- `DELETE /api/activities` - 刪除活動（需管理員權限）
- `GET /api/jira/issues/[key]/attachments` - 取得 Jira Issue 附件列表
- `GET /api/jira/attachments/[id]` - 下載 Jira 附件

**環境變數新增**
- `SLACK_BOT_TOKEN` - Slack Bot Token
- `VLLM_BASE_URL` - vLLM 服務位址
- `VLLM_MODEL` - vLLM 模型路徑

---

### 2024-12-19 更新內容：

**客戶列表功能增強**
- 客戶列表「訂單數」欄位現在只計算未過期的訂單（排除 endDate < 今天的訂單）
- 支援依「待處理」和「訂單數」排序
- Per-user 查看排序：每個使用者看到的客戶列表會優先顯示自己最近/最常查看的客戶

**Odoo 訂單連結**
- 成交紀錄/合約中，來自 Odoo 同步的訂單會顯示紫色連結圖示
- 點擊可直接開啟 Odoo 對應的訂單頁面
- 只有具有「查看交易金額」權限的使用者可見

**客戶查詢統計報表增強** (`/reports/customer-views`)
- 新增時間區間選擇器（今天、最近7/30/90天、本月、上月）
- 「使用者活動」tab 支援展開查看每個使用者查詢過的客戶詳情
- 顯示每個客戶的查詢次數和最後查詢時間

**客戶母公司設定**
- 客戶詳情頁「編輯」功能新增「母公司」欄位
- 可選擇任何其他客戶作為母公司（自動排除自己和子公司）
- 客戶列表和詳情頁會顯示母子公司關係標籤

**UI 修復**
- 修復 Ant Design List 組件棄用警告（改用自定義 div 佈局）
- 修復 Alert 組件 `message` 屬性棄用警告（改用 `title`）
- 修復 Statistic 組件 `valueStyle` 棄用警告（改用 `styles.content`）
- 修復側邊欄點擊父選單項目（設定、報表）導致 404 的問題

**技術修復**
- 清除舊的 Prisma 快取，修復 `viewCount` 欄位不存在的錯誤
- 更新 Deal 類型定義，`odooId` 從 `string` 改為 `number`

---

### 2025-12-19 更新內容（續）：

**設定頁面架構重整**
- 將原本的單一設定頁面拆分為獨立子頁面：
  - `/settings/odoo` - Odoo 資料同步（客戶、成交、員工）
  - `/settings/file-storage` - 檔案存儲設定（存放路徑配置）
  - `/settings/slack` - Slack 整合設定
  - `/settings/llm` - LLM 設定（新增）
  - `/settings/line` - LINE 整合設定
  - `/settings/gmail` - Gmail IMAP 設定
- 側邊欄「設定」選單改為展開式子選單

**共用 LLM 設定功能** (`/settings/llm`)
- 新增獨立的 LLM 設定頁面，供所有功能共用（Slack 分類、對話彙整等）
- 支援 Primary / Secondary LLM 雙備援架構
- 支援三種 LLM 提供者：
  - vLLM（自架）- 預設使用本地 vLLM 服務
  - OpenRouter - 支援多種模型（Claude、GPT 等）
  - OpenAI - 直接使用 OpenAI API
- 每個 LLM 可設定：API 位址、模型名稱、API Key
- 提供連線測試功能，驗證 LLM 服務是否可用
- 通用參數：預設 Temperature、Max Tokens
- 自動備援：Primary 失敗時可自動切換到 Secondary

**Slack 訊息 LLM 分類功能增強**
- 批次模式新增「依日期分組」選項：
  - `count` 模式：依訊息數量切分（原有）
  - `date` 模式：同一天的訊息一起分析，保持對話完整性
- LLM 設定移至共用頁面，Slack 分類頁面簡化為：
  - 是否啟用 LLM 分類
  - 批次模式選擇
  - LLM 失敗時是否回退到關鍵字分類

**新增 API 端點**
- `GET /api/settings/llm` - 取得 LLM 設定（隱藏 API Key）
- `PUT /api/settings/llm` - 更新 LLM 設定
- `POST /api/settings/llm` - 測試 LLM 連線

**新增類型定義** (`/src/types/llm.ts`)
```typescript
interface LLMProviderConfig {
  type: 'vllm' | 'openrouter' | 'openai'
  baseUrl: string
  model: string
  apiKey?: string
}

interface LLMConfig {
  primary: LLMProviderConfig
  secondary?: LLMProviderConfig
  useSecondaryOnFailure: boolean
  defaultTemperature: number
  defaultMaxTokens: number
}
```

---

### 2025-02-17 系統架構更新：

## 核心功能模組

### A) Partner 統一模型
系統已將 Customer、Supplier、Partner 整合為統一的 `Partner` 模型：
- 支援多種角色：`CUSTOMER`、`SUPPLIER`、`PARTNER`
- 支援母子公司關係（parentId）
- 整合欄位：Jira labels、Odoo ID、Slack channel

### B) 專案管理 (Projects)
- 從 Deal 建立專案
- 專案狀態追蹤：`ACTIVE`、`COMPLETED`、`ON_HOLD`、`CANCELLED`
- 關聯終端用戶和供應商
- 專案活動追蹤
- 專案獎金評估與分潤計算（詳見 [project_credit.md](./project_credit.md)）

### C) 報價單系統 (Quotations)
- 獨立報價單編號（YYMMDD[A-Z] 格式）
- 報價明細：產品、數量、單價、折扣
- 狀態追蹤：`DRAFT`、`SENT`、`APPROVED`、`REJECTED`、`CONVERTED`
- PDF 生成與 Email 發送
- 同步到 Odoo

### D) 檔案管理 (Files)
- 按客戶/年份組織檔案
- 支援手動上傳與 Jira 附件同步
- 檔案類型：UPLOAD、JIRA_ATTACHMENT
- 軟刪除支援

### E) 技術知識庫 (Technical Notes)
- 從 Slack 頻道擷取技術討論
- 類別分類：technical、maintenance、security、speedtest
- 關鍵字與參與者追蹤
- 連結原始 Slack 頻道

### F) LINE 整合
- Webhook 接收 LINE Official Account 訊息
- 支援 GROUP、ROOM、USER（1:1）對話
- LINE 用戶 profile 管理
- 頻道與 Partner 關聯
- 訊息處理狀態追蹤

### G) Gmail 整合
- IMAP App Password 認證
- 收件匣訊息同步
- 附件擷取
- 同步到知識圖譜

### H) 知識圖譜 & RAG (Graphiti)
- Neo4j 知識圖譜後端
- 從 Slack/LINE/Email/Activity 彙整訊息
- pgvector 向量搜尋
- RAG Q&A 功能（附來源引用）
- 上下文對話

---

## API 端點總覽

### 核心 API
| 路徑 | 說明 |
|------|------|
| `/api/customers/` | 客戶 CRUD |
| `/api/partners/` | Partner（統一模型）CRUD |
| `/api/open-items/` | Jira issues 同步與管理 |
| `/api/activities/` | 活動時間軸 CRUD |
| `/api/deals/` | 成交/合約管理 |
| `/api/quotations/` | 報價單管理 |
| `/api/projects/[id]/bonus-eval` | 專案獎金評估 CRUD / 核准 / 退回草稿 |
| `/api/projects/[id]/odoo-costs` | Odoo 出貨成本匯入 |

### 整合 API
| 路徑 | 說明 |
|------|------|
| `/api/jira/issues` | 搜尋 Jira issues |
| `/api/jira/issues/[key]/attachments` | 取得 issue 附件 |
| `/api/jira/attachments/[id]` | 下載 Jira 附件 |
| `/api/slack/` | Slack 事件處理 |
| `/api/line/` | LINE Webhook |
| `/api/graphiti/` | 知識圖譜搜尋/彙整 |

### 設定 API
| 路徑 | 說明 |
|------|------|
| `/api/settings/odoo` | Odoo 同步設定 |
| `/api/settings/llm` | LLM 設定 |
| `/api/settings/slack` | Slack 設定 |
| `/api/admin/users` | 使用者管理 |

### 報表 API
| 路徑 | 說明 |
|------|------|
| `/api/reports/issues` | 待處理/逾期 issues 報表 |
| `/api/reports/customer-views` | 客戶查詢統計 |
| `/api/reports/bonus` | 年度專案獎金報表 |
| `/api/dashboard/` | Dashboard 快取統計 |

---

## 資料模型（Prisma Schema 摘要）

### Partner（統一客戶/供應商/經銷商模型）
```prisma
model Partner {
  id            String    @id @default(uuid())
  name          String
  roles         String[]  @default(["CUSTOMER"]) // CUSTOMER, SUPPLIER, PARTNER
  parentId      String?   // 母公司
  jiraLabels    String[]
  odooPartnerId Int?
  slackChannel  String?
  // ... 其他欄位
}
```

### Activity（活動時間軸）
```prisma
model Activity {
  id          String    @id @default(uuid())
  source      String    // JIRA, MANUAL, MEETING, LINE, EMAIL, DOC, PHONE, SLACK, ERP
  title       String
  content     String?
  tags        String[]
  attachments String[]
  jiraKey     String?
  eventDate   DateTime? // 預計日期（支援未來事件）
  partnerId   String
  projectId   String?
  createdBy   String
}
```

### OpenItem（Jira Issue 本地快照）
```prisma
model OpenItem {
  id              String    @id @default(uuid())
  jiraKey         String    @unique
  summary         String
  status          String
  priority        String?
  assignee        String?
  waitingOn       String?   // Customer, Sales, IT, RD, PM, Partner
  nextAction      String?
  dueDate         DateTime?
  lastReply       String?
  lastReplyAuthor String?
  lastReplyDate   DateTime?
  partnerId       String
}
```

### Deal（成交/合約）
```prisma
model Deal {
  id          String    @id @default(uuid())
  type        String    // PURCHASE, MA, LICENSE, SUBSCRIPTION
  title       String
  amount      Decimal?
  products    Json?
  startDate   DateTime?
  endDate     DateTime?
  autoRenew   Boolean   @default(false)
  remindDays  Int       @default(30)
  source      String    @default("MANUAL") // MANUAL, ODOO
  odooId      Int?
  partnerId   String
}
```

### Quotation（報價單）
```prisma
model Quotation {
  id              String    @id @default(uuid())
  quotationNumber String    @unique
  status          String    @default("DRAFT")
  items           Json
  subtotal        Decimal
  discount        Decimal?
  total           Decimal
  partnerId       String
  createdBy       String
}
```

### LINE 相關
```prisma
model LineChannel {
  id        String   @id @default(uuid())
  channelId String   @unique
  type      String   // GROUP, ROOM, USER
  name      String?
  partnerId String?
}

model LineMessage {
  id        String   @id @default(uuid())
  messageId String   @unique
  channelId String
  userId    String
  type      String
  text      String?
  timestamp DateTime
  processed Boolean  @default(false)
}
```

### DocumentChunk（RAG 向量搜尋）
```prisma
model DocumentChunk {
  id        String   @id @default(uuid())
  content   String
  embedding Unsupported("vector")?
  source    String   // LINE, EMAIL, FILE, ACTIVITY
  sourceId  String
  metadata  Json?
}
```

---

## 頁面路由

### 主要頁面
| 路徑 | 說明 |
|------|------|
| `/` | 首頁/Dashboard |
| `/customers` | 客戶列表 |
| `/customers/[id]` | 客戶詳情頁 |
| `/quotations` | 報價單列表 |
| `/quotations/[id]` | 報價單詳情 |
| `/chat` | RAG 問答聊天 |
| `/knowledge` | 知識庫管理 |

### 報表頁面
| 路徑 | 說明 |
|------|------|
| `/reports/issues` | 待處理 Issues 報表 |
| `/reports/customer-views` | 客戶查詢統計 |
| `/reports/sales` | 銷售報表 |
| `/reports/bonus` | 專案獎金報表 |

### 設定頁面
| 路徑 | 說明 |
|------|------|
| `/settings/odoo` | Odoo 同步設定 |
| `/settings/file-storage` | 檔案存儲設定 |
| `/settings/slack` | Slack 整合 |
| `/settings/llm` | LLM 設定 |
| `/settings/line` | LINE 整合 |
| `/settings/gmail` | Gmail IMAP 設定 |

### 管理頁面
| 路徑 | 說明 |
|------|------|
| `/admin/users` | 使用者管理 |

---

## 元件結構

### Layout
- `AppLayout` - 主要佈局
- `Sidebar` - 側邊導航（角色感知）
- `Header` - 頂部列
- `MobileNav` - 手機導航

### 客戶頁面元件
- `CustomerHeader` - 客戶資訊 + 快速操作
- `ActivityTimeline` - 活動時間軸
- `ActivityCard` - 單一活動卡片
- `OpenItemsTable` / `OpenItemsCard` - Issues 表格/卡片
- `DealsCard` - 合約追蹤
- `ProjectsCard` - 專案列表
- `TechnicalNotesCard` - 技術知識庫
- `CustomerFileBrowser` - 檔案管理

### Modal 元件
- `AddActivityModal` - 新增活動
- `AddIssueModal` - 建立 Jira Issue
- `AddDealModal` - 新增成交
- `ReplyModal` - 回覆 Issue
- `BottomSheet` - 手機詳情面板
- `SmartQuotationModal` - LLM 輔助報價
- `QuotationEmailModal` - 報價單 Email
- `QuotationPDFPreview` - PDF 預覽
- `BonusEvalModal` - 專案獎金評估

---

## Waiting On 分類

| 值 | 顯示 | 顏色 | 說明 |
|---|---|---|---|
| `Customer` | 客戶 | orange | 等待客戶回覆 |
| `Sales` | 業務 | blue | 等待業務處理 |
| `IT` | IT | green | 等待 IT/維運 |
| `RD` | 研發 | purple | 等待研發 |
| `PM` | PM | cyan | 等待專案經理 |
| `Partner` | 經銷商 | gold | 等待經銷商/第三方 |

⸻

