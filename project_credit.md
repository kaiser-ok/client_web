# 專案獎金分潤計算功能

## 功能概述

專案獎金是在專案結束後，根據專案金額規模、專案完成情況計算並發放給專案參與成員的獎金。僅包括能從外部客戶獲得收入的專案，內部專案不在此範圍。

每年 1 月初，公司成立專案評估小組（總經理 + 各部門主管），按每個專案邀請成員報告專案情況，包括創新點（質量）、人天投入數（時效），隨後進行評分。本年度未完成合約的專案不實施評估，合併入次年績效計算。

---

## 計算公式

### 1. 專案金額
```
專案金額 = 成案金額 - 外部成本
```
外部成本包括：勞務外包、硬體設備、第三方軟體授權、諮詢顧問等。

### 2. 評分規則

| 評估項 | 計算方式 | 範圍 | 備註 |
|--------|---------|------|------|
| 基礎分 | 專案金額 / 10萬 | — | 專案基礎分 |
| 重要性 | 基礎分 x 0~+20% | 加分 | 對公司重要的專案加分 |
| 質量 | 基礎分 x -10~+10% | 加減分 | 根據創新/客訴進行加減分 |
| 時效 | 基礎分 x -10~+10% | 加減分 | 根據提早/延遲交付加減分 |

```
專案總分 = 基礎分 x (100% + 重要性% + 質量% + 時效%)
```
專案總分範圍：基礎分的 80% ~ 140%

### 3. 成員分配（按年度獨立設定）

每個年度有各自的成員名單和貢獻比例：

```
個人專案分 = 該年度積分 x 該成員在該年度的貢獻比例(%)
         = 專案總分 x 攤分比例 x 貢獻比例
```

貢獻比例由評估小組討論後，總經理最終決定。每年度允許未分配完 100%（草稿階段），但不可超過 100%。

#### 保固年度成員預設規則
- **業務(SALES)不帶入保固年份**：保固期間主要是技術維運工作，業務成員僅計入首年
- **RD(ENGINEER)預設佔該年度 30%**：保固年份的技術維運主要由 RD 負責
- 其餘比例分配給 PM、管理部等非業務成員
- 所有預設比例均可手動調整

#### 操作方式
- 首年（第 1 年）：手動設定所有成員及比例
- 保固年份（第 2 年起）：可點擊「從第 1 年帶入」自動生成成員（排除業務、RD 預設 30%），也可完全手動設定

### 4. 預設分配比例（首年，可調整）

| 專案類型 | 業務部 | 管理部 | 專案經理 | 執行成員 |
|---------|--------|--------|---------|---------|
| 系統專案 | 15% | 5% | 15% | 65% |
| 維運 | 15% | 5% | 5% | 75% |

實際分配比例可根據專案不同進行調整。

### 5. 保固攤分（延長保固）

若專案包含延長保固服務，專案總分需依保固年數攤分到各年度：

```
本年度計分 = 專案總分 x 當年攤分比例
```

預設攤分模板：
| 保固年數 | 第1年 | 第2年 | 第3年 | 第4年 | 第5年 |
|---------|-------|-------|-------|-------|-------|
| 1 年 | 100% | — | — | — | — |
| 2 年 | 80% | 20% | — | — | — |
| 3 年 | 70% | 15% | 15% | — | — |
| 4 年 | 60% | 15% | 15% | 10% | — |
| 5 年 | 50% | 15% | 15% | 10% | 10% |

攤分比例可自訂，但合計需等於 100%。無延長保固的專案（1 年）不攤分。

年度報表會自動納入跨年攤分：例如 2025 年評估的 3 年保固專案，會分別出現在 2025、2026、2027 年的報表中，各年度計入對應比例的分數。

### 6. 業績獎金計算

```
預估業績獎金 = 個人年度專案分合計 x 每點兌換金額
```
- 每點兌換金額預設 1,000 元，可由管理員在報表頁面設定
- 個人年度專案分 = 各專案的「本年度計分 x 貢獻比例」之加總

---

## 狀態流程

```
草稿(DRAFT) → 已評估(EVALUATED) → 已核准(APPROVED)
                    ↑                    |
                    └── 退回(reject) ────┘
                    ↑                    |
                    └── 退回草稿(revert) ┘  ← FINANCE/ADMIN 可退回已核准
```

- **草稿**：可自由編輯，成員比例允許不滿 100%
- **已評估**：提交給總經理審核
- **已核准**：鎖定評估內容（FINANCE/ADMIN 可退回草稿重新編輯）

---

## 權限控制

| 權限 | 角色 | 說明 |
|------|------|------|
| `VIEW_BONUS` | ADMIN, SALES, FINANCE, SUPPORT, RD | 查看評估和報表（唯讀） |
| `EDIT_BONUS` | ADMIN, FINANCE | 建立/編輯評估、退回已核准評估至草稿 |
| `APPROVE_BONUS` | ADMIN | 核准評估、設定每點兌換金額 |

### 條件式核准權限
- **ADMIN**：可核准所有案件（不限金額）
- **FINANCE**：僅可核准成案金額 < 30 萬的案件；≥ 30 萬僅 ADMIN 可核准

---

## 資料模型

### ProjectBonusEval（專案獎金評估）
```prisma
model ProjectBonusEval {
  id              String   @id @default(cuid())
  projectId       String   @unique
  project         Project  @relation
  year            Int                          // 評估年度
  dealAmount      Decimal  @db.Decimal(12, 2)  // 成案金額
  totalCost       Decimal  @db.Decimal(12, 2)  // 外部成本合計
  projectAmount   Decimal  @db.Decimal(12, 2)  // 專案金額 = dealAmount - totalCost
  baseScore       Decimal  @db.Decimal(8, 2)   // 基礎分 = projectAmount / 100000
  importanceAdj   Decimal  @db.Decimal(5, 2)   // 重要性加成 (0~20%)
  qualityAdj      Decimal  @db.Decimal(5, 2)   // 質量加減 (-10~+10%)
  efficiencyAdj   Decimal  @db.Decimal(5, 2)   // 時效加減 (-10~+10%)
  totalScore      Decimal  @db.Decimal(8, 2)   // 專案總分
  warrantyYears   Int      @default(1)         // 保固年數（1=不攤分）
  scoreSpreadPcts Json?                        // 攤分比例，如 [70, 15, 15]
  status          String   @default("DRAFT")   // DRAFT, EVALUATED, APPROVED, PAID
  evaluatedBy     String?
  approvedBy      String?
  notes           String?  @db.Text
  createdBy       String
  costs           ProjectCost[]
  members         ProjectBonusMember[]
}
```

### ProjectCost（外部成本）
```prisma
model ProjectCost {
  id          String           @id @default(cuid())
  evalId      String
  eval        ProjectBonusEval @relation
  category    String           // LABOR, HARDWARE, LICENSE, CONSULTING, OTHER
  description String
  amount      Decimal          @db.Decimal(12, 2)
}
```

### ProjectBonusMember（成員分配，按年度）
```prisma
model ProjectBonusMember {
  id              String           @id @default(cuid())
  evalId          String
  eval            ProjectBonusEval @relation
  userId          String
  user            User             @relation
  role            String           // SALES, MANAGEMENT, PM, ENGINEER
  yearOffset      Int   @default(0) // 0=第一年, 1=保固第2年, ...
  contributionPct Decimal          @db.Decimal(5, 2)  // 該年度貢獻比例 (%)
  score           Decimal?         @db.Decimal(8, 2)  // 個人專案分 = 總分 x 攤分比例 x 貢獻比例
  @@unique([evalId, userId, yearOffset])
}
```

---

## API 端點

### 專案評估 API (`/api/projects/[id]/bonus-eval`)

| 方法 | 說明 | 權限 |
|------|------|------|
| GET | 取得專案的獎金評估（含成本、成員） | VIEW_BONUS |
| POST | 建立或更新獎金評估（含成本、成員、評分） | EDIT_BONUS |
| PUT | 核准/退回/退回草稿 (`action: approve/reject/revert`) | APPROVE_BONUS (approve/reject)、EDIT_BONUS (revert) |

### Odoo 出貨成本 API (`/api/projects/[id]/odoo-costs`)

| 方法 | 說明 | 權限 |
|------|------|------|
| GET | 從 Odoo 取得該專案關聯訂單的出貨紀錄（stock_valuation_layer） | EDIT_BONUS |

### 年度報表 API (`/api/reports/bonus`)

| 方法 | 說明 | 權限 |
|------|------|------|
| GET | 取得年度獎金報表（參數：`year`, `status`） | VIEW_BONUS |
| PUT | 設定每點兌換金額（參數：`year`, `pointRate`） | APPROVE_BONUS |

每點兌換金額儲存在 `SystemConfig` 表，key 為 `bonus_point_rate_{year}`。

---

## UI 元件

### BonusEvalModal (`src/components/bonus/BonusEvalModal.tsx`)
專案獎金評估 Modal，入口在客戶頁 > 專案卡片的獎盃按鈕（需有關聯 Deal）。

功能：
- 分數摘要卡片（成案金額、外部成本、專案金額、基礎分、調整係數、總分）
- 保固攤分設定（年數選擇、各年比例調整、年度積分預覽）
- 評分調整 Slider（重要性、質量、時效）
- 外部成本明細（Collapse 折疊設計，≤5 筆展開、>5 筆收合，顯示筆數與合計摘要）
  - 支援從 Odoo 匯入出貨紀錄作為外部成本（stock_picking → stock_valuation_layer）
- 成員分配（按年度 Tabs）：
  - 每年度獨立設定成員、角色、貢獻比例
  - 保固年度可「從第 1 年帶入」（自動排除業務、RD 預設 30%）
  - 即時計算每年度個人專案分
- 「套用預設比例」按鈕（依專案類型自動分配）
- 狀態操作：儲存草稿、提交評估、核准、退回、退回草稿（已核准→草稿）
- 非 EDIT_BONUS 角色開啟為完全唯讀模式

### 年度獎金報表 (`src/app/reports/bonus/page.tsx`)
路徑：`/reports/bonus`，側邊欄「報表 > 專案獎金」。

功能：
- 年度選擇器（過去 2 年 + 當年 + 未來 5 年）
- 統計摘要（評估專案數、全員專案分合計、參與人數、每點兌換金額）
- 個人業績獎金排名表（可展開看各專案明細）
- 專案評估明細（折疊面板，含外部成本與調整參數）
- 計算公式說明

---

## 常數定義 (`src/constants/bonus.ts`)

### 外部成本分類
| 值 | 顯示 |
|----|------|
| LABOR | 勞務外包 |
| HARDWARE | 硬體設備 |
| LICENSE | 第三方軟體授權 |
| CONSULTING | 諮詢顧問 |
| OTHER | 其他 |

### 成員角色
| 值 | 顯示 |
|----|------|
| SALES | 業務部 |
| MANAGEMENT | 管理部 |
| PM | 專案經理 |
| ENGINEER | 執行成員 |

---

## 相關檔案

| 檔案 | 說明 |
|------|------|
| `prisma/schema.prisma` | ProjectBonusEval, ProjectCost, ProjectBonusMember model |
| `src/constants/bonus.ts` | 常數定義（成本分類、角色、預設比例、評分範圍） |
| `src/types/bonus.ts` | TypeScript 型別定義 |
| `src/app/api/projects/[id]/bonus-eval/route.ts` | 評估 CRUD API |
| `src/app/api/projects/[id]/odoo-costs/route.ts` | Odoo 出貨成本 API |
| `src/app/api/reports/bonus/route.ts` | 年度報表 API |
| `src/components/bonus/BonusEvalModal.tsx` | 評估 Modal 元件 |
| `src/app/reports/bonus/page.tsx` | 年度報表頁面 |
| `src/components/projects/ProjectsCard.tsx` | 專案卡片（含獎盃按鈕入口） |
