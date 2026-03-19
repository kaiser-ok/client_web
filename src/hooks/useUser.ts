import { useSession } from 'next-auth/react'
import { useState, useEffect, useCallback } from 'react'
import { hasPermission, UserRole } from '@/constants/roles'
import type { PERMISSIONS } from '@/constants/roles'

const IMPERSONATE_KEY = 'admin_impersonate_role'

export function useUser() {
  const { data: session, status } = useSession()
  const [impersonatedRole, setImpersonatedRole] = useState<UserRole | null>(null)

  const user = session?.user
  const realRole = (user?.role as UserRole) || 'SUPPORT'
  const isAdmin = realRole === 'ADMIN'
  // isManager is false when impersonating (test as other role)
  const isManager = (user?.isManager ?? false)
  const department = user?.department

  // Load impersonated role from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && isAdmin) {
      const stored = localStorage.getItem(IMPERSONATE_KEY)
      if (stored) {
        setImpersonatedRole(stored as UserRole)
      }
    }
  }, [isAdmin])

  // The effective role (impersonated if admin, otherwise real)
  const role = (isAdmin && impersonatedRole) ? impersonatedRole : realRole
  const isImpersonating = isAdmin && impersonatedRole !== null

  // Function to set impersonated role (admin only)
  const setRole = useCallback((newRole: UserRole | null) => {
    if (!isAdmin) return
    if (newRole) {
      localStorage.setItem(IMPERSONATE_KEY, newRole)
      setImpersonatedRole(newRole)
    } else {
      localStorage.removeItem(IMPERSONATE_KEY)
      setImpersonatedRole(null)
    }
  }, [isAdmin])

  // Clear impersonation
  const clearImpersonation = useCallback(() => {
    localStorage.removeItem(IMPERSONATE_KEY)
    setImpersonatedRole(null)
  }, [])

  return {
    user,
    role,
    realRole,
    isAdmin,
    isManager,
    department,
    isImpersonating,
    impersonatedRole,
    setRole,
    clearImpersonation,
    isLoading: status === 'loading',
    isAuthenticated: status === 'authenticated',
    // Manager permissions are suppressed while impersonating (for accurate preview)
    can: (permission: keyof typeof PERMISSIONS) =>
      hasPermission(role, permission, isManager && !isImpersonating),
  }
}
