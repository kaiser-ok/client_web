/**
 * 專案名稱常以採購/PO 編號開頭（例如 PO#2026060459_教育部及所屬機關…、
 * BA511A300案「新北市政府網路語音系統…」），在表格裡截斷後只會看到一串編號。
 * 這裡把開頭的編號剝掉，讓有限的字數留給真正的描述。
 *
 * 規則刻意保守 —— 寧可少剝也不要誤剝客戶名或品牌名。已對實際資料驗證過
 * KPMG Teams…、原民會-愛部落 MA、MikroTik自強高工案、國網軟體_115年…、
 * 115年雲林縣校園網路設備汰換更新案 等都不會被動到。
 */

// 可視為「編號」的字元集：英數與常見分隔符號，不含中文
const CODE_RE = /^[A-Za-z0-9#.\/()+-]{2,20}$/

export function stripLeadingProjectCode(raw: string): string {
  let s = raw.trim()

  // 最多剝三層（例如 113UB0030_CA315A3131_益實實業…）
  for (let i = 0; i < 3; i++) {
    const before = s

    // 1) 「編號案「描述」」：BA511A300案「新北市… / BA912A5311案_「美商…
    const quoted = s.match(/^([A-Za-z0-9#.\/+-]{2,20})案_?[「『"]\s*/)
    if (quoted) {
      s = s.slice(quoted[0].length)
      continue
    }

    // 2) 編號後接 _ 或 -（同時存在時以 _ 為界，避免把 PO#PP1-2026… 切一半）
    const sep = s.includes('_') ? '_' : s.includes('-') ? '-' : null
    if (sep) {
      const idx = s.indexOf(sep)
      const head = s.slice(0, idx)
      if (CODE_RE.test(head) && s.length > idx + 1) {
        s = s.slice(idx + 1).trim()
        continue
      }
    }

    // 3) PO#xxxx 後接空白（順便吃掉殘留的 for）
    const po = s.match(/^PO#\S+\s+(?:for\s+)?/i)
    if (po) {
      s = s.slice(po[0].length)
      continue
    }

    // 4) 緊貼中文的編號，例如 4DC110199H高雄市政府…
    //    門檻刻意嚴格：至少 6 字、含 3 個以上數字、且要有字母，才不會把
    //    「115年雲林縣…」的 115 或「MikroTik自強高工案」的品牌名剝掉。
    const glued = s.match(/^([A-Za-z0-9]{6,20})(?=[㐀-鿿])/)
    if (glued) {
      const run = glued[1]
      const digits = (run.match(/\d/g) || []).length
      if (digits >= 3 && /[A-Za-z]/.test(run)) {
        s = s.slice(run.length)
        continue
      }
    }

    if (s === before) break
  }

  s = s.replace(/^[「『"\s_-]+/, '').trim()
  // 剝到幾乎沒東西就不要剝了
  return s.length >= 3 ? s : raw.trim()
}
