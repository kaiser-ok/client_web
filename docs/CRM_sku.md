步驟一：參考 在Odoo 建立的「標準產品」 (SKU, 在 Odoo 17 中，「Product Code」的正式欄位名稱是 「內部參考 (Internal Reference)」。)
2. 重要注意事項 (本案的串接'mapping')
欄位名稱 (Technical Name): default_code

這是你在開發 CRM 時，API 寫入或讀取時要對應的欄位名稱。

變體 (Variants) 的狀況：

如果你有啟用「產品變體 (Product Variants)」（例如衣服分 S/M/L 號），這個欄位會變成在 「產品變體」 層級定義，每個變體可以有不同的內部參考代碼。

路徑： 產品頁面 > 點擊上方的 「變體 (Variants)」 智慧按鈕 > 進入特定變體設定。

建議
為了讓未來的 CRM 順利對接，建議這個 「內部參考」 欄位設定為 必填 (Required) 且 唯一 (Unique)，這樣可以避免業務或倉管人員不小心建重複，導致抓錯價格或庫存。
目前先不考慮(Variants)

範例：
產品名稱： Audiocodes SIP 授權保固服務
內部參照 (Code)： SRV-MA-AC-SIP (依照上面的編碼原則)
銷售價格： 5,700
產品類型： 服務 (Service) —— 注意：截圖中是「消耗品」，建議改為「服務」，這樣不需要管庫存數量。
步驟二：在 CRM 前端建立「銷售範本」
在你的 CRM 中，業務選擇 SRV-MA-AC-SIP 這個產品時，系統自動帶入一段預設的 「銷售描述 (Sales Description)」，並允許業務修改：
CRM 產品選單： Audiocodes SIP 授權保固服務 (SRV-MA-AC-SIP)
CRM 自動帶入描述（可編輯）：
項目：Audiocodes M800C/M1000B/VE 擴充 10路 SIP 授權保固
期間：第二年起 (業務可改成第三年)
內容：含備品更換服務，以年計算。
步驟三：資料回寫
當 CRM 產生訂單傳回 Odoo 時：
Order Line Product: SRV-MA-AC-SIP (乾淨的代碼)
Order Line Description: Audiocodes M800C...第二年起... (完整的客製化文字)

