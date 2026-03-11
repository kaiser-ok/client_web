import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const JIRA_HOST = process.env.JIRA_HOST!
const JIRA_EMAIL = process.env.JIRA_EMAIL!
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN!

/**
 * GET /api/jira/attachments/[id]
 * Proxy endpoint to download Jira attachments with authentication
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { id } = await params

    // Get attachment metadata first
    const credentials = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64')

    const metaResponse = await fetch(`${JIRA_HOST}/rest/api/3/attachment/${id}`, {
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Accept': 'application/json',
      },
    })

    if (!metaResponse.ok) {
      return NextResponse.json({ error: '找不到附件' }, { status: 404 })
    }

    const metadata = await metaResponse.json()
    const contentUrl = metadata.content

    // Download the actual file
    const fileResponse = await fetch(contentUrl, {
      headers: {
        'Authorization': `Basic ${credentials}`,
      },
    })

    if (!fileResponse.ok) {
      return NextResponse.json({ error: '下載失敗' }, { status: 500 })
    }

    const fileBuffer = await fileResponse.arrayBuffer()

    // Return the file with appropriate headers
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': metadata.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(metadata.filename)}"`,
        'Content-Length': String(fileBuffer.byteLength),
      },
    })
  } catch (error) {
    console.error('Error downloading Jira attachment:', error)
    return NextResponse.json({ error: '下載失敗' }, { status: 500 })
  }
}
