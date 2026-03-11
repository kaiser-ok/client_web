import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { chatCompletion } from '@/lib/llm'
import prisma from '@/lib/prisma'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

/**
 * POST /api/transcriptions/summarize
 * 使用 LLM 對轉錄文字產生摘要，並可選擇存檔為客戶活動
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { transcript, action, partnerId, title, summary, keyPoints, actionItems, format } = body

    // === Action: summarize ===
    if (action === 'summarize') {
      if (!transcript) {
        return NextResponse.json({ error: '缺少轉錄文字' }, { status: 400 })
      }

      // 取得客戶上下文資訊（若有選擇客戶）
      let customerContext = ''
      if (partnerId) {
        try {
          const partner = await prisma.partner.findUnique({
            where: { id: partnerId },
            select: { name: true, aliases: true },
          })
          if (partner) {
            const names = [partner.name, ...(partner.aliases || [])].filter(Boolean)
            customerContext = `\n\n客戶相關資訊：
- 客戶名稱：${names.join('、')}
請在摘要中使用正確的客戶名稱（若逐字稿中有提及）。`
          }
        } catch {
          // ignore
        }
      }

      // 根據摘要格式選擇不同的 prompt
      const systemPrompt = buildSummaryPrompt(format || 'meeting', customerContext)

      const result = await chatCompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `以下是會議逐字稿：\n\n${transcript}` },
        ],
        { maxTokens: 2000, temperature: 0.3 }
      )

      // 嘗試解析 JSON
      let parsed
      try {
        const cleaned = result.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
        parsed = JSON.parse(cleaned)
      } catch {
        parsed = {
          title: '會議記錄',
          summary: result,
          keyPoints: [],
          actionItems: [],
          participants: [],
        }
      }

      return NextResponse.json({ success: true, ...parsed })
    }

    // === Action: save ===
    if (action === 'save') {
      if (!partnerId) {
        return NextResponse.json({ error: '請選擇客戶' }, { status: 400 })
      }

      const createdBy = session.user?.email || 'system'
      let transcriptFilePath: string | null = null

      // 逐字稿存到客戶檔案區
      if (transcript) {
        try {
          const partner = await prisma.partner.findUnique({
            where: { id: partnerId },
            select: { name: true },
          })
          const config = await prisma.systemConfig.findUnique({
            where: { key: 'FILE_STORAGE_ROOT_PATH' },
          })

          if (partner && config?.value) {
            const rootPath = config.value
            const partnerDir = partner.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim()
            const currentYear = new Date().getFullYear()
            const targetDir = path.join(rootPath, partnerDir, currentYear.toString(), '會議記錄')
            await mkdir(targetDir, { recursive: true })

            const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
            const filename = `${(title || '會議記錄').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')}_${ts}.txt`
            const filePath = path.join(targetDir, filename)
            const storedPath = `會議記錄/${filename}`

            await writeFile(filePath, transcript, 'utf-8')

            // 建立檔案記錄
            await prisma.partnerFile.create({
              data: {
                partnerId,
                year: currentYear,
                filename,
                storedPath,
                fileSize: Buffer.byteLength(transcript, 'utf-8'),
                mimeType: 'text/plain',
                source: 'MANUAL',
                uploadedBy: createdBy,
              },
            })

            transcriptFilePath = storedPath
          }
        } catch (err) {
          console.error('Failed to save transcript file:', err)
          // 不阻擋活動建立
        }
      }

      // 活動內容只存摘要
      const contentParts: string[] = []
      if (summary) contentParts.push(`## 摘要\n${summary}`)
      if (keyPoints?.length > 0) {
        contentParts.push(`## 重點\n${keyPoints.map((p: string) => `- ${p}`).join('\n')}`)
      }
      if (actionItems?.length > 0) {
        contentParts.push(`## 待辦事項\n${actionItems.map((a: string) => `- ${a}`).join('\n')}`)
      }
      if (transcriptFilePath) {
        contentParts.push(`> 逐字稿已存檔至客戶檔案區：\`${transcriptFilePath}\``)
      }

      const activity = await prisma.activity.create({
        data: {
          partnerId,
          source: 'MEETING',
          title: title || '會議記錄',
          content: contentParts.join('\n\n'),
          tags: ['會議記錄', 'ASR'],
          createdBy,
        },
      })

      return NextResponse.json({
        success: true,
        activityId: activity.id,
        transcriptFilePath,
      }, { status: 201 })
    }

    return NextResponse.json({ error: '未知的 action' }, { status: 400 })
  } catch (error) {
    console.error('Transcription summarize error:', error)
    return NextResponse.json({ error: '處理失敗' }, { status: 500 })
  }
}

/**
 * 根據摘要格式產生不同的 system prompt
 */
function buildSummaryPrompt(format: string, customerContext: string): string {
  const base = '你是一個專業的商務會議記錄助理。請以繁體中文回覆，僅輸出 JSON，不要加其他文字。'

  if (format === 'brief') {
    return `${base}

請根據會議逐字稿，產生 100 字以內的精簡摘要。
嚴格按照以下 JSON 格式輸出：

{
  "title": "會議主題（簡短一句話）",
  "summary": "100字以內的精簡摘要，涵蓋最核心的重點",
  "keyPoints": [],
  "actionItems": [],
  "participants": []
}${customerContext}`
  }

  if (format === 'detailed') {
    return `${base}

請根據會議逐字稿，產生完整詳細的會議記錄。
嚴格按照以下 JSON 格式輸出：

{
  "title": "會議主題（簡短一句話）",
  "summary": "會議摘要（3-5句話詳細概述會議內容與背景）",
  "keyPoints": ["詳細重點1（含說明）", "詳細重點2（含說明）", "...儘量完整列出所有討論要點"],
  "actionItems": ["待辦事項1 - 負責人 - 預計完成時間", "待辦事項2 - 負責人 - 預計完成時間"],
  "participants": ["參與者1（角色/職稱）", "參與者2（角色/職稱）"]
}

注意：
- 重點儘量完整，不要遺漏重要討論內容
- 待辦事項需包含負責人與預計完成時間（若可辨識）
- 參與者需標註角色或職稱（若可辨識）
- 若無法辨識參與者姓名，可使用 Speaker 1、Speaker 2 等標記${customerContext}`
  }

  // default: meeting format
  return `${base}

請根據會議逐字稿，產生包含結論與追蹤項目的會議摘要。
嚴格按照以下 JSON 格式輸出：

{
  "title": "會議主題（簡短一句話）",
  "summary": "會議摘要（2-3句話概述會議重點與結論）",
  "keyPoints": ["會議結論/決議1", "會議結論/決議2", "會議結論/決議3"],
  "actionItems": ["追蹤項目1 - 負責人", "追蹤項目2 - 負責人"],
  "participants": ["參與者1", "參與者2"]
}

注意：
- keyPoints 請聚焦在「結論」與「決議」，而非討論過程
- actionItems 請列出需要追蹤的後續事項，包含負責人（若可辨識）
- 若無法辨識參與者姓名，可使用 Speaker 1、Speaker 2 等標記${customerContext}`
}
