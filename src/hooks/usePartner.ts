import useSWR from 'swr'
import {
  Partner,
  PartnerWithRelations,
  PartnerRoleType,
  CreatePartnerInput,
  UpdatePartnerInput,
  CreatePartnerRoleInput,
  UpdatePartnerRoleInput,
} from '@/types/partner'

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || 'API 請求失敗')
  }
  return res.json()
}

// ============================================
// Response Types
// ============================================

interface PartnersResponse {
  partners: PartnerWithRelations[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

interface PartnerRoleItem {
  id: string
  partnerId: string
  role: PartnerRoleType
  isPrimary: boolean
  metadata?: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

// ============================================
// Query Options
// ============================================

interface UsePartnersOptions {
  search?: string
  page?: number
  pageSize?: number
  sortField?: string
  sortOrder?: 'asc' | 'desc'
  roles?: PartnerRoleType[]
  isActive?: boolean
  hasOdooId?: boolean
}

// ============================================
// Hooks
// ============================================

/**
 * Fetch partners with optional filtering
 */
export function usePartners(options: UsePartnersOptions = {}) {
  const {
    search,
    page = 1,
    pageSize = 20,
    sortField,
    sortOrder,
    roles,
    isActive,
    hasOdooId,
  } = options

  const params = new URLSearchParams()
  if (search) params.set('search', search)
  params.set('page', page.toString())
  params.set('pageSize', pageSize.toString())
  if (sortField) params.set('sortField', sortField)
  if (sortOrder) params.set('sortOrder', sortOrder)
  if (roles && roles.length > 0) params.set('roles', roles.join(','))
  if (isActive !== undefined) params.set('isActive', isActive.toString())
  if (hasOdooId !== undefined) params.set('hasOdooId', hasOdooId.toString())

  const { data, error, isLoading, mutate } = useSWR<PartnersResponse>(
    `/api/partners?${params.toString()}`,
    fetcher
  )

  return {
    partners: data?.partners || [],
    total: data?.total || 0,
    page: data?.page || page,
    pageSize: data?.pageSize || pageSize,
    totalPages: data?.totalPages || 0,
    isLoading,
    isError: error,
    mutate,
  }
}

/**
 * Fetch a single partner by ID
 */
export function usePartner(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<PartnerWithRelations>(
    id ? `/api/partners/${id}` : null,
    fetcher
  )

  return {
    partner: data,
    isLoading,
    isError: error,
    mutate,
  }
}

/**
 * Fetch partner roles
 */
export function usePartnerRoles(partnerId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<PartnerRoleItem[]>(
    partnerId ? `/api/partners/${partnerId}/roles` : null,
    fetcher
  )

  return {
    roles: data || [],
    isLoading,
    isError: error,
    mutate,
  }
}

// ============================================
// CRUD Functions
// ============================================

/**
 * Create a new partner
 */
export async function createPartner(data: CreatePartnerInput): Promise<Partner> {
  const response = await fetch('/api/partners', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || '建立 Partner 失敗')
  }

  return response.json()
}

/**
 * Update a partner
 */
export async function updatePartner(
  id: string,
  data: UpdatePartnerInput
): Promise<Partner> {
  const response = await fetch(`/api/partners/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || '更新 Partner 失敗')
  }

  return response.json()
}

/**
 * Delete a partner
 * @param force - If true, delete even if partner has related records
 */
export async function deletePartner(
  id: string,
  force = false
): Promise<{ success: boolean }> {
  const url = force ? `/api/partners/${id}?force=true` : `/api/partners/${id}`
  const response = await fetch(url, {
    method: 'DELETE',
  })

  if (!response.ok) {
    const error = await response.json()
    // Check if confirmation is required
    if (error.requireConfirmation) {
      throw Object.assign(
        new Error(error.error || '此 Partner 有關聯記錄，確定要刪除嗎？'),
        { requireConfirmation: true, counts: error.counts }
      )
    }
    throw new Error(error.error || '刪除 Partner 失敗')
  }

  return response.json()
}

// ============================================
// Role Management Functions
// ============================================

/**
 * Add a role to a partner
 */
export async function addPartnerRole(
  partnerId: string,
  data: CreatePartnerRoleInput
): Promise<{ success: boolean; role: { id: string; role: PartnerRoleType } }> {
  const response = await fetch(`/api/partners/${partnerId}/roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || '新增角色失敗')
  }

  return response.json()
}

/**
 * Update a partner role
 */
export async function updatePartnerRole(
  partnerId: string,
  roleId: string,
  data: UpdatePartnerRoleInput
): Promise<{ success: boolean }> {
  const response = await fetch(`/api/partners/${partnerId}/roles`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roleId, ...data }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || '更新角色失敗')
  }

  return response.json()
}

/**
 * Remove a role from a partner
 * @param partnerId - The partner ID
 * @param roleIdOrType - Either the role ID or the role type (CUSTOMER, SUPPLIER, PARTNER)
 */
export async function removePartnerRole(
  partnerId: string,
  roleIdOrType: string
): Promise<{ success: boolean }> {
  // Determine if it's a role type or role ID
  const isRoleType = ['DEALER', 'END_USER', 'SUPPLIER'].includes(roleIdOrType)
  const param = isRoleType ? `role=${roleIdOrType}` : `roleId=${roleIdOrType}`

  const response = await fetch(`/api/partners/${partnerId}/roles?${param}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || '移除角色失敗')
  }

  return response.json()
}

// ============================================
// Utility Functions
// ============================================

/**
 * Sync partner deals from Odoo
 */
export async function syncPartnerDeals(
  partnerId: string
): Promise<{ success: boolean; message: string; stats: { total: number; created: number; updated: number } }> {
  const response = await fetch(`/api/partners/${partnerId}/sync-deals`, {
    method: 'POST',
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || '同步訂單失敗')
  }

  return response.json()
}

/**
 * Get partner role display name
 */
export function getRoleDisplayName(role: PartnerRoleType): string {
  const roleNames: Record<PartnerRoleType, string> = {
    DEALER: '經銷商',
    END_USER: '最終用戶',
    SUPPLIER: '供應商',
  }
  return roleNames[role] || role
}

/**
 * Get partner primary role
 */
export function getPrimaryRole(partner: PartnerWithRelations): PartnerRoleType | null {
  const primaryRole = partner.roles?.find(r => r.isPrimary)
  return primaryRole?.role || partner.roles?.[0]?.role || null
}

/**
 * Check if partner has a specific role
 */
export function hasRole(partner: PartnerWithRelations, role: PartnerRoleType): boolean {
  return partner.roles?.some(r => r.role === role) || false
}
