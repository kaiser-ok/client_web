import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createSlackClient, getTimeRange } from '@/lib/slack'
import { extractSlackEventsV2, SlackEventV2 } from '@/lib/llm'

// 定義哪些分類要放入時間軸（Activity），其他放入技術文件（TechnicalNote）
const TIMELINE_CATEGORIES = ['business', 'support', 'incident', 'logistics'] as const
// 這些分類會被忽略，不儲存
const IGNORED_CATEGORIES = ['system_notice', 'casual'] as const

/**
 * 將時間範圍分割成多個批次（每批次 30 天）
 */
function splitTimeRange(
  oldestTs: number,
  latestTs: number,
  batchDays: number = 30
): Array<{ oldest: string; latest: string; label: string }> {
  const batches: Array<{ oldest: string; latest: string; label: string }> = []
  const batchSeconds = batchDays * 24 * 60 * 60

  let currentLatest = latestTs
  while (currentLatest > oldestTs) {
    const currentOldest = Math.max(currentLatest - batchSeconds, oldestTs)
    const startDate = new Date(currentOldest * 1000)
    const endDate = new Date(currentLatest * 1000)

    batches.push({
      oldest: currentOldest.toString(),
      latest: currentLatest.toString(),
      label: `${startDate.toLocaleDateString('zh-TW')} ~ ${endDate.toLocaleDateString('zh-TW')}`,
    })

    currentLatest = currentOldest
  }

  // 反轉讓舊的批次先處理
  return batches.reverse()
}

/**
 * POST /api/slack/summarize
 * 彙整 Slack 頻道對話並儲存為多筆活動記錄
 *
 * 參數：
 * - partnerId: 客戶 ID
 * - days: 往回抓取天數（預設 30，最大 365）
 * - force: 是否強制重新同步（會忽略上次同步時間）
 * - batchDays: 每批次處理天數（預設 30）
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    if (!process.env.SLACK_BOT_TOKEN) {
      return NextResponse.json(
        { error: 'Slack 尚未設定，請先設定 SLACK_BOT_TOKEN' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const {
      partnerId,
      days = 30,
      force = false,
      batchDays = 30,
    } = body

    // 限制最大天數
    const actualDays = Math.min(days, 365)

    if (!partnerId) {
      return NextResponse.json({ error: '請指定客戶 ID' }, { status: 400 })
    }

    // 取得客戶資料
    const customer = await prisma.partner.findUnique({
      where: { id: partnerId },
    })

    if (!customer) {
      return NextResponse.json({ error: '找不到客戶' }, { status: 404 })
    }

    if (!customer.slackChannelId) {
      return NextResponse.json(
        { error: '此客戶尚未設定 Slack 頻道' },
        { status: 400 }
      )
    }

    // 查詢該客戶最後一筆 SLACK 活動的時間
    let syncFromTimestamp: string | undefined

    if (!force) {
      const lastSlackActivity = await prisma.activity.findFirst({
        where: {
          partnerId,
          source: 'SLACK',
          slackTimestamp: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        select: { slackTimestamp: true, createdAt: true },
      })

      if (lastSlackActivity?.slackTimestamp) {
        // 從最後同步的訊息時間之後開始（加 1 秒避免重複）
        const lastTs = parseFloat(lastSlackActivity.slackTimestamp)
        if (!isNaN(lastTs)) {
          syncFromTimestamp = (lastTs + 1).toString()
        }
      }
    }

    // 計算時間範圍
    const slack = createSlackClient()
    const { oldest: defaultOldest, latest } = getTimeRange(actualDays)

    // 使用較新的時間作為起點（上次同步時間 或 days 天前）
    const oldestTs = syncFromTimestamp
      ? Math.max(parseFloat(syncFromTimestamp), parseFloat(defaultOldest))
      : parseFloat(defaultOldest)
    const latestTs = parseFloat(latest)

    // 計算跳過的天數資訊
    const skippedInfo = syncFromTimestamp ? {
      lastSyncTime: new Date(parseFloat(syncFromTimestamp) * 1000).toLocaleString('zh-TW'),
      syncingFrom: new Date(oldestTs * 1000).toLocaleString('zh-TW'),
    } : null

    // 分批處理
    const batches = splitTimeRange(oldestTs, latestTs, batchDays)

    let totalMessageCount = 0
    let totalEventCount = 0
    let timelineCount = 0      // 放入時間軸的數量
    let technicalNoteCount = 0 // 放入技術文件的數量
    let ignoredCount = 0       // 被忽略的數量
    const allActivities: Array<{ id: string; title: string; tags: string[]; eventDate: Date | null }> = []
    const allTechnicalNotes: Array<{ id: string; title: string; category: string }> = []
    const batchResults: Array<{ label: string; messageCount: number; eventCount: number }> = []

    for (const batch of batches) {
      // 取得這個批次的訊息
      const messages = await slack.getChannelMessagesWithUserNames(
        customer.slackChannelId,
        { oldest: batch.oldest, latest: batch.latest, limit: 500 }
      )

      if (messages.length === 0) {
        batchResults.push({ label: batch.label, messageCount: 0, eventCount: 0 })
        continue
      }

      totalMessageCount += messages.length

      // 使用 LLM 提取事件（V2 版本，包含更詳細的分類）
      let events: SlackEventV2[] = []
      try {
        events = await extractSlackEventsV2(messages, customer.name)
      } catch (err) {
        console.error(`Batch ${batch.label} LLM error:`, err)
        // 繼續處理下一批
        batchResults.push({ label: batch.label, messageCount: messages.length, eventCount: 0 })
        continue
      }

      if (events.length === 0) {
        batchResults.push({ label: batch.label, messageCount: messages.length, eventCount: 0 })
        continue
      }

      totalEventCount += events.length

      // 根據分類決定儲存位置
      for (const event of events) {
        const categoryLower = event.category.toLowerCase()

        // 忽略的分類
        if (IGNORED_CATEGORIES.includes(categoryLower as typeof IGNORED_CATEGORIES[number])) {
          ignoredCount++
          continue
        }

        // 時間軸分類 → 存入 Activity
        if (TIMELINE_CATEGORIES.includes(categoryLower as typeof TIMELINE_CATEGORIES[number])) {
          const activity = await prisma.activity.create({
            data: {
              partnerId,
              source: 'SLACK',
              title: event.title,
              content: event.content,
              tags: ['slack', event.category, ...(event.keywords || [])],
              slackTimestamp: event.slackTimestamp,
              eventDate: event.eventDate ? new Date(event.eventDate) : null,
              createdBy: session.user!.email!,
            },
          })
          timelineCount++
          allActivities.push({
            id: activity.id,
            title: activity.title,
            tags: activity.tags,
            eventDate: activity.eventDate,
          })
        } else {
          // 其他分類（技術討論等） → 存入 TechnicalNote
          try {
            const note = await prisma.technicalNote.create({
              data: {
                partnerId,
                category: categoryLower,
                title: event.title,
                content: event.content,
                participants: event.participants || [],
                keywords: event.keywords || [],
                slackChannel: customer.slackChannelId,
                slackTimestamp: event.slackTimestamp,
              },
            })
            technicalNoteCount++
            allTechnicalNotes.push({
              id: note.id,
              title: note.title,
              category: note.category,
            })
          } catch (err) {
            // 可能是重複的 slackTimestamp，忽略
            console.warn('Skip duplicate technical note:', event.slackTimestamp)
          }
        }
      }

      batchResults.push({
        label: batch.label,
        messageCount: messages.length,
        eventCount: events.length,
      })
    }

    if (totalMessageCount === 0) {
      return NextResponse.json({
        success: true,
        message: skippedInfo
          ? `自 ${skippedInfo.lastSyncTime} 之後沒有新對話`
          : '此期間沒有對話記錄',
        messageCount: 0,
        eventCount: 0,
        skippedInfo,
      })
    }

    return NextResponse.json({
      success: true,
      messageCount: totalMessageCount,
      eventCount: totalEventCount,
      timelineCount,      // 放入時間軸的數量
      technicalNoteCount, // 放入技術文件的數量
      ignoredCount,       // 被忽略的數量
      skippedInfo,
      isIncremental: !!skippedInfo,
      batchCount: batches.length,
      batchResults,
      activities: allActivities,
      technicalNotes: allTechnicalNotes,
    })
  } catch (error) {
    console.error('Slack summarize error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '彙整失敗' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/slack/summarize
 * 預覽 Slack 對話（不儲存）
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    if (!process.env.SLACK_BOT_TOKEN) {
      return NextResponse.json(
        { error: 'Slack 尚未設定' },
        { status: 400 }
      )
    }

    const { searchParams } = new URL(request.url)
    const partnerId = searchParams.get('partnerId')
    const days = parseInt(searchParams.get('days') || '30')

    if (!partnerId) {
      return NextResponse.json({ error: '請指定客戶 ID' }, { status: 400 })
    }

    const customer = await prisma.partner.findUnique({
      where: { id: partnerId },
    })

    if (!customer) {
      return NextResponse.json({ error: '找不到客戶' }, { status: 404 })
    }

    if (!customer.slackChannelId) {
      return NextResponse.json(
        { error: '此客戶尚未設定 Slack 頻道' },
        { status: 400 }
      )
    }

    const slack = createSlackClient()
    const { oldest, latest } = getTimeRange(days)

    const messages = await slack.getChannelMessagesWithUserNames(
      customer.slackChannelId,
      { oldest, latest, limit: 50 }
    )

    return NextResponse.json({
      channelId: customer.slackChannelId,
      messageCount: messages.length,
      messages: messages.slice(0, 20), // 預覽只返回前 20 則
      days,
    })
  } catch (error) {
    console.error('Slack preview error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '取得訊息失敗' },
      { status: 500 }
    )
  }
}
