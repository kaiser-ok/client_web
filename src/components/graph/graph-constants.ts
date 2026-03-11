export const NODE_STYLE_MAP: Record<string, { fill: string; stroke: string }> = {
  Organization: { fill: '#e6f7ff', stroke: '#1890ff' },
  Person: { fill: '#f6ffed', stroke: '#52c41a' },
  Deal: { fill: '#fffbe6', stroke: '#faad14' },
  Issue: { fill: '#fff1f0', stroke: '#ff4d4f' },
  Project: { fill: '#f9f0ff', stroke: '#722ed1' },
  Product: { fill: '#e6fffb', stroke: '#13c2c2' },
}

const LABEL_PRIORITY = ['Organization', 'Person', 'Deal', 'Issue', 'Project', 'Product']

export function getPrimaryLabel(labels: string[]): string {
  for (const l of LABEL_PRIORITY) {
    if (labels.includes(l)) return l
  }
  return labels[0] || 'Unknown'
}

export const REL_TYPE_LABELS: Record<string, string> = {
  HAS_DEAL: '成交',
  HAS_ISSUE: '問題',
  HAS_PROJECT: '專案',
  BELONGS_TO: '隸屬',
  PARENT_OF: '母公司',
  USES_PRODUCT: '使用產品',
  HAS_CONTACT: '聯絡人',
  WORKS_AT: '任職於',
  RELATED_TO: '相關',
  SUPPLIES: '供應',
}

export function formatRelType(relType: string): string {
  if (REL_TYPE_LABELS[relType]) return REL_TYPE_LABELS[relType]
  return relType.replace(/_/g, ' ').toLowerCase()
}
