import puppeteer from 'puppeteer'
import type { QuotationPDFData } from '@/types/company'
import { renderQuotationHTML } from '@/templates/quotation-pdf'

export async function generateQuotationPDF(data: QuotationPDFData): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  })

  try {
    const page = await browser.newPage()

    const html = renderQuotationHTML(data)

    await page.setContent(html, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    })

    await page.emulateMediaType('print')

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0mm',
        right: '0mm',
        bottom: '0mm',
        left: '0mm',
      },
      preferCSSPageSize: true,
    })

    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
