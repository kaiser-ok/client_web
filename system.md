下面是截至目前討論的內容，整理成一份可直接丟給 Designer 做 UI/UX 規劃 的需求摘要（以「單一客戶頁面」為核心），同時保留你們的架構假設：Jira Software project 是 Issue 真相來源、你們自研系統是「客戶活動中台」。

⸻

1) 產品定位與目標

目標

讓 Sales / IT / RD 在同一個客戶頁面，能立即回答：
	•	這個客戶最近發生什麼事？（Timeline）
	•	現在有哪些未解決問題？卡在哪？誰要接？（Open Items）
	•	我在外面（手機）也能快速補最新資訊，並能一鍵回寫到 Jira（comment / Next action）

系統分工（重要假設）
	•	Jira = Issue 真相來源（source of truth）：狀態、優先級、指派、comment、workflow
	•	你們系統 = 客戶視角整合層：集中活動、顯示 Open Items 快照、提供快速輸入與回寫捷徑

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

