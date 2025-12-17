export interface JiraIssue {
  key: string
  fields: {
    summary: string
    status: {
      name: string
      statusCategory: {
        key: string
        name: string
      }
    }
    priority?: {
      name: string
    }
    assignee?: {
      displayName: string
      emailAddress: string
      avatarUrls?: {
        '48x48': string
      }
    }
    updated: string
    created: string
    duedate?: string
    comment?: {
      comments: JiraComment[]
      total: number
    }
    // Custom fields for Waiting on / Next action
    customfield_waiting_on?: string
    customfield_next_action?: string
  }
}

export interface JiraComment {
  id: string
  author: {
    displayName: string
    emailAddress: string
    avatarUrls?: {
      '48x48': string
    }
  }
  body: string | JiraDocumentBody
  created: string
  updated: string
}

export interface JiraDocumentBody {
  type: 'doc'
  version: number
  content: JiraDocumentContent[]
}

export interface JiraDocumentContent {
  type: string
  content?: Array<{
    type: string
    text?: string
  }>
}

export interface JiraSearchResult {
  issues: JiraIssue[]
  total: number
  startAt: number
  maxResults: number
}

export interface JiraUser {
  accountId: string
  displayName: string
  emailAddress: string
  avatarUrls: {
    '48x48': string
  }
}
