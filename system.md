# 客戶活動中台系統 (Customer Account Management Platform)

## 系統概述

這是一個整合式的 **客戶活動中台系統**，使用 Next.js 16 + React 18 + TypeScript 建構。系統整合了多個外部服務（Jira、Odoo、Slack、LINE、Gmail），讓 Sales / IT / RD / PM 團隊能在同一個介面中完整掌握客戶狀態。

### 技術堆疊
- **前端**: Next.js 16.0.10, React 18, TypeScript 5, Ant Design 6.1.1, TailwindCSS 3.4, @ant-design/charts 2.6.6
- **後端**: Next.js API Routes, Node.js
- **資料庫**: PostgreSQL (主要, via `pg` 8.16.3), Redis (ioredis 5.9.3)
- **ORM**: Prisma 5.22
- **任務佇列**: BullMQ 5.66.5
- **知識圖譜**: Neo4j 6.0.1 (via Graphiti FastAPI service)
- **向量資料庫**: pgvector (RAG 搜尋, embedding)
- **認證**: NextAuth 4.24, LDAP (ldapts 8.1.2)
- **外部整合**: Jira API, Slack API, LINE Messaging API, Gmail IMAP (imapflow), Odoo DB
- **其他**: Puppeteer 24 (PDF), nodemailer (Email), opencc-js (簡繁轉換), SWR 2.3, react-markdown 10, xlsx

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
- **Odoo** = ERP 資料來源：客戶清單、成交資料、訂單、報價單、員工、發票
- **Slack/LINE/Gmail** = 對話來源：自動彙整到活動時間軸
- **Graphiti (Neo4j)** = 知識圖譜：RAG 問答、跨對話搜尋、CRM 結構化節點

---

## 2) 核心功能模組

### A) Partner 統一模型
系統已將 Customer、Supplier、Partner 整合為統一的 `Partner` 模型：
- 支援多種角色：`CUSTOMER`、`SUPPLIER`、`PARTNER`
- 支援母子公司關係（parentId）
- 整合欄位：Jira labels、Odoo ID、Slack channel
- Partner 合併功能（merge）

### B) Activity Timeline（活動時間軸）
Timeline 包含的事件來源（統一成 Activity）：
- 手動輸入（業務現場紀錄、會議紀要）
- 訪談逐字稿（錄音轉文字後的摘要/重點）
- LINE 訊息摘要
- Email 摘要
- Slack 訊息（自動分類與匯整）
- Jira 事件（工單建立、狀態變更、指派變更、留言等）
- ERP 事件
- 文件/附件連結

來源類型：`JIRA` / `MANUAL` / `MEETING` / `LINE` / `EMAIL` / `DOC` / `SLACK` / `ERP`

### C) Open Items（Jira Issues 管理）
- 桌機表格 + 手機卡片列雙版面
- 欄位：Key、Summary、Status、Priority、Assignee、Waiting on、Next action、Due、Updated、Last reply
- 展開列：最近 3 則 Jira comment、新增回覆輸入框、關聯 Timeline 片段
- 手機 Bottom Sheet：留言列表、編輯 Waiting on/Next action/Due、Open in Jira
- 篩選：狀態、Waiting on、只看我負責、Priority
- 排序：Due 最早、最久未更新、Priority 最高、最新回覆
- 快速回寫 Jira comment + 同步更新 Timeline

### D) 專案管理 (Projects)
- 從 Deal 建立專案
- 專案狀態追蹤：`ACTIVE`、`COMPLETED`、`ON_HOLD`、`CANCELLED`
- 關聯終端用戶和供應商（End User Projects）
- 專案活動追蹤、專案圖片管理
- 專案獎金評估與分潤計算（詳見 [project_credit.md](./project_credit.md)）

### E) 報價單系統 (Quotations)
- 獨立報價單編號（YYMMDD[A-Z] 格式）
- 多步驟建立流程（類型選擇 → 客戶選擇 → 產品管理 → 確認）
- 報價明細：產品、數量、單價、折扣
- 狀態追蹤：`DRAFT`、`SENT`、`APPROVED`、`REJECTED`、`CONVERTED`
- PDF 生成（Puppeteer）與 Email 發送（nodemailer）
- LLM 輔助：AI 產品描述生成、智慧報價建議、報價單解析
- 報價單模板管理
- 同步到 Odoo

### F) 檔案管理 (Files)
- 按客戶/年份組織檔案
- 支援手動上傳與 Jira 附件同步
- 檔案類型：UPLOAD、JIRA_ATTACHMENT
- 軟刪除支援、檔案下載

### G) 技術知識庫 (Technical Notes)
- 從 Slack 頻道擷取技術討論
- 類別分類：technical、maintenance、security、speedtest
- 關鍵字與參與者追蹤
- 連結原始 Slack 頻道

### H) LINE 整合
- Webhook 接收 LINE Official Account 訊息
- 支援 GROUP、ROOM、USER（1:1）對話
- LINE 用戶 profile 管理與身份對應
- 頻道與 Partner 關聯（LineChannelAssociation）
- 訊息處理狀態追蹤
- 歷史訊息匯入與同步
- LINE 訊息活動統計（LineActivityStats）

### I) Slack 整合
- Webhook 事件處理
- Slack 頻道與 Partner 對應（SlackChannelMapping）
- 訊息摘要與分類（slack-classification）
- 歷史訊息同步
- 已刪除活動管理（Admin 可查看統計、匯出 LLM 優化 prompt）

### J) Gmail 整合
- IMAP App Password 認證
- 收件匣訊息同步
- 附件擷取
- 同步到知識圖譜

### K) 會議記錄轉錄 (Transcriptions)
- 整合 VibeVoice ASR 服務（Gradio，`http://192.168.30.47:7860`）
- 支援兩種音訊輸入：檔案上傳、瀏覽器麥克風錄音
- ASR 參數可調：Max Tokens、Temperature、Top-p、Repetition Penalty、Sampling
- 輸出文字自動簡體轉繁體（OpenCC）
- LLM 摘要三種格式：簡要摘要（100字內）、會議摘要（含結論/追蹤項目）、詳細記錄
- 選擇客戶後 LLM 可參考客戶上下文資訊
- 存檔：活動記錄僅存摘要，逐字稿存到客戶檔案區（`{客戶}/{年}/會議記錄/`）

### L) 知識圖譜 & RAG (Graphiti)
- Neo4j 知識圖譜後端（FastAPI service in `services/graphiti/`）
- CRM 結構化節點：Organization、Person、Deal、Issue、Product、Project
- 從 Slack/LINE/Email/Activity 彙整訊息為 Episodes
- pgvector 向量搜尋（DocumentChunk + embedding）
- RAG Q&A 功能（附來源引用）
- 上下文對話（/chat 頁面）
- 組織 360° 視圖、人物關係、最短路徑分析

### M) 身份解析 (Identity Resolution)
- 跨平台身份對應：LINE user、Slack user、Email sender → Partner/Contact
- 解析歷史追蹤（ResolutionLog）
- 未解析身份清單與統計
- 手動 mapping 管理

### N) 產品管理 (Products)
- 產品目錄與分類管理（ProductCategory）
- 產品優先級設定（ProductPriority）
- 批量更新功能
- 產品知識庫（storage/product-knowledge.json）

### O) Dashboard
- 快取統計（DashboardStats）：客戶數、待處理/等待中/逾期 issues
- 到期合約追蹤
- 待處理 Issues 快速查看
- 資料同步觸發
- 活動統計頁面（個人化 + 團隊通訊/業務統計）

### P) Odoo ERP 整合
- 客戶同步（sync-customers）
- 成交/訂單同步（sync-deals）
- 員工同步（sync-employees）
- 發票同步（sync-invoices）
- 標籤同步（sync-tags）
- 出貨成本匯入（odoo-costs）

---

## API 端點總覽

### 核心 API
| 路徑 | 說明 |
|------|------|
| `/api/customers/` | 客戶 CRUD |
| `/api/customers/[id]/end-user-projects` | 終端用戶專案關聯 |
| `/api/customers/[id]/files/` | 檔案管理（上傳/下載/同步 Jira/年份查詢） |
| `/api/customers/[id]/graph-view` | 客戶關係圖 |
| `/api/customers/[id]/projects/` | 客戶專案（含專案圖片管理） |
| `/api/customers/[id]/sync-deals` | 同步客戶成交資料 |
| `/api/customers/[id]/technical-notes` | 技術知識庫 |
| `/api/partners/` | Partner（統一模型）CRUD |
| `/api/partners/[id]/roles` | Partner 角色管理 |
| `/api/partners/merge` | Partner 合併 |
| `/api/open-items/` | Jira issues 同步與管理 |
| `/api/activities/` | 活動時間軸 CRUD |
| `/api/deals/` | 成交/合約管理 |
| `/api/deals/[id]/create-project` | 從 Deal 建立專案 |
| `/api/products/` | 產品目錄（含分類、批量更新） |
| `/api/suppliers/` | 供應商管理與同步 |
| `/api/users/` | 使用者管理 |

### 報價單 API
| 路徑 | 說明 |
|------|------|
| `/api/quotations/` | 報價單 CRUD |
| `/api/quotations/[id]/pdf` | PDF 生成 |
| `/api/quotations/[id]/email` | Email 發送 |
| `/api/quotations/generate-description` | AI 產品描述生成 |
| `/api/quotations/suggestions` | AI 報價建議 |
| `/api/quotations/parse` | 報價單解析 |
| `/api/quotations/products` | 報價產品查詢 |
| `/api/quotation-templates/` | 報價單模板管理 |

### 整合 API
| 路徑 | 說明 |
|------|------|
| `/api/jira/issues` | 搜尋 Jira issues |
| `/api/jira/issues/[key]/attachments` | 取得 issue 附件 |
| `/api/jira/issues/[key]/comment` | 新增 Jira comment |
| `/api/jira/issues/[key]/transitions` | Jira workflow 轉換 |
| `/api/jira/attachments/[id]` | 下載 Jira 附件 |
| `/api/slack/channels` | Slack 頻道管理 |
| `/api/slack/mappings` | Slack-Partner 對應 |
| `/api/slack/summarize` | 訊息摘要 |
| `/api/slack/sync-history` | 歷史訊息同步 |
| `/api/slack/webhook` | Slack Webhook |
| `/api/line/channels/` | LINE 頻道管理（含訊息、統計、摘要、關聯、匯入） |
| `/api/line/events` | LINE 事件處理 |
| `/api/line/webhook` | LINE Webhook |
| `/api/line/users/` | LINE 用戶管理 |
| `/api/line/sync-history` | LINE 歷史同步 |
| `/api/gmail/sync` | Gmail 同步 |
| `/api/odoo/sync-customers` | Odoo 客戶同步 |
| `/api/odoo/sync-deals` | Odoo 成交同步 |
| `/api/odoo/sync-employees` | Odoo 員工同步 |
| `/api/odoo/sync-invoices` | Odoo 發票同步 |
| `/api/odoo/sync-tags` | Odoo 標籤同步 |

### 知識圖譜 / RAG API
| 路徑 | 說明 |
|------|------|
| `/api/graphiti/ask` | 自然語言查詢圖譜 |
| `/api/graphiti/search` | 圖譜搜尋 |
| `/api/graphiti/sync` | 圖譜同步 |
| `/api/graphiti/full-sync` | 圖譜完整重建 |
| `/api/graph/search` | 關係搜尋 |
| `/api/rag/chat` | RAG 問答聊天 |
| `/api/rag/search` | RAG 搜尋 |
| `/api/rag/sync` | RAG 知識庫同步 |

### 身份解析 API
| 路徑 | 說明 |
|------|------|
| `/api/identity-resolution/` | 身份解析核心 |
| `/api/identity-resolution/mappings` | 身份對應管理 |
| `/api/identity-resolution/history` | 解析歷史 |
| `/api/identity-resolution/stats` | 解析統計 |
| `/api/identity-resolution/unresolved` | 未解析身份 |

### 會議記錄 / ASR API
| 路徑 | 說明 |
|------|------|
| `POST /api/transcriptions` | 上傳音檔到 ASR 服務進行轉錄 |
| `POST /api/transcriptions/summarize` | LLM 摘要或存檔為客戶活動 |

### Dashboard / 報表 API
| 路徑 | 說明 |
|------|------|
| `/api/dashboard/stats` | Dashboard 統計 |
| `/api/dashboard/sync` | Dashboard 資料同步 |
| `/api/dashboard/expiring-contracts` | 到期合約 |
| `/api/dashboard/issues` | 待處理 Issues |
| `/api/dashboard/activity-stats` | 個人化活動統計 |
| `/api/reports/daily-issues` | 每日 Issue 追蹤 |
| `/api/reports/customer-views` | 客戶查詢統計 |
| `/api/reports/sales` | 銷售報表 |
| `/api/reports/bonus` | 年度專案獎金報表 |

### 專案 API
| 路徑 | 說明 |
|------|------|
| `/api/projects/[id]/bonus-eval` | 專案獎金評估 CRUD / 核准 / 退回草稿 |
| `/api/projects/[id]/odoo-costs` | Odoo 出貨成本匯入 |

### 設定 API
| 路徑 | 說明 |
|------|------|
| `/api/settings/company` | 公司設定 |
| `/api/settings/file-storage` | 檔案存儲設定 |
| `/api/settings/gmail` | Gmail 設定 |
| `/api/settings/llm` | LLM 設定 |
| `/api/settings/slack-classification` | Slack 分類規則 |

### 管理 API
| 路徑 | 說明 |
|------|------|
| `/api/admin/deleted-slack-activities` | 已刪除 Slack 活動管理 |
| `/api/uploads/line/[filename]` | LINE 上傳檔案存取 |
| `/api/upload` | 通用檔案上傳 |

---

## 資料模型（Prisma Schema 摘要）

詳見 [db.md](./db.md)

### 核心實體
- **Partner** - 統一客戶/供應商/經銷商模型（多角色、母子關係、Odoo/Slack/LINE 整合）
- **Deal** - 成交/合約（類型：PURCHASE、MA、LICENSE、SUBSCRIPTION）
- **Project** - 專案管理（狀態追蹤、End User 關聯）
- **Activity** - 活動時間軸（來源：JIRA/MANUAL/MEETING/LINE/EMAIL/DOC/SLACK/ERP）
- **OpenItem** - Issue 追蹤（Waiting on、Next action、Due）
- **TechnicalNote** - 技術知識庫

### 財務管理
- **ProjectBonusEval** - 專案獎金評估（成本追蹤：人力、硬體、授權）
- **ProjectBonusMember** - 團隊成員獎金分配

### 報價單
- **Quotation** / **QuotationItem** - 報價單與明細
- **QuotationTemplate** - 報價單模板

### 通訊整合
- **LineChannel** / **LineMessage** / **LineUser** - LINE 整合
- **LineChannelAssociation** - LINE 頻道與 Partner 關聯
- **SlackChannelMapping** - Slack 頻道對應
- **DeletedSlackActivity** - 已刪除活動審計

### 知識 & RAG
- **DocumentChunk** - 文字區塊（向量搜尋用）
- **ProductPriority** / **ProductCategory** - 產品知識庫

### 系統
- **User** - 使用者（角色：SUPPORT 等）
- **Contact** - 跨平台聯絡人
- **IdentityMapping** / **ResolutionLog** - 身份解析
- **PartnerFile** - 檔案管理（版本控制）
- **GraphSyncLog** - 圖譜同步審計
- **DashboardStats** - Dashboard 快取
- **SystemConfig** - 系統設定

---

## 頁面路由

### 主要頁面
| 路徑 | 說明 |
|------|------|
| `/` | 首頁/Dashboard（統計卡片、到期合約、近期活動） |
| `/login` | 登入頁（AD 帳號 + Google OAuth） |
| `/customers` | 客戶列表（搜尋、角色篩選、建立/合併/刪除） |
| `/customers/[id]` | 客戶詳情頁（tabs：概覽、Issues、Timeline、Files、技術筆記、LINE、Graph） |
| `/quotations` | 報價單列表（狀態篩選） |
| `/quotations/new` | 多步驟報價單建立 |
| `/quotations/[id]` | 報價單詳情/編輯（產品管理、PDF 預覽、Email 發送） |
| `/chat` | RAG 問答聊天（客戶上下文篩選） |
| `/knowledge` | 知識庫管理與 Q&A |
| `/transcriptions` | 會議記錄轉錄（ASR + LLM 摘要 + 存檔） |
| `/mobile` | 行動工作台（錄音、拜訪記錄、近期項目、銷售、報修、AI 報價） |

### 報表頁面
| 路徑 | 說明 |
|------|------|
| `/reports` | 報表首頁（導向 /reports/issues） |
| `/reports/issues` | Issue 統計（每日建立/解決趨勢） |
| `/reports/activity-stats` | 活動統計 Dashboard（個人概覽 + 團隊通訊/業務指標） |
| `/reports/customer-views` | 客戶查詢統計 |
| `/reports/sales` | 銷售報表（營收趨勢、Top 客戶、業務績效） |
| `/reports/bonus` | 專案獎金報表（成員分配小計） |

### 設定頁面
| 路徑 | 說明 |
|------|------|
| `/settings` | 設定首頁（導向 /settings/odoo） |
| `/settings/company` | 公司資訊與報價設定 |
| `/settings/odoo` | ERP 資料同步（客戶、成交、員工、供應商） |
| `/settings/file-storage` | 檔案存儲路徑設定 |
| `/settings/slack` | Slack 頻道對應 |
| `/settings/slack/classification` | Slack 訊息分類規則 |
| `/settings/llm` | LLM 供應商設定（主/備、模型選擇） |
| `/settings/line` | LINE 整合（頻道對應、用戶身份） |
| `/settings/gmail` | Gmail IMAP 設定 |
| `/settings/quotation-templates` | 報價單模板管理 |
| `/settings/suppliers` | 供應商管理與 Odoo 同步 |
| `/settings/products` | 產品優先級管理 |
| `/settings/identity-resolution` | 跨平台身份對應（LINE/Slack/Email） |

### 管理頁面
| 路徑 | 說明 |
|------|------|
| `/admin/users` | 使用者管理（角色指派、啟用/停用） |
| `/admin/deleted-activities` | 已刪除 Slack 活動查看（統計、LLM 優化 prompt 匯出） |

---

## 元件結構

### Layout
- `AppLayout` - 主要佈局
- `Sidebar` - 側邊導航（角色感知）
- `Header` - 頂部列
- `MobileNav` - 手機導航

### Common
- `EmptyState` - 空狀態 UI
- `InlineEdit` - 行內編輯
- `PriorityBadge` - 優先級標籤
- `StatusBadge` - 狀態標籤
- `WaitingOnSelect` - Waiting on 下拉選擇

### 客戶頁面元件
- `CustomerHeader` - 客戶資訊 + 快速操作
- `ActivityTimeline` - 活動時間軸
- `ActivityCard` - 單一活動卡片
- `OpenItemsTable` / `OpenItemsCard` - Issues 表格/卡片
- `OpenItemFilters` - Issues 篩選控制
- `DealsCard` - 合約追蹤
- `ProjectsCard` - 專案列表
- `EndUserProjectsCard` - 終端用戶專案
- `TechnicalNotesCard` - 技術知識庫
- `CustomerFileBrowser` - 檔案管理

### 圖譜元件
- `GraphTab` - 圖譜 Tab
- `GraphOverviewCard` - 圖譜概覽
- `NetworkVisualization` - 網路圖視覺化
- `NodeDetailDrawer` - 節點詳情抽屜

### LINE 元件
- `LineMessagesCard` - LINE 訊息卡片
- `LineActivityStats` - LINE 活動統計

### Dashboard
- `IssueCard` - Dashboard Issue 卡片

### Partners
- `MergePartnerModal` - Partner 合併

### Products
- `CategoryManageModal` - 產品分類管理

### Bonus
- `BonusEvalModal` - 專案獎金評估

### Modal 元件
- `AddActivityModal` - 新增活動
- `AddIssueModal` - 建立 Jira Issue
- `AddDealModal` - 新增成交
- `ReplyModal` - 回覆 Issue
- `BottomSheet` - 手機詳情面板
- `SmartQuotationModal` - LLM 輔助報價
- `QuotationEmailModal` - 報價單 Email
- `QuotationPDFPreview` - PDF 預覽

---

## Lib 模組

| 檔案 | 說明 |
|------|------|
| `auth.ts` | 認證與授權邏輯 |
| `prisma.ts` | Prisma ORM Client 設定 |
| `jira.ts` | Jira API 整合 |
| `slack.ts` | Slack API 整合 |
| `line.ts` | LINE Messaging API |
| `line-events.ts` | LINE 事件處理 |
| `line-import-parser.ts` | LINE 訊息匯入解析 |
| `gmail.ts` | Gmail IMAP 整合 |
| `email-sender.ts` | Email 發送 |
| `odoo.ts` | Odoo ERP 整合 |
| `ldap.ts` | LDAP 目錄服務 |
| `llm.ts` | LLM 整合與工具 |
| `dify.ts` | Dify AI 平台整合 |
| `embedding.ts` | 向量 embedding 生成 |
| `graphiti.ts` | Graphiti 知識圖譜客戶端 |
| `graph-sync.ts` | 圖譜同步邏輯 |
| `entity-resolver.ts` | 實體解析（跨平台身份匹配） |
| `message-pipeline.ts` | 訊息處理管線 |
| `pdf-generator.ts` | PDF 文件生成（Puppeteer） |
| `dayjs.ts` | 日期工具設定 |

## Hooks

| 檔案 | 說明 |
|------|------|
| `useCustomer.ts` | 客戶資料取得/管理 |
| `useCustomerFiles.ts` | 客戶檔案管理 |
| `useDeals.ts` | 成交資料 |
| `useGraphView.ts` | 圖譜視覺化資料 |
| `useMediaQuery.ts` | 響應式設計 |
| `useOpenItems.ts` | Open Items 管理 |
| `usePartner.ts` | Partner 資料 |
| `useTimeline.ts` | 活動時間軸資料 |
| `useUser.ts` | 當前使用者資料 |

## Types

| 檔案 | 說明 |
|------|------|
| `activity.ts` | 活動類型定義 |
| `bonus.ts` | 獎金類型定義 |
| `company.ts` | 公司資訊類型 |
| `customer.ts` | 客戶類型 |
| `deal.ts` | 成交類型 |
| `gmail.ts` | Gmail 類型 |
| `jira.ts` | Jira 類型 |
| `llm.ts` | LLM 類型 |
| `next-auth.d.ts` | NextAuth 類型擴展 |
| `open-item.ts` | Open Item 類型 |
| `partner.ts` | Partner 類型 |
| `sales-report.ts` | 銷售報表類型 |
| `slack-classification.ts` | Slack 分類類型 |
| `unified-message.ts` | 統一訊息類型 |

## Constants

| 檔案 | 說明 |
|------|------|
| `bonus.ts` | 獎金計算常數 |
| `roles.ts` | 使用者角色與權限 |
| `slack-categories.ts` | Slack 訊息分類 |
| `waiting-on.ts` | Waiting on 部門分類 |

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

---

## 背景服務

### PM2 程序管理（ecosystem.config.js）

| 程序 | 腳本 | 說明 | 記憶體限制 |
|------|------|------|------|
| `client-web` | `npm start` (port 3000) | 主應用程式 | 1GB |
| `graph-sync-worker` | `src/workers/graph-sync-worker.ts` | 圖譜同步 Worker | 512MB |
| `message-pipeline-worker` | `src/workers/message-pipeline-worker.ts` | 訊息處理 Worker | 512MB |

### Graphiti Service（services/graphiti/）
- FastAPI 應用程式（Python 3.12）
- Neo4j 知識圖譜後端
- OpenAI API 整合
- Docker 容器化部署
- 端點：Episode 管理、CRM 節點 CRUD、搜尋、Q&A、組織分析

---

## 系統啟動程序

### 環境需求
- Node.js (建議 18+)
- PostgreSQL 資料庫
- Redis（BullMQ 任務佇列用）
- 可連接 Jira API
- 可連接 Odoo

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

# ASR 服務（VibeVoice）
ASR_BASE_URL=http://192.168.30.47:7860
```

#### 反向代理（Nginx）
系統透過 Nginx 反向代理對外提供 HTTPS 服務：
```
外部存取 → 防火牆 :61688 → Nginx :443 (TLS) → Next.js :3000
```
- 設定檔：`/etc/nginx/sites-available/proj.gentrice.net`
- SSL 憑證：`/etc/cert/proj.gentrice.net/`
- LINE Webhook URL：`https://proj.gentrice.net:61688/api/line/webhook`

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

---

## 開發日誌

詳見 [daily.md](./daily.md)

---

## 工具腳本（scripts/）

### 資料分析
- `analyze-improvements.js` / `analyze-quotations.js` / `analyze-slack-messages.ts` / `show-uncategorized.ts`

### Slack
- `collect-slack-messages.ts` / `clear-slack-activities.ts`

### 報價單 & 產品
- `fetch-all-quotations.js` / `fetch-more-quotations.js` / `test-quotation-parse.js`
- `backfill-quotation-skus.js` / `seed-quotation-templates.ts`
- `build-product-kb.js` / `extract-products.js` / `import-sku.js` / `seed-product-categories.ts`

### Odoo
- `test-odoo.ts` / `sync-odoo-deals.ts` / `sync-odoo-mirror.sh` / `sync-manual-partners-to-odoo.ts`
- `fetch-odoo-files.js` / `fetch-odoo-attachments.js` / `find-odoo-filestore.js`

### RAG & Embeddings
- `generate-embeddings.ts` / `test-rag-search.ts` / `test-rag-sync.ts`

### 資料遷移
- `migrate-to-partner.ts` + `migrate-to-partner.sql` / `rollback-partner-migration.sql`
- `seed-identity-mappings.ts`

### 圖譜 & 測試
- `graph-full-sync.ts` / `test-sync.ts` / `test-ldap.ts` / `daily-rematch.js`
