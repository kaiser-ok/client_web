/**
 * Seed Identity Mappings from existing data
 *
 * Populates IdentityMapping table from:
 * - LineUser records with partnerId
 * - SlackChannelMapping records with partnerId
 * - Contact records with email + partnerId
 *
 * Usage: npx tsx scripts/seed-identity-mappings.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Starting identity mapping seed...\n')

  let created = 0
  let skipped = 0

  // 1. LINE: LineUser records with partnerId
  console.log('--- LINE Users ---')
  const lineUsers = await prisma.lineUser.findMany({
    where: { partnerId: { not: null } },
    select: {
      lineUserId: true,
      displayName: true,
      partnerId: true,
    },
  })

  for (const lu of lineUsers) {
    try {
      await prisma.identityMapping.upsert({
        where: {
          channel_channelUserId: { channel: 'LINE', channelUserId: lu.lineUserId },
        },
        create: {
          channel: 'LINE',
          channelUserId: lu.lineUserId,
          displayName: lu.displayName,
          partnerId: lu.partnerId,
          confidence: 1.0,
          method: 'EXACT_IDENTITY',
          isVerified: true,
          resolvedBy: 'seed',
        },
        update: {}, // skip if exists
      })
      created++
      console.log(`  + LINE user ${lu.displayName} (${lu.lineUserId.substring(0, 12)}...)`)
    } catch (err) {
      skipped++
      console.log(`  - Skipped LINE user ${lu.lineUserId}: ${(err as Error).message}`)
    }
  }

  // 2. SLACK: SlackChannelMapping records with partnerId
  // Note: Slack mappings are channel-level, not sender-level.
  // We create a mapping with the channelId as the channelUserId.
  console.log('\n--- Slack Channel Mappings ---')
  const slackMappings = await prisma.slackChannelMapping.findMany({
    where: { partnerId: { not: null } },
    select: {
      channelId: true,
      channelName: true,
      partnerId: true,
      matchType: true,
    },
  })

  for (const sm of slackMappings) {
    try {
      await prisma.identityMapping.upsert({
        where: {
          channel_channelUserId: { channel: 'SLACK', channelUserId: sm.channelId },
        },
        create: {
          channel: 'SLACK',
          channelUserId: sm.channelId,
          displayName: sm.channelName,
          partnerId: sm.partnerId,
          confidence: 1.0,
          method: sm.matchType === 'MANUAL' ? 'MANUAL' : 'EXACT_IDENTITY',
          isVerified: sm.matchType === 'MANUAL',
          resolvedBy: 'seed',
        },
        update: {},
      })
      created++
      console.log(`  + Slack #${sm.channelName} (${sm.channelId})`)
    } catch (err) {
      skipped++
      console.log(`  - Skipped Slack ${sm.channelId}: ${(err as Error).message}`)
    }
  }

  // 3. EMAIL: Contact records with email + partnerId
  console.log('\n--- Contacts with Email ---')
  const contacts = await prisma.contact.findMany({
    where: {
      email: { not: null },
      partnerId: { not: null },
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
      partnerId: true,
    },
  })

  for (const c of contacts) {
    if (!c.email) continue
    try {
      await prisma.identityMapping.upsert({
        where: {
          channel_channelUserId: { channel: 'EMAIL', channelUserId: c.email.toLowerCase() },
        },
        create: {
          channel: 'EMAIL',
          channelUserId: c.email.toLowerCase(),
          displayName: c.name,
          partnerId: c.partnerId,
          contactId: c.id,
          confidence: 1.0,
          method: 'EMAIL_MATCH',
          isVerified: true,
          resolvedBy: 'seed',
        },
        update: {},
      })
      created++
      console.log(`  + Email ${c.email} → ${c.name}`)
    } catch (err) {
      skipped++
      console.log(`  - Skipped Contact ${c.email}: ${(err as Error).message}`)
    }
  }

  // 4. LINE Contacts: Contact records with lineUserId + partnerId
  console.log('\n--- Contacts with LINE userId ---')
  const lineContacts = await prisma.contact.findMany({
    where: {
      lineUserId: { not: null },
      partnerId: { not: null },
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      lineUserId: true,
      partnerId: true,
    },
  })

  for (const c of lineContacts) {
    if (!c.lineUserId) continue
    try {
      await prisma.identityMapping.upsert({
        where: {
          channel_channelUserId: { channel: 'LINE', channelUserId: c.lineUserId },
        },
        create: {
          channel: 'LINE',
          channelUserId: c.lineUserId,
          displayName: c.name,
          partnerId: c.partnerId,
          contactId: c.id,
          confidence: 0.95,
          method: 'CONTACT_LOOKUP',
          isVerified: true,
          resolvedBy: 'seed',
        },
        update: {},
      })
      created++
      console.log(`  + LINE Contact ${c.name} (${c.lineUserId.substring(0, 12)}...)`)
    } catch (err) {
      skipped++
    }
  }

  // 5. Slack Contacts: Contact records with slackUserId + partnerId
  console.log('\n--- Contacts with Slack userId ---')
  const slackContacts = await prisma.contact.findMany({
    where: {
      slackUserId: { not: null },
      partnerId: { not: null },
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      slackUserId: true,
      partnerId: true,
    },
  })

  for (const c of slackContacts) {
    if (!c.slackUserId) continue
    try {
      await prisma.identityMapping.upsert({
        where: {
          channel_channelUserId: { channel: 'SLACK', channelUserId: c.slackUserId },
        },
        create: {
          channel: 'SLACK',
          channelUserId: c.slackUserId,
          displayName: c.name,
          partnerId: c.partnerId,
          contactId: c.id,
          confidence: 0.95,
          method: 'CONTACT_LOOKUP',
          isVerified: true,
          resolvedBy: 'seed',
        },
        update: {},
      })
      created++
      console.log(`  + Slack Contact ${c.name} (${c.slackUserId})`)
    } catch (err) {
      skipped++
    }
  }

  console.log(`\n=== Done: ${created} created, ${skipped} skipped ===`)
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
