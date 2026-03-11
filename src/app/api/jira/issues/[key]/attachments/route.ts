import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { jiraClient } from '@/lib/jira'

/**
 * GET /api/jira/issues/[key]/attachments
 * Get attachments for a Jira issue
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { key } = await params

    // Fetch issue with attachment field
    const issue = await jiraClient.getIssue(key)
    const attachments = issue.fields?.attachment || []

    // Filter to only images for preview, but return all attachments
    const result = attachments.map((att: {
      id: string
      filename: string
      mimeType: string
      size: number
      created: string
      author: { displayName: string; emailAddress: string }
      thumbnail?: string
    }) => ({
      id: att.id,
      filename: att.filename,
      mimeType: att.mimeType,
      size: att.size,
      created: att.created,
      author: att.author?.displayName || 'Unknown',
      isImage: att.mimeType?.startsWith('image/'),
      // Use our proxy URL for downloading
      downloadUrl: `/api/jira/attachments/${att.id}`,
    }))

    return NextResponse.json({ attachments: result })
  } catch (error) {
    console.error('Error fetching Jira attachments:', error)
    return NextResponse.json({ error: '取得附件失敗' }, { status: 500 })
  }
}
