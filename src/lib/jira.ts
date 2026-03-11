import { JiraIssue, JiraSearchResult, JiraComment } from '@/types/jira'

const JIRA_HOST = process.env.JIRA_HOST!
const JIRA_EMAIL = process.env.JIRA_EMAIL!
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN!

const getAuthHeader = () => {
  const credentials = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64')
  return `Basic ${credentials}`
}

const jiraFetch = async (endpoint: string, options: RequestInit = {}) => {
  const url = `${JIRA_HOST}/rest/api/3${endpoint}`
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': getAuthHeader(),
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Jira API error: ${response.status} - ${error}`)
  }

  // Handle 204 No Content responses
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return null
  }

  const text = await response.text()
  if (!text) {
    return null
  }

  return JSON.parse(text)
}

export const jiraClient = {
  /**
   * Search for issues using JQL (using /search/jql endpoint with POST)
   */
  async searchIssues(jql: string, fields?: string[], maxResults = 50): Promise<JiraSearchResult> {
    const defaultFields = [
      'summary',
      'status',
      'priority',
      'assignee',
      'updated',
      'created',
      'duedate',
      'comment',
      'attachment',
    ]

    // Use POST method for /search/jql endpoint (more reliable for complex JQL)
    const response = await jiraFetch('/search/jql', {
      method: 'POST',
      body: JSON.stringify({
        jql,
        fields: fields || defaultFields,
        maxResults,
      }),
    })

    return response as JiraSearchResult
  },

  /**
   * Get issues for a specific project
   */
  async getProjectIssues(projectKey: string, statusFilter?: string[]): Promise<JiraIssue[]> {
    let jql = `project = ${projectKey}`

    if (statusFilter && statusFilter.length > 0) {
      jql += ` AND status IN (${statusFilter.map(s => `"${s}"`).join(', ')})`
    }

    jql += ' ORDER BY updated DESC'

    const result = await this.searchIssues(jql)
    return result.issues
  },

  /**
   * Get open issues for a project (not Done/Closed)
   */
  async getOpenIssues(projectKey: string): Promise<JiraIssue[]> {
    const jql = `project = ${projectKey} AND statusCategory != Done ORDER BY updated DESC`
    const result = await this.searchIssues(jql)
    return result.issues
  },

  /**
   * Get a single issue by key
   */
  async getIssue(issueKey: string): Promise<JiraIssue> {
    return await jiraFetch(`/issue/${issueKey}?fields=*all&expand=renderedFields`)
  },

  /**
   * Get comments for an issue
   */
  async getIssueComments(issueKey: string): Promise<JiraComment[]> {
    const response = await jiraFetch(`/issue/${issueKey}/comment`)
    return response.comments || []
  },

  /**
   * Add a comment to an issue
   */
  async addComment(issueKey: string, body: string): Promise<JiraComment> {
    return await jiraFetch(`/issue/${issueKey}/comment`, {
      method: 'POST',
      body: JSON.stringify({
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: body,
                },
              ],
            },
          ],
        },
      }),
    })
  },

  /**
   * Create a new issue
   */
  async createIssue(fields: {
    project: { key: string }
    summary: string
    description?: unknown
    issuetype: { name: string }
    priority?: { name: string }
    labels?: string[]
    [key: string]: unknown
  }): Promise<{ id: string; key: string; self: string }> {
    return await jiraFetch('/issue', {
      method: 'POST',
      body: JSON.stringify({ fields }),
    })
  },

  /**
   * Update issue fields
   */
  async updateIssue(issueKey: string, fields: Record<string, unknown>): Promise<void> {
    await jiraFetch(`/issue/${issueKey}`, {
      method: 'PUT',
      body: JSON.stringify({ fields }),
    })
  },

  /**
   * Get all transitions for an issue
   */
  async getTransitions(issueKey: string): Promise<Array<{ id: string; name: string }>> {
    const response = await jiraFetch(`/issue/${issueKey}/transitions`)
    return response.transitions
  },

  /**
   * Transition an issue to a new status
   */
  async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
    await jiraFetch(`/issue/${issueKey}/transitions`, {
      method: 'POST',
      body: JSON.stringify({
        transition: { id: transitionId },
      }),
    })
  },
}

/**
 * Extract plain text from Jira document format
 */
export function extractTextFromJiraBody(body: string | { type: string; content?: unknown[] }): string {
  if (typeof body === 'string') {
    return body
  }

  if (body.type === 'doc' && body.content) {
    return extractTextFromContent(body.content)
  }

  return ''
}

function extractTextFromContent(content: unknown[]): string {
  let text = ''

  for (const item of content) {
    if (typeof item === 'object' && item !== null) {
      const node = item as { type: string; text?: string; content?: unknown[] }

      if (node.type === 'text' && node.text) {
        text += node.text
      } else if (node.content) {
        text += extractTextFromContent(node.content)
      }

      if (node.type === 'paragraph') {
        text += '\n'
      }
    }
  }

  return text.trim()
}

export default jiraClient
