/**
 * Entity Resolution Service
 * Centralized identity resolution with cascading strategies, audit logging,
 * cached mappings, and manual override support.
 */

import { prisma } from './prisma'
import { findCustomerByEmail } from './gmail'
import { identifyCustomerFromEmail } from './llm'

// ============================================
// Types
// ============================================

export interface ResolutionRequest {
  channel: 'LINE' | 'SLACK' | 'EMAIL'
  channelUserId: string
  displayName?: string
  channelId?: string
  channelName?: string
  messageContent?: string
  messageSubject?: string
}

export interface ResolutionResult {
  partnerId: string | null
  partnerName: string | null
  contactId: string | null
  contactName: string | null
  confidence: number
  method: string
  cached: boolean
}

// Public email domains to skip in domain matching
const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
  'yahoo.com.tw', 'hotmail.com.tw', 'msn.com', 'live.com',
  'icloud.com', 'me.com', 'aol.com', 'mail.com',
  'protonmail.com', 'zoho.com', 'ymail.com',
])

// ============================================
// Strategy helpers
// ============================================

interface StrategyResult {
  partnerId: string | null
  partnerName: string | null
  contactId: string | null
  contactName: string | null
  confidence: number
  method: string
}

async function tryCachedMapping(
  channel: string,
  channelUserId: string
): Promise<StrategyResult | null> {
  const mapping = await prisma.identityMapping.findUnique({
    where: { channel_channelUserId: { channel, channelUserId } },
    include: {
      partner: { select: { id: true, name: true } },
      contact: { select: { id: true, name: true } },
    },
  })

  if (!mapping || !mapping.partnerId) return null

  return {
    partnerId: mapping.partnerId,
    partnerName: mapping.partner?.name || null,
    contactId: mapping.contactId,
    contactName: mapping.contact?.name || null,
    confidence: mapping.confidence,
    method: 'CACHED',
  }
}

async function tryExactIdentity(
  channel: string,
  channelUserId: string,
  channelId?: string
): Promise<StrategyResult | null> {
  if (channel === 'LINE') {
    // Check LineUser mapping
    const lineUser = await prisma.lineUser.findUnique({
      where: { lineUserId: channelUserId },
      select: { partnerId: true, partner: { select: { name: true } } },
    })
    if (lineUser?.partnerId) {
      return {
        partnerId: lineUser.partnerId,
        partnerName: lineUser.partner?.name || null,
        contactId: null,
        contactName: null,
        confidence: 1.0,
        method: 'EXACT_IDENTITY',
      }
    }

    // Also check LineChannel if channelId provided
    if (channelId) {
      const lineChannel = await prisma.lineChannel.findFirst({
        where: { lineChannelId: channelId },
        select: { partnerId: true, partner: { select: { name: true } } },
      })
      if (lineChannel?.partnerId) {
        return {
          partnerId: lineChannel.partnerId,
          partnerName: lineChannel.partner?.name || null,
          contactId: null,
          contactName: null,
          confidence: 0.9,
          method: 'EXACT_IDENTITY',
        }
      }
    }
  }

  if (channel === 'SLACK' && channelId) {
    const mapping = await prisma.slackChannelMapping.findUnique({
      where: { channelId },
      select: { partnerId: true, partnerName: true },
    })
    if (mapping?.partnerId) {
      return {
        partnerId: mapping.partnerId,
        partnerName: mapping.partnerName,
        contactId: null,
        contactName: null,
        confidence: 1.0,
        method: 'EXACT_IDENTITY',
      }
    }
  }

  return null
}

async function tryEmailMatch(
  channel: string,
  channelUserId: string
): Promise<StrategyResult | null> {
  if (channel !== 'EMAIL') return null

  const customer = await findCustomerByEmail([channelUserId])
  if (customer) {
    return {
      partnerId: customer.id,
      partnerName: customer.name,
      contactId: null,
      contactName: null,
      confidence: 1.0,
      method: 'EMAIL_MATCH',
    }
  }
  return null
}

async function tryContactLookup(
  channel: string,
  channelUserId: string
): Promise<StrategyResult | null> {
  let where: Record<string, string> = {}
  if (channel === 'LINE') {
    where = { lineUserId: channelUserId }
  } else if (channel === 'SLACK') {
    where = { slackUserId: channelUserId }
  } else if (channel === 'EMAIL') {
    where = { email: channelUserId }
  }

  const contact = await prisma.contact.findFirst({
    where: { ...where, partnerId: { not: null } },
    select: {
      id: true,
      name: true,
      partnerId: true,
      partner: { select: { name: true } },
    },
  })

  if (contact?.partnerId) {
    return {
      partnerId: contact.partnerId,
      partnerName: contact.partner?.name || null,
      contactId: contact.id,
      contactName: contact.name,
      confidence: 0.95,
      method: 'CONTACT_LOOKUP',
    }
  }
  return null
}

async function tryDomainMatch(
  channel: string,
  channelUserId: string
): Promise<StrategyResult | null> {
  if (channel !== 'EMAIL') return null

  const domain = channelUserId.split('@')[1]?.toLowerCase()
  if (!domain || PUBLIC_EMAIL_DOMAINS.has(domain)) return null

  // Find partners whose email contains this domain
  const partners = await prisma.partner.findMany({
    where: {
      email: { contains: `@${domain}`, mode: 'insensitive' },
      isActive: true,
    },
    select: { id: true, name: true },
    take: 2,
  })

  // Only match if exactly one partner found (ambiguity = no match)
  if (partners.length === 1) {
    return {
      partnerId: partners[0].id,
      partnerName: partners[0].name,
      contactId: null,
      contactName: null,
      confidence: 0.7,
      method: 'DOMAIN_MATCH',
    }
  }
  return null
}

async function tryAliasMatch(
  displayName?: string
): Promise<StrategyResult | null> {
  if (!displayName) return null

  const normalizedName = displayName.trim().toLowerCase()
  if (!normalizedName) return null

  // Search by Partner.name (case-insensitive)
  const byName = await prisma.partner.findFirst({
    where: {
      name: { equals: displayName, mode: 'insensitive' },
      isActive: true,
    },
    select: { id: true, name: true },
  })

  if (byName) {
    return {
      partnerId: byName.id,
      partnerName: byName.name,
      contactId: null,
      contactName: null,
      confidence: 0.8,
      method: 'ALIAS_MATCH',
    }
  }

  // Search by aliases array (case-insensitive containment)
  // Prisma doesn't support case-insensitive array search natively, so we use raw query
  const byAlias = await prisma.partner.findMany({
    where: { isActive: true },
    select: { id: true, name: true, aliases: true },
  })

  for (const partner of byAlias) {
    if (partner.aliases.some(alias => alias.toLowerCase() === normalizedName)) {
      return {
        partnerId: partner.id,
        partnerName: partner.name,
        contactId: null,
        contactName: null,
        confidence: 0.75,
        method: 'ALIAS_MATCH',
      }
    }
  }

  return null
}

async function tryLLMFallback(
  request: ResolutionRequest
): Promise<StrategyResult | null> {
  // Build a synthetic subject from whatever info we have
  const subject = request.messageSubject
    || `Message from ${request.displayName || request.channelUserId} via ${request.channel}`
  const body = request.messageContent || ''

  if (!subject && !body) return null

  // Get all partner names + aliases for LLM
  const partners = await prisma.partner.findMany({
    where: { isActive: true },
    select: { id: true, name: true, aliases: true },
  })

  if (partners.length === 0) return null

  const customerNames = partners.map(p => p.name)
  const customerAliases = new Map<string, string[]>()
  for (const p of partners) {
    if (p.aliases.length > 0) {
      customerAliases.set(p.name, p.aliases)
    }
  }

  const result = await identifyCustomerFromEmail(
    { subject, body },
    customerNames,
    customerAliases
  )

  if (!result.customerName) return null

  // Map confidence levels to numeric scores
  const confidenceMap: Record<string, number> = { high: 0.8, medium: 0.5, low: 0.3 }
  const confidence = confidenceMap[result.confidence] || 0.3

  // Only accept medium or higher
  if (confidence < 0.5) return null

  // Find the partner ID
  const matched = partners.find(p => p.name === result.customerName)
  if (!matched) return null

  return {
    partnerId: matched.id,
    partnerName: matched.name,
    contactId: null,
    contactName: null,
    confidence,
    method: 'LLM',
  }
}

// ============================================
// Main resolution function
// ============================================

export async function resolveEntity(request: ResolutionRequest): Promise<ResolutionResult> {
  const startTime = Date.now()
  const strategiesAttempted: string[] = []
  let result: StrategyResult | null = null
  let error: string | undefined

  try {
    // Strategy 1: Cached mapping
    strategiesAttempted.push('CACHED')
    result = await tryCachedMapping(request.channel, request.channelUserId)
    if (result) return toResult(result, true)

    // Strategy 2: Exact identity (LineUser / SlackChannelMapping)
    strategiesAttempted.push('EXACT_IDENTITY')
    result = await tryExactIdentity(request.channel, request.channelUserId, request.channelId)
    if (result) {
      await cacheAndCreateContact(request, result)
      return toResult(result, false)
    }

    // Strategy 3: Email match (EMAIL channel only)
    strategiesAttempted.push('EMAIL_MATCH')
    result = await tryEmailMatch(request.channel, request.channelUserId)
    if (result) {
      await cacheAndCreateContact(request, result)
      return toResult(result, false)
    }

    // Strategy 4: Contact lookup
    strategiesAttempted.push('CONTACT_LOOKUP')
    result = await tryContactLookup(request.channel, request.channelUserId)
    if (result) {
      await cacheAndCreateContact(request, result)
      return toResult(result, false)
    }

    // Strategy 5: Domain match (EMAIL only)
    strategiesAttempted.push('DOMAIN_MATCH')
    result = await tryDomainMatch(request.channel, request.channelUserId)
    if (result) {
      await cacheAndCreateContact(request, result)
      return toResult(result, false)
    }

    // Strategy 6: Alias match
    strategiesAttempted.push('ALIAS_MATCH')
    result = await tryAliasMatch(request.displayName)
    if (result) {
      await cacheAndCreateContact(request, result)
      return toResult(result, false)
    }

    // Strategy 7: LLM fallback
    strategiesAttempted.push('LLM')
    result = await tryLLMFallback(request)
    if (result) {
      await cacheAndCreateContact(request, result)
      return toResult(result, false)
    }

    // All strategies failed
    return {
      partnerId: null,
      partnerName: null,
      contactId: null,
      contactName: null,
      confidence: 0,
      method: 'NONE',
      cached: false,
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
    console.error('[entity-resolver] Resolution error:', error)
    return {
      partnerId: null,
      partnerName: null,
      contactId: null,
      contactName: null,
      confidence: 0,
      method: 'ERROR',
      cached: false,
    }
  } finally {
    // Always log the resolution attempt
    const duration = Date.now() - startTime
    try {
      await prisma.resolutionLog.create({
        data: {
          channel: request.channel,
          channelUserId: request.channelUserId,
          displayName: request.displayName,
          partnerId: result?.partnerId || null,
          contactId: result?.contactId || null,
          confidence: result?.confidence || null,
          method: result?.method || null,
          strategiesAttempted,
          duration,
          context: {
            channelId: request.channelId,
            channelName: request.channelName,
            hasContent: !!request.messageContent,
            hasSubject: !!request.messageSubject,
          },
          error: error || null,
        },
      })
    } catch (logErr) {
      console.error('[entity-resolver] Failed to write resolution log:', logErr)
    }
  }
}

function toResult(strategy: StrategyResult, cached: boolean): ResolutionResult {
  return { ...strategy, cached }
}

/**
 * Cache the mapping and auto-create Contact if needed
 */
async function cacheAndCreateContact(
  request: ResolutionRequest,
  result: StrategyResult
): Promise<void> {
  if (!result.partnerId) return

  // Auto-create Contact if we have a partnerId but no contactId and a displayName
  let contactId = result.contactId
  let contactName = result.contactName
  if (!contactId && request.displayName) {
    try {
      const contactData: Record<string, string | undefined> = {
        name: request.displayName,
        partnerId: result.partnerId,
      }
      if (request.channel === 'LINE') contactData.lineUserId = request.channelUserId
      if (request.channel === 'SLACK') contactData.slackUserId = request.channelUserId
      if (request.channel === 'EMAIL') contactData.email = request.channelUserId

      const contact = await prisma.contact.create({ data: contactData as any })
      contactId = contact.id
      contactName = contact.name
      result.contactId = contactId
      result.contactName = contactName
    } catch {
      // Contact may already exist (unique constraint), ignore
    }
  }

  // Upsert IdentityMapping cache
  try {
    await prisma.identityMapping.upsert({
      where: {
        channel_channelUserId: {
          channel: request.channel,
          channelUserId: request.channelUserId,
        },
      },
      create: {
        channel: request.channel,
        channelUserId: request.channelUserId,
        displayName: request.displayName,
        partnerId: result.partnerId,
        contactId: contactId || null,
        confidence: result.confidence,
        method: result.method,
        isVerified: result.confidence >= 0.95,
        resolvedBy: 'system',
      },
      update: {
        displayName: request.displayName,
        partnerId: result.partnerId,
        contactId: contactId || null,
        confidence: result.confidence,
        method: result.method,
        resolvedBy: 'system',
      },
    })
  } catch (cacheErr) {
    console.error('[entity-resolver] Failed to cache mapping:', cacheErr)
  }
}

// ============================================
// Admin functions
// ============================================

/**
 * Manual mapping override (admin UI)
 */
export async function setManualMapping(
  channel: string,
  channelUserId: string,
  partnerId: string | null,
  contactId: string | null,
  resolvedBy: string
): Promise<void> {
  const partner = partnerId
    ? await prisma.partner.findUnique({ where: { id: partnerId }, select: { name: true } })
    : null

  await prisma.identityMapping.upsert({
    where: {
      channel_channelUserId: { channel, channelUserId },
    },
    create: {
      channel,
      channelUserId,
      partnerId,
      contactId,
      confidence: 1.0,
      method: 'MANUAL',
      isVerified: true,
      resolvedBy,
    },
    update: {
      partnerId,
      contactId,
      confidence: 1.0,
      method: 'MANUAL',
      isVerified: true,
      resolvedBy,
    },
  })

  // Log the manual mapping
  await prisma.resolutionLog.create({
    data: {
      channel,
      channelUserId,
      partnerId,
      contactId,
      confidence: 1.0,
      method: 'MANUAL',
      strategiesAttempted: ['MANUAL'],
      context: { resolvedBy, partnerName: partner?.name },
    },
  })
}

/**
 * Get unresolved senders (aggregated from ResolutionLog where method is null)
 */
export async function getUnresolvedSenders(options: {
  page?: number
  pageSize?: number
  channel?: string
}) {
  const { page = 1, pageSize = 20, channel } = options

  const where: any = { method: null }
  if (channel) where.channel = channel

  // Get distinct unresolved senders with count
  const grouped = await prisma.resolutionLog.groupBy({
    by: ['channel', 'channelUserId', 'displayName'],
    where,
    _count: { id: true },
    _max: { createdAt: true },
    orderBy: { _count: { id: 'desc' } },
    skip: (page - 1) * pageSize,
    take: pageSize,
  })

  // Get total count of distinct senders
  const allGrouped = await prisma.resolutionLog.groupBy({
    by: ['channel', 'channelUserId'],
    where,
  })

  return {
    senders: grouped.map(g => ({
      channel: g.channel,
      channelUserId: g.channelUserId,
      displayName: g.displayName,
      count: g._count.id,
      lastSeen: g._max.createdAt,
    })),
    total: allGrouped.length,
  }
}

/**
 * Get resolution history (audit log with pagination)
 */
export async function getResolutionHistory(options: {
  page?: number
  pageSize?: number
  channel?: string
  method?: string
  startDate?: Date
  endDate?: Date
}) {
  const { page = 1, pageSize = 20, channel, method, startDate, endDate } = options

  const where: any = {}
  if (channel) where.channel = channel
  if (method) where.method = method
  if (startDate || endDate) {
    where.createdAt = {}
    if (startDate) where.createdAt.gte = startDate
    if (endDate) where.createdAt.lte = endDate
  }

  const [logs, total] = await Promise.all([
    prisma.resolutionLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.resolutionLog.count({ where }),
  ])

  return { logs, total }
}

/**
 * Invalidate a cached mapping (forces re-resolution)
 */
export async function invalidateMapping(
  channel: string,
  channelUserId: string
): Promise<void> {
  await prisma.identityMapping.deleteMany({
    where: { channel, channelUserId },
  })
}

/**
 * Get resolution statistics
 */
export async function getResolutionStats() {
  const [
    totalMappings,
    verifiedCount,
    byChannel,
    byMethod,
    unresolvedCount,
  ] = await Promise.all([
    prisma.identityMapping.count(),
    prisma.identityMapping.count({ where: { isVerified: true } }),
    prisma.identityMapping.groupBy({
      by: ['channel'],
      _count: { id: true },
    }),
    prisma.identityMapping.groupBy({
      by: ['method'],
      _count: { id: true },
    }),
    prisma.resolutionLog.groupBy({
      by: ['channel', 'channelUserId'],
      where: { method: null },
    }).then(r => r.length),
  ])

  return {
    totalMappings,
    verifiedCount,
    byChannel: byChannel.reduce((acc, g) => {
      acc[g.channel] = g._count.id
      return acc
    }, {} as Record<string, number>),
    byMethod: byMethod.reduce((acc, g) => {
      acc[g.method] = g._count.id
      return acc
    }, {} as Record<string, number>),
    unresolvedCount,
  }
}
