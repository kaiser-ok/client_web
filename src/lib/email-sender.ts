import nodemailer from 'nodemailer'
import type { GmailConfig } from '@/types/gmail'

export interface EmailAttachment {
  filename: string
  content: Buffer
  contentType?: string
}

export interface SendEmailOptions {
  to: string[]
  cc?: string[]
  subject: string
  html: string
  attachments?: EmailAttachment[]
}

export interface SendEmailResult {
  success: boolean
  messageId?: string
  error?: string
}

export async function sendEmail(
  options: SendEmailOptions,
  gmailConfig: GmailConfig
): Promise<SendEmailResult> {
  if (!gmailConfig.connected || !gmailConfig.email || !gmailConfig.appPassword) {
    return {
      success: false,
      error: 'Gmail 設定未完成，請先完成 Gmail 設定。',
    }
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: gmailConfig.email,
      pass: gmailConfig.appPassword,
    },
  })

  try {
    const result = await transporter.sendMail({
      from: gmailConfig.email,
      to: options.to.join(', '),
      cc: options.cc?.join(', '),
      subject: options.subject,
      html: options.html,
      attachments: options.attachments?.map(att => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType || 'application/pdf',
      })),
    })

    return {
      success: true,
      messageId: result.messageId,
    }
  } catch (error) {
    console.error('Email sending failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export function generateQuotationEmailHTML(params: {
  quotationNo: string
  projectName?: string
  partnerName: string
  senderName?: string
  customMessage?: string
}): string {
  const { quotationNo, projectName, partnerName, senderName, customMessage } = params

  const defaultMessage = customMessage || `您好，

附上報價單 ${quotationNo}${projectName ? ` - ${projectName}` : ''}，煩請參閱。

如有任何問題，歡迎隨時與我們聯繫。

謝謝！`

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: 'Microsoft JhengHei', 'Noto Sans TC', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: #333;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .greeting {
      margin-bottom: 20px;
    }
    .content {
      white-space: pre-line;
      margin-bottom: 20px;
    }
    .signature {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #eee;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="greeting">
      <strong>${partnerName}</strong> 您好：
    </div>
    <div class="content">${defaultMessage.replace(/\n/g, '<br>')}</div>
    ${senderName ? `<div class="signature">敬祝 商祺<br><br>${senderName}</div>` : ''}
  </div>
</body>
</html>
`
}
