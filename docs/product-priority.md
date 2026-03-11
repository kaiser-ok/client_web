# 產品優先順序管理功能

## 功能概述

讓管理者設定常用產品的優先順序（1-100），報價單搜尋時優先顯示高優先順序的產品。

---

## 資料庫結構

### ProductPriority 資料表

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | String | 主鍵 |
| productId | String | 產品 ID（對應 product-kb.json） |
| productName | String | 產品名稱 |
| category | String? | 產品分類 |
| priority | Int | 優先順序（1-100，預設 50） |
| updatedBy | String | 最後更新者 email |
| updatedAt | DateTime | 更新時間 |
| createdAt | DateTime | 建立時間 |

---

## API 端點

### GET /api/products

列出所有產品（合併 product-kb.json + 資料庫優先順序）

**參數：**
| 參數 | 類型 | 說明 |
|------|------|------|
| page | number | 頁碼（預設 1） |
| limit | number | 每頁筆數（預設 50） |
| q | string | 搜尋關鍵字 |
| category | string | 分類篩選 |
| sort | string | 排序方式：priority / name / category |

**回應：**
```json
{
  "products": [
    {
      "id": "odoo-147",
      "name": "產品名稱",
      "category": "分類",
      "listPrice": 1000,
      "source": "odoo",
      "priority": 80,
      "updatedBy": "user@example.com",
      "updatedAt": "2025-01-03T10:00:00Z"
    }
  ],
  "total": 3000,
  "page": 1,
  "totalPages": 60,
  "categories": ["分類A", "分類B", ...]
}
```

---

### PUT /api/products/[id]

更新單一產品優先順序

**權限：** ADMIN、FINANCE

**請求：**
```json
{
  "priority": 80
}
```

**回應：**
```json
{
  "success": true,
  "productId": "odoo-147",
  "priority": 80,
  "updatedBy": "user@example.com",
  "updatedAt": "2025-01-03T10:00:00Z"
}
```

---

### POST /api/products/batch-update

批量更新產品優先順序

**權限：** ADMIN、FINANCE

**請求：**
```json
{
  "updates": [
    { "productId": "odoo-147", "priority": 80 },
    { "productId": "odoo-148", "priority": 70 }
  ]
}
```

**回應：**
```json
{
  "success": true,
  "message": "成功更新 2 個產品",
  "results": [
    { "productId": "odoo-147", "success": true },
    { "productId": "odoo-148", "success": true }
  ]
}
```

---

## 管理頁面

**路徑：** `/settings/products`

**功能：**
- 表格顯示所有產品
- 搜尋產品名稱
- 分類下拉篩選
- 排序方式切換（優先順序 / 名稱 / 分類）
- 直接在表格內修改優先順序（InputNumber）
- 批量選取產品 + 批量設定優先順序
- 分頁瀏覽

**權限：**
- 查看：ADMIN、FINANCE
- 編輯：ADMIN、FINANCE

---

## 報價單搜尋整合

修改 `/api/quotations/products` 搜尋邏輯：

```typescript
// 搜尋評分 = 原有評分 + 優先順序權重
score += priority * 0.5
```

**效果：**
- 優先順序 100 的產品額外加 50 分
- 優先順序 50 的產品額外加 25 分
- 高優先順序產品在搜尋結果中排名更前

---

## 優先順序建議值

| 優先順序 | 說明 | 適用場景 |
|----------|------|----------|
| 80-100 | 最高優先 | 主力產品、常用品項 |
| 60-79 | 高優先 | 次常用產品 |
| 40-59 | 一般 | 一般產品（預設 50） |
| 20-39 | 低優先 | 不常用產品 |
| 1-19 | 最低優先 | 停售或極少用產品 |

---

## 檔案清單

| 類型 | 檔案路徑 |
|------|----------|
| Schema | `prisma/schema.prisma` |
| API | `src/app/api/products/route.ts` |
| API | `src/app/api/products/[id]/route.ts` |
| API | `src/app/api/products/batch-update/route.ts` |
| 頁面 | `src/app/settings/products/page.tsx` |
| 搜尋 | `src/app/api/quotations/products/route.ts` |
| 權限 | `src/constants/roles.ts` |
