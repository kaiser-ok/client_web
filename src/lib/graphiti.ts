/**
 * Graphiti Knowledge Graph Client
 * 用於與 Graphiti Python 服務通信
 */

const GRAPHITI_URL = process.env.GRAPHITI_URL || 'http://localhost:8001'

export interface MessageInput {
  platform: 'SLACK' | 'LINE' | 'EMAIL'
  external_id: string
  content: string
  timestamp?: Date
  sender_id?: string
  sender_name?: string
  sender_email?: string
  channel_id?: string
  channel_name?: string
  thread_id?: string
  reply_to_id?: string
  subject?: string
  partner_id?: string
  metadata?: Record<string, unknown>
}

export interface SearchQuery {
  query: string
  partner_id?: string
  platforms?: string[]
  date_from?: Date
  date_to?: Date
  limit?: number
}

export interface AskQuery {
  question: string
  partner_id?: string
  context_messages?: number
}

export interface SearchResult {
  content: string
  platform: string
  timestamp: string
  sender?: string
  relevance_score: number
}

export interface AskResponse {
  answer: string
  sources: Array<{
    index: number
    content: string
    score: number
  }>
}

// ============================================
// CRM Node Interfaces (Phase 1)
// ============================================

export interface OrganizationInput {
  crm_id: string
  name: string
  aliases?: string[]
  contact?: string
  phone?: string
  email?: string
  website?: string
  jira_label?: string
  odoo_id?: number
  source?: string
  is_active?: boolean
  parent_crm_id?: string
}

export interface PersonInput {
  crm_id: string
  name: string
  email?: string
  phone?: string
  title?: string
  line_user_id?: string
  slack_user_id?: string
  organization_crm_id?: string
}

export interface DealInput {
  crm_id: string
  name: string
  organization_crm_id: string
  project_name?: string
  type?: string
  amount?: number
  sales_rep?: string
  closed_at?: string
  start_date?: string
  end_date?: string
  source?: string
  odoo_id?: number
}

export interface IssueInput {
  crm_id: string
  jira_key: string
  summary: string
  organization_crm_id: string
  status?: string
  priority?: string
  assignee?: string
  waiting_on?: string
}

export interface ProjectInput {
  crm_id: string
  name: string
  organization_crm_id: string
  deal_crm_id?: string
  type?: string
  status?: string
  start_date?: string
  end_date?: string
}

export interface RelationshipInput {
  from_label: string
  from_crm_id: string
  to_label: string
  to_crm_id: string
  rel_type: string
  properties?: Record<string, unknown>
}

export interface Organization360Response {
  organization: Record<string, unknown>
  deals: Record<string, unknown>[]
  issues: Record<string, unknown>[]
  projects: Record<string, unknown>[]
  contacts: Record<string, unknown>[]
  parent: Record<string, unknown> | null
  subsidiaries: Record<string, unknown>[]
}

export interface NetworkResponse {
  nodes: Record<string, unknown>[]
  relationships: Record<string, unknown>[]
}

export interface PersonConnectionsResponse {
  person: Record<string, unknown>
  organizations: Array<{ organization: Record<string, unknown>; role: string | null }>
}

export interface ProductImpactResponse {
  product: Record<string, unknown>
  customers: Array<{ organization: Record<string, unknown>; deal: Record<string, unknown> }>
  relatedIssues: Record<string, unknown>[]
}

export interface GraphPathsResponse {
  nodes: Record<string, unknown>[]
  edges: Record<string, unknown>[]
}

class GraphitiClient {
  private baseUrl: string

  constructor(baseUrl: string = GRAPHITI_URL) {
    this.baseUrl = baseUrl
  }

  /**
   * 健康檢查
   */
  async healthCheck(): Promise<{ status: string; neo4j_connected: boolean }> {
    const response = await fetch(`${this.baseUrl}/health`)
    if (!response.ok) {
      throw new Error('Graphiti service is not healthy')
    }
    return response.json()
  }

  /**
   * 寫入單一訊息到知識圖譜
   */
  async ingestMessage(message: MessageInput): Promise<{ success: boolean; episode_id?: string }> {
    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...message,
        timestamp: message.timestamp?.toISOString() || new Date().toISOString(),
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to ingest message')
    }

    return response.json()
  }

  /**
   * 批量寫入訊息
   */
  async bulkIngest(messages: MessageInput[]): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${this.baseUrl}/messages/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: messages.map(m => ({
          ...m,
          timestamp: m.timestamp?.toISOString() || new Date().toISOString(),
        })),
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to bulk ingest messages')
    }

    return response.json()
  }

  /**
   * 搜尋訊息
   */
  async search(query: SearchQuery): Promise<SearchResult[]> {
    const response = await fetch(`${this.baseUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...query,
        date_from: query.date_from?.toISOString(),
        date_to: query.date_to?.toISOString(),
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Search failed')
    }

    return response.json()
  }

  /**
   * RAG 問答
   */
  async ask(query: AskQuery): Promise<AskResponse> {
    const response = await fetch(`${this.baseUrl}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Ask failed')
    }

    return response.json()
  }

  /**
   * 取得特定客戶的所有訊息
   */
  async getPartnerMessages(
    partnerId: string,
    options?: { limit?: number; platforms?: string[] }
  ): Promise<{ partner_id: string; count: number; messages: Array<{ content: string; created_at: string }> }> {
    const params = new URLSearchParams()
    if (options?.limit) params.append('limit', options.limit.toString())
    if (options?.platforms) params.append('platforms', options.platforms.join(','))

    const response = await fetch(
      `${this.baseUrl}/partner/${partnerId}/messages?${params.toString()}`
    )

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to get partner messages')
    }

    return response.json()
  }

  // ============================================
  // CRM Node Methods (Phase 1)
  // ============================================

  private async upsertNode(nodeType: string, data: object): Promise<{ success: boolean; crm_id: string }> {
    const response = await fetch(`${this.baseUrl}/nodes/${nodeType}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || `Failed to upsert ${nodeType}`)
    }

    return response.json()
  }

  async upsertOrganization(input: OrganizationInput): Promise<{ success: boolean; crm_id: string }> {
    return this.upsertNode('organization', input)
  }

  async upsertPerson(input: PersonInput): Promise<{ success: boolean; crm_id: string }> {
    return this.upsertNode('person', input)
  }

  async upsertDeal(input: DealInput): Promise<{ success: boolean; crm_id: string }> {
    return this.upsertNode('deal', input)
  }

  async upsertIssue(input: IssueInput): Promise<{ success: boolean; crm_id: string }> {
    return this.upsertNode('issue', input)
  }

  async upsertProject(input: ProjectInput): Promise<{ success: boolean; crm_id: string }> {
    return this.upsertNode('project', input)
  }

  async createRelationship(input: RelationshipInput): Promise<{ success: boolean; rel_type: string }> {
    const response = await fetch(`${this.baseUrl}/relationships`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to create relationship')
    }

    return response.json()
  }

  async getOrganization360(crmId: string): Promise<Organization360Response> {
    const response = await fetch(`${this.baseUrl}/organizations/${encodeURIComponent(crmId)}/360`)

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to get organization 360')
    }

    return response.json()
  }

  async getOrganizationNetwork(crmId: string, depth?: number): Promise<NetworkResponse> {
    const params = depth ? `?depth=${depth}` : ''
    const response = await fetch(`${this.baseUrl}/organizations/${encodeURIComponent(crmId)}/network${params}`)

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to get organization network')
    }

    return response.json()
  }

  // ============================================
  // Graph Query Methods (Phase 3)
  // ============================================

  async getPersonConnections(crmId: string): Promise<PersonConnectionsResponse> {
    const response = await fetch(`${this.baseUrl}/persons/${encodeURIComponent(crmId)}/connections`)

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to get person connections')
    }

    return response.json()
  }

  async getProductImpact(name: string): Promise<ProductImpactResponse> {
    const response = await fetch(`${this.baseUrl}/products/${encodeURIComponent(name)}/impact`)

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to get product impact')
    }

    return response.json()
  }

  async findPaths(id1: string, id2: string, maxDepth?: number): Promise<GraphPathsResponse> {
    const response = await fetch(`${this.baseUrl}/graph/paths`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id1, id2, max_depth: maxDepth ?? 5 }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to find paths')
    }

    return response.json()
  }
}

// Export singleton instance
export const graphitiClient = new GraphitiClient()

export default graphitiClient
