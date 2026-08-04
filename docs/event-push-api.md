# Event Push API — 接收端規格（給 192.168.30.187:3003 開發者）

本文件說明 **client-web（IT CRM）** 如何把 LINE「事件管理」的新事件與狀態變更推送到你的系統。
你需要實作**一個 HTTP 接收端點**接收下述 POST 請求。

- **推送方（sender）**：client-web
- **接收方（receiver，你要開發的）**：`http://192.168.30.187:3003/api/incidents`
- **傳輸**：HTTP POST，JSON body
- **字元編碼**：UTF-8

---

## 1. 你需要實作的端點

```
POST /api/incidents
Content-Type: application/json
X-API-Key: <雙方約定的共用金鑰>
```

### 驗證
- 每個請求都會帶 `X-API-Key` header，值為雙方約定的共用金鑰。
- 請驗證此 header；不符請回 `401`（我方會當作失敗並重送，建議改回 `403` 讓我方停止重送，或直接告知我方金鑰不符）。

### 回應約定（**很重要**）
| 你的回應 | 我方行為 |
|----------|----------|
| **HTTP 2xx**（200/201/204 皆可） | 視為**送達成功**，標記 SENT，不再重送 |
| 非 2xx（4xx/5xx） | 視為失敗，**自動重送**（見第 5 節退避規則） |
| 連線逾時 / 拒絕 | 視為失敗，**自動重送** |

> 回應 body 我方不解析（僅記錄前 500 字供除錯），你回空 body 也可以。
> 請盡量在 **10 秒內**回應（我方預設逾時 10 秒）。

---

## 2. 請求範例

### 2-1. 新事件（eventType = `CREATED`）

```json
{
  "source": "client-web",
  "eventType": "CREATED",
  "event": {
    "id": "cmse17kfs0001i0lxqzhopnj1",
    "title": "MVPN 轉手機機制停擺",
    "description": "客戶回報 MVPN 無法轉接到手機，影響值班聯絡",
    "status": "NEW",
    "priority": "P1",
    "origin": "auto",
    "partner":  { "id": "cmaa11...", "name": "勤業眾信" },
    "project":  { "id": "cbb22...", "name": "MVPN 路由主機案" },
    "assignee": { "email": "engineer@company.com", "name": "王小明" },
    "channels": [ { "id": "cch33...", "name": "勤業眾信MVPN 路由主機案" } ],
    "sla": {
      "responseDue": "2026-08-04T06:00:00.000Z",
      "resolveDue":  "2026-08-04T10:00:00.000Z"
    },
    "createdBy": "reviewer@company.com",
    "createdAt": "2026-08-04T02:21:14.678Z",
    "updatedAt": "2026-08-04T02:21:14.678Z"
  },
  "change": null,
  "deliveryId": "cmse17of00003i0lx9k2p1abc"
}
```

### 2-2. 狀態變更（eventType = `STATUS_CHANGED`）

與 `CREATED` 相同結構，差別在 `change` 有值、`event.status` 為變更後狀態：

```json
{
  "source": "client-web",
  "eventType": "STATUS_CHANGED",
  "event": {
    "id": "cmse17kfs0001i0lxqzhopnj1",
    "title": "MVPN 轉手機機制停擺",
    "status": "IN_PROGRESS",
    "priority": "P1",
    "origin": "auto",
    "partner":  { "id": "caa11...", "name": "勤業眾信" },
    "project":  null,
    "assignee": { "email": "engineer@company.com", "name": "王小明" },
    "channels": [ { "id": "cch33...", "name": "勤業眾信MVPN 路由主機案" } ],
    "sla": { "responseDue": "...", "resolveDue": "..." },
    "createdBy": "reviewer@company.com",
    "createdAt": "2026-08-04T02:21:14.678Z",
    "updatedAt": "2026-08-04T03:05:00.000Z"
  },
  "change": {
    "from": "NEW",
    "to": "IN_PROGRESS",
    "by": "engineer@company.com",
    "action": "assign"
  },
  "deliveryId": "cmse2xyz00099i0lxaa11bb22"
}
```

### 2-3. 連線測試（eventType = `TEST`）

我方設定頁的「測試連線」按鈕會送這筆合成資料（**不代表真實事件**，`deliveryId` 固定為 `"test"`）。
你可直接回 2xx 忽略內容：

```json
{
  "source": "client-web",
  "eventType": "TEST",
  "event": { "id": "test-...", "title": "[連線測試] Event Push", "status": "NEW", "priority": "NORMAL", "origin": "manual" },
  "deliveryId": "test",
  "note": "這是一筆由設定頁觸發的連線測試，對方可忽略"
}
```

---

## 3. 欄位規格

### 頂層
| 欄位 | 型別 | 說明 |
|------|------|------|
| `source` | string | 固定 `"client-web"` |
| `eventType` | string(enum) | `CREATED` \| `STATUS_CHANGED` \| `TEST` |
| `event` | object | 事件內容，見下 |
| `change` | object \| null | 僅 `STATUS_CHANGED` 有值；`CREATED` 為 `null` |
| `deliveryId` | string | **冪等鍵**，見第 4 節 |

### `event`
| 欄位 | 型別 | 可為 null | 說明 |
|------|------|:---:|------|
| `id` | string | 否 | 事件唯一 ID（client-web 端 LineEvent.id，跨重送/狀態變更皆相同） |
| `title` | string | 是 | 事件標題 |
| `description` | string | 是 | 問題摘要 |
| `status` | string(enum) | 否 | `NEW` \| `IN_PROGRESS` \| `RESOLVED` \| `CLOSED` |
| `priority` | string(enum) | 否 | `P1` \| `P2` \| `NORMAL` |
| `origin` | string(enum) | 否 | `auto`（AI/自動建立） \| `manual`（人工建立） |
| `partner` | object \| null | 是 | 關聯客戶 `{ id, name }` |
| `project` | object \| null | 是 | 關聯專案 `{ id, name }` |
| `assignee` | object \| null | 是 | 指派人 `{ email, name }` |
| `channels` | array | 否 | 關聯 LINE 頻道陣列 `[{ id, name }]`，可能為空陣列 |
| `sla.responseDue` | string(ISO8601) \| null | 是 | 回應期限（UTC） |
| `sla.resolveDue` | string(ISO8601) \| null | 是 | 解決期限（UTC） |
| `createdBy` | string | 否 | 建立者 email |
| `createdAt` | string(ISO8601) | 否 | 建立時間（UTC） |
| `updatedAt` | string(ISO8601) | 否 | 最後更新時間（UTC） |

### `change`（僅 STATUS_CHANGED）
| 欄位 | 型別 | 說明 |
|------|------|------|
| `from` | string | 變更前狀態 |
| `to` | string | 變更後狀態 |
| `by` | string | 操作人 email |
| `action` | string(enum) | `assign` \| `start` \| `resolve` \| `close` \| `reopen` |

> 所有時間欄位皆為 **ISO 8601 UTC**（結尾 `Z`）。

---

## 4. 冪等性（Idempotency）— 請務必處理

我方採「至少送達一次」（at-least-once）：**同一筆推送在重送時，`deliveryId` 不變**。
因此你**可能收到重複的請求**（例如你回應太慢、我方逾時後重送，但其實你已處理成功）。

**建議做法**：以 `deliveryId` 做唯一鍵去重。
- 收到請求 → 檢查 `deliveryId` 是否已處理過 → 已處理則直接回 2xx（不重複建單）。
- `eventType=TEST` 的 `deliveryId` 固定為 `"test"`，請特別排除、不要當真實事件。

> 注意：`event.id` 在「新事件」與後續多次「狀態變更」之間是**相同**的（代表同一事件）；
> `deliveryId` 則是**每次推送各自唯一**（同一次推送的多次重送才相同）。
> 去重用 `deliveryId`；要對應/更新同一張事件單則用 `event.id`。

### ⚠️ 遇未知 `event.id` 請 upsert，不要回 400（重要）

你可能收到一筆 `STATUS_CHANGED`，但**從未收過該事件的 `CREATED`**。發生情境：
- 該事件在整合**啟用前**就已建立（當時我方不會推送）；
- 或它的 `CREATED` 曾推送失敗。

此時**請勿回 400**——`STATUS_CHANGED` 的 payload 已包含**完整的 `event` 物件**（title、status、priority… 一應俱全），
請以 `event.id` 做 **upsert**：**有則更新狀態、無則直接用 payload 內的 event 建立**。
否則這類事件會在我方重試耗盡後永久失敗（`DEAD`）。

---

## 5. 重送與退避行為（供你理解時序）

| 項目 | 值 |
|------|-----|
| 逾時 | 10 秒（可調） |
| 重送觸發 | 非 2xx 回應、連線失敗、逾時 |
| 退避 | 指數退避：第 n 次失敗後等 `min(2^n, 60)` 分鐘再送 |
| 最大重試 | 8 次（可調）；超過後標記 `DEAD`，停止重送並在我方後台告警 |
| 掃描頻率 | 我方每 2 分鐘掃描一次待重送佇列 |

即使我方或網路曾中斷，恢復後仍會把積壓的事件補送，因此你**可能在事件發生一段時間後才收到**。請以 payload 內的 `createdAt` / `updatedAt` 為準，勿以收到時間判斷事件新舊。

---

## 6. 接收端最小實作範例（Node.js / Express）

```js
const express = require('express')
const app = express()
app.use(express.json())

const API_KEY = process.env.EVENT_PUSH_API_KEY          // 與 client-web 約定的共用金鑰
const seen = new Set()                                   // 正式環境請改用 DB 唯一鍵

app.post('/api/incidents', (req, res) => {
  // 1) 驗證金鑰
  if (req.header('X-API-Key') !== API_KEY) {
    return res.status(403).json({ error: 'invalid api key' })
  }

  const { eventType, event, change, deliveryId } = req.body

  // 2) 忽略測試 ping
  if (eventType === 'TEST') return res.sendStatus(200)

  // 3) 冪等去重
  if (seen.has(deliveryId)) return res.sendStatus(200)
  seen.add(deliveryId)

  // 4) CREATED 與 STATUS_CHANGED 一律以 event.id 做 upsert（有則更新、無則建立）
  //    STATUS_CHANGED 也帶完整 event，遇未知 id 請直接建立，切勿回 400
  upsertIncident(event)   // key = event.id；內部依 event.status 更新狀態

  // 5) 成功回 2xx（務必，否則我方會重送）
  return res.sendStatus(200)
})

app.listen(3003, () => console.log('incident receiver on :3003'))
```

---

## 7. 對接檢查清單

- [ ] 實作 `POST /api/incidents`，監聽 `:3003`
- [ ] 驗證 `X-API-Key`
- [ ] 用 `deliveryId` 去重
- [ ] 忽略 `eventType=TEST`
- [ ] 一律以 `event.id` **upsert**（有則更新、無則建立）；`STATUS_CHANGED` 遇未知 id **不要回 400**
- [ ] 成功一律回 2xx，且盡量 < 10 秒
- [ ] 提供雙方約定的共用金鑰給 client-web 端填入設定

對接時，client-web 端只要在「設定 → 事件外送」填入你的網址與金鑰、按「測試連線」，即可驗證雙方是否打通。
