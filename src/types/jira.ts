export interface JiraAttachment {
  id: string
  filename: string
  mimeType: string
  size: number
  content: string  // URL to download the attachment
  thumbnail?: string  // URL to thumbnail (for images)
  created: string
  author: {
    displayName: string
    emailAddress: string
  }
}

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
    resolutiondate?: string
    issuetype?: {
      name: string
    }
    comment?: {
      comments: JiraComment[]
      total: number
    }
    attachment?: JiraAttachment[]
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
  // Legacy fields (deprecated API)
  total?: number
  startAt?: number
  maxResults?: number
  // New /search/jql API fields
  nextPageToken?: string
  isLast?: boolean
}

export interface JiraUser {
  accountId: string
  displayName: string
  emailAddress: string
  avatarUrls: {
    '48x48': string
  }
}
