import type { QuotationPDFData } from '@/types/company'
import dayjs from 'dayjs'
import fs from 'fs'
import path from 'path'

function formatCurrency(amount: number): string {
  return amount.toLocaleString('zh-TW')
}

function getLogoBase64(logoPath: string): string | null {
  if (!logoPath) return null

  // 如果已經是 http URL，直接返回
  if (logoPath.startsWith('http')) return logoPath

  // 本地檔案路徑
  const fullPath = path.join(process.cwd(), 'public', logoPath)

  try {
    if (fs.existsSync(fullPath)) {
      const imageBuffer = fs.readFileSync(fullPath)
      const ext = path.extname(logoPath).toLowerCase().replace('.', '')
      const mimeType = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png'
      return `data:${mimeType};base64,${imageBuffer.toString('base64')}`
    }
  } catch (error) {
    console.error('Failed to load logo:', error)
  }

  return null
}

function escapeHtml(text: string): string {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br>')
}

export function renderQuotationHTML(data: QuotationPDFData): string {
  const { quotation, partner, items, company } = data

  const subtotal = quotation.totalAmount / (1 + company.taxRate)
  const tax = quotation.totalAmount - subtotal

  const validUntil = quotation.validUntil
    ? dayjs(quotation.validUntil).format('YYYY/MM/DD')
    : dayjs(quotation.createdAt).add(company.validDays, 'day').format('YYYY/MM/DD')

  const hardwareItems = items.filter(
    item =>
      item.category?.includes('硬體') ||
      item.category?.includes('Hardware') ||
      item.category?.toLowerCase().includes('hw-')
  )
  const serviceItems = items.filter(
    item =>
      !item.category?.includes('硬體') &&
      !item.category?.includes('Hardware') &&
      !item.category?.toLowerCase().includes('hw-')
  )

  const allItemsAreServices = hardwareItems.length === 0
  const allItemsAreHardware = serviceItems.length === 0

  const renderItemRows = (itemList: typeof items, startIndex: number) =>
    itemList
      .map(
        (item, idx) => `
      <tr class="${item.description ? 'service-row' : ''}">
        <td class="text-center">${startIndex + idx + 1}</td>
        <td>
          <div class="item-name">${escapeHtml(item.productName)}</div>
          ${item.sku ? `<span class="product-code">${escapeHtml(item.sku)}</span>` : item.productId ? `<span class="product-code">${escapeHtml(item.productId)}</span>` : ''}
        </td>
        <td class="service-description">
          ${item.description ? escapeHtml(item.description) : item.category || '-'}
        </td>
        <td class="text-center">${item.quantity}</td>
        <td class="text-right">${formatCurrency(item.unitPrice)}</td>
        <td class="text-right">${formatCurrency(item.subtotal)}</td>
      </tr>
    `
      )
      .join('')

  const logoUrl = getLogoBase64(company.logoPath)

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>報價單 ${quotation.quotationNo}</title>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&display=swap" rel="stylesheet">
    <style>
        body {
            font-family: 'Noto Sans TC', Arial, sans-serif;
            background-color: #fff;
            margin: 0;
            padding: 0;
            color: #333;
            font-size: 14px;
        }

        .a4-container {
            background-color: #fff;
            width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            padding: 15mm 20mm;
            box-sizing: border-box;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 30px;
            border-bottom: 2px solid #0056b3;
            padding-bottom: 20px;
        }
        .logo-img {
            max-width: 180px;
            max-height: 60px;
            object-fit: contain;
        }
        .logo-placeholder {
            width: 150px;
            height: 50px;
            background-color: #e9ecef;
            color: #666;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            border: 1px dashed #ccc;
        }
        .document-title {
            font-size: 28px;
            font-weight: 700;
            color: #0056b3;
            text-align: right;
        }

        .info-section {
            display: flex;
            justify-content: space-between;
            margin-bottom: 40px;
            font-size: 14px;
        }
        .info-box {
            width: 48%;
        }
        .info-box h3 {
            font-size: 16px;
            color: #0056b3;
            margin-bottom: 10px;
            border-bottom: 1px solid #eee;
            padding-bottom: 5px;
        }
        .info-box p { margin: 5px 0; line-height: 1.5; }
        .info-label { font-weight: 500; color: #555; display: inline-block; width: 70px;}

        .section-header {
            background-color: #f0f7ff;
            padding: 10px 15px;
            font-weight: 700;
            font-size: 16px;
            border-left: 5px solid #0056b3;
            margin-top: 30px;
            margin-bottom: 10px;
            color: #333;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }

        .quote-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
        }
        .quote-table th {
            text-align: left;
            border-bottom: 2px solid #ddd;
            padding: 12px 10px;
            font-size: 14px;
            background-color: #fafafa;
            color: #555;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        .quote-table td {
            padding: 12px 10px;
            border-bottom: 1px solid #eee;
            vertical-align: top;
            font-size: 14px;
        }

        .item-name { font-weight: 500; font-size: 15px; }
        .product-code { font-size: 12px; color: #999; display: block; margin-top: 4px; }
        .service-description { line-height: 1.6; color: #555; }
        .service-row td { padding-top: 15px; padding-bottom: 15px; }

        .text-right { text-align: right; }
        .text-center { text-align: center; }

        .totals-section {
            float: right;
            width: 40%;
            margin-top: 30px;
            text-align: right;
        }
        .totals-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 15px;}
        .totals-row.grand-total {
            font-size: 20px;
            font-weight: 700;
            color: #0056b3;
            border-top: 2px solid #ddd;
            padding-top: 15px;
            margin-top: 15px;
        }

        .footer {
            clear: both;
            margin-top: 60px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            font-size: 12px;
            color: #666;
            page-break-inside: avoid;
        }
        .footer h4 { margin-bottom: 10px; color: #333; }
        .footer ol { margin-left: 20px; padding: 0; line-height: 1.8; }
        .signature-area {
            margin-top: 50px;
            display: flex;
            justify-content: flex-end;
        }
        .signature-box {
            width: 250px;
            border-top: 1px solid #333;
            text-align: center;
            padding-top: 10px;
            font-weight: bold;
        }

        @media print {
            body { background-color: #fff; padding: 0; }
            .a4-container { width: 100%; margin: 0; padding: 15mm; box-shadow: none; border: none; }
            .section-header, .quote-table th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
    </style>
</head>
<body>

<div class="a4-container">
    <header class="header">
        <div>
            ${
              company.logoPath
                ? `<img src="${logoUrl}" alt="Company Logo" class="logo-img" />`
                : `<div class="logo-placeholder">LOGO</div>`
            }
        </div>
        <div style="text-align: right;">
            <div class="document-title">報價單 QUOTATION</div>
        </div>
    </header>

    <section class="info-section">
        <div class="info-box">
            <p><strong>${escapeHtml(company.name) || '[公司名稱]'}</strong></p>
            ${company.address ? `<p><span class="info-label">地址:</span>${escapeHtml(company.address)}</p>` : ''}
            ${company.contactPerson ? `<p><span class="info-label">聯絡人:</span>${escapeHtml(company.contactPerson)}${company.contactTitle ? ` (${escapeHtml(company.contactTitle)})` : ''}</p>` : ''}
            ${company.phone ? `<p><span class="info-label">電話:</span>${escapeHtml(company.phone)}</p>` : ''}
            ${company.email ? `<p><span class="info-label">Email:</span>${escapeHtml(company.email)}</p>` : ''}
        </div>
        <div class="info-box" style="text-align: right;">
            <p><strong>${escapeHtml(partner.name)}</strong></p>
            ${partner.contact ? `<p><span class="info-label">聯絡人:</span>${escapeHtml(partner.contact)}</p>` : ''}
            <p><span class="info-label">單號:</span>${escapeHtml(quotation.quotationNo)}</p>
            <p><span class="info-label">日期:</span>${dayjs(quotation.createdAt).format('YYYY/MM/DD')}</p>
            <p><span class="info-label">有效期:</span>${validUntil}</p>
        </div>
    </section>

    ${
      !allItemsAreServices && hardwareItems.length > 0
        ? `
    <div class="section-header">${serviceItems.length > 0 ? 'A. ' : ''}基礎設施與硬體設備 (Infrastructure & Hardware)</div>
    <table class="quote-table">
        <thead>
            <tr>
                <th width="5%" class="text-center">#</th>
                <th width="25%">品項</th>
                <th width="40%">規格說明</th>
                <th width="10%" class="text-center">數量</th>
                <th width="10%" class="text-right">單價</th>
                <th width="10%" class="text-right">總價</th>
            </tr>
        </thead>
        <tbody>
            ${renderItemRows(hardwareItems, 0)}
        </tbody>
    </table>
    `
        : ''
    }

    ${
      !allItemsAreHardware && serviceItems.length > 0
        ? `
    <div class="section-header">${hardwareItems.length > 0 ? 'B. ' : ''}軟體授權與專業服務 (Software & Professional Services)</div>
    <table class="quote-table">
        <thead>
            <tr>
                <th width="5%" class="text-center">#</th>
                <th width="25%">品項</th>
                <th width="40%">服務說明</th>
                <th width="10%" class="text-center">數量</th>
                <th width="10%" class="text-right">單價</th>
                <th width="10%" class="text-right">總價</th>
            </tr>
        </thead>
        <tbody>
            ${renderItemRows(serviceItems, hardwareItems.length)}
        </tbody>
    </table>
    `
        : ''
    }

    ${
      allItemsAreServices && allItemsAreHardware
        ? `
    <div class="section-header">報價項目</div>
    <table class="quote-table">
        <thead>
            <tr>
                <th width="5%" class="text-center">#</th>
                <th width="25%">品項</th>
                <th width="40%">說明</th>
                <th width="10%" class="text-center">數量</th>
                <th width="10%" class="text-right">單價</th>
                <th width="10%" class="text-right">總價</th>
            </tr>
        </thead>
        <tbody>
            ${renderItemRows(items, 0)}
        </tbody>
    </table>
    `
        : ''
    }

    <section class="totals-section">
        <div class="totals-row">
            <span>未稅總計 (Subtotal):</span>
            <span>NT$ ${formatCurrency(Math.round(subtotal))}</span>
        </div>
        <div class="totals-row">
            <span>營業稅 (Tax ${(company.taxRate * 100).toFixed(0)}%):</span>
            <span>NT$ ${formatCurrency(Math.round(tax))}</span>
        </div>
        <div class="totals-row grand-total">
            <span>總金額 (Grand Total):</span>
            <span>NT$ ${formatCurrency(Math.round(quotation.totalAmount))}</span>
        </div>
    </section>

    <footer class="footer">
        <h4>備註與條款 (Terms & Conditions):</h4>
        <ol>
            ${company.defaultTerms.map(term => `<li>${escapeHtml(term)}</li>`).join('')}
            ${
              company.bankInfo.bankName
                ? `<li><strong>匯款資訊：</strong>${escapeHtml(company.bankInfo.bankName)} (${escapeHtml(company.bankInfo.bankCode)}) ${escapeHtml(company.bankInfo.branchName)} / 帳號：${escapeHtml(company.bankInfo.accountNumber)} / 戶名：${escapeHtml(company.bankInfo.accountName)}。</li>`
                : ''
            }
            <li>本報價單內容若蒙 貴客戶接受，請於下方簽章欄簽名確認後回傳，即視為正式訂單。</li>
        </ol>

        ${quotation.notes ? `<p style="margin-top: 15px;"><strong>附註：</strong>${escapeHtml(quotation.notes)}</p>` : ''}

        <div class="signature-area">
            <div class="signature-box">
                客戶確認簽章 (Client Signature)
            </div>
        </div>
    </footer>

</div>

</body>
</html>`
}
