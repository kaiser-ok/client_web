const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const GRAPHITI_URL = process.env.GRAPHITI_URL || 'http://localhost:8001';

async function upsertNode(nodeType, data) {
  const res = await fetch(`${GRAPHITI_URL}/nodes/${nodeType}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || `Failed to upsert ${nodeType}`);
  }
  return res.json();
}

async function main() {
  // 1. Partners -> Organizations
  const partners = await prisma.partner.findMany({ include: { roles: true } });
  console.log(`Syncing ${partners.length} partners...`);
  let ok = 0, fail = 0;
  for (const p of partners) {
    try {
      await upsertNode('organization', {
        crm_id: p.id, name: p.name, aliases: p.aliases,
        contact: p.contact ?? undefined, phone: p.phone ?? undefined,
        email: p.email ?? undefined, website: p.website ?? undefined,
        jira_label: p.jiraLabel ?? undefined, odoo_id: p.odooId ?? undefined,
        source: p.source, is_active: p.isActive, parent_crm_id: p.parentId ?? undefined,
      });
      ok++;
    } catch (e) { fail++; console.error(`  Partner fail: ${p.name} - ${e.message}`); }
  }
  console.log(`Partners: ${ok} ok, ${fail} failed`);

  // 2. Deals
  const deals = await prisma.deal.findMany();
  console.log(`Syncing ${deals.length} deals...`);
  ok = 0; fail = 0;
  for (const d of deals) {
    try {
      await upsertNode('deal', {
        crm_id: d.id, name: d.name, organization_crm_id: d.partnerId,
        project_name: d.projectName ?? undefined, type: d.type,
        amount: d.amount ? Number(d.amount) : undefined,
        sales_rep: d.salesRep ?? undefined,
        closed_at: d.closedAt?.toISOString(), start_date: d.startDate?.toISOString(),
        end_date: d.endDate?.toISOString(), source: d.source, odoo_id: d.odooId ?? undefined,
      });
      ok++;
    } catch (e) { fail++; console.error(`  Deal fail: ${d.name} - ${e.message}`); }
  }
  console.log(`Deals: ${ok} ok, ${fail} failed`);

  // 3. Projects
  const projects = await prisma.project.findMany();
  console.log(`Syncing ${projects.length} projects...`);
  ok = 0; fail = 0;
  for (const p of projects) {
    try {
      await upsertNode('project', {
        crm_id: p.id, name: p.name, organization_crm_id: p.partnerId,
        deal_crm_id: p.dealId ?? undefined, type: p.type ?? undefined,
        status: p.status, start_date: p.startDate?.toISOString(), end_date: p.endDate?.toISOString(),
      });
      ok++;
    } catch (e) { fail++; console.error(`  Project fail: ${p.name} - ${e.message}`); }
  }
  console.log(`Projects: ${ok} ok, ${fail} failed`);

  // 4. OpenItems -> Issues
  const items = await prisma.openItem.findMany();
  console.log(`Syncing ${items.length} open items...`);
  ok = 0; fail = 0;
  for (const i of items) {
    try {
      await upsertNode('issue', {
        crm_id: i.id, jira_key: i.jiraKey, summary: i.summary,
        organization_crm_id: i.partnerId, status: i.status,
        priority: i.priority ?? undefined, assignee: i.assignee ?? undefined,
        waiting_on: i.waitingOn ?? undefined,
      });
      ok++;
    } catch (e) { fail++; console.error(`  Issue fail: ${i.jiraKey} - ${e.message}`); }
  }
  console.log(`OpenItems: ${ok} ok, ${fail} failed`);

  // 5. Contacts -> Persons
  const contacts = await prisma.contact.findMany();
  console.log(`Syncing ${contacts.length} contacts...`);
  ok = 0; fail = 0;
  for (const c of contacts) {
    try {
      await upsertNode('person', {
        crm_id: c.id, name: c.name, email: c.email ?? undefined,
        phone: c.phone ?? undefined, title: c.title ?? undefined,
        line_user_id: c.lineUserId ?? undefined, slack_user_id: c.slackUserId ?? undefined,
        organization_crm_id: c.partnerId ?? undefined,
      });
      ok++;
    } catch (e) { fail++; console.error(`  Contact fail: ${c.name} - ${e.message}`); }
  }
  console.log(`Contacts: ${ok} ok, ${fail} failed`);

  console.log('\nDone!');
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
