# PDF Generation Logic

## Quotation PDF Template

Location: `src/templates/quotation-pdf.ts`

### Section Headers

The quotation PDF dynamically shows section headers based on item types:

| Scenario | Hardware Section | Services Section |
|----------|------------------|------------------|
| Both exist | A. 基礎設施與硬體設備 (Infrastructure & Hardware) | B. 軟體授權與專業服務 (Software & Professional Services) |
| Only hardware | 基礎設施與硬體設備 (Infrastructure & Hardware) | - |
| Only services | - | 軟體授權與專業服務 (Software & Professional Services) |

### Logic

```typescript
// Hardware section - shows "A. " prefix only if services also exist
${serviceItems.length > 0 ? 'A. ' : ''}基礎設施與硬體設備 (Infrastructure & Hardware)

// Services section - shows "B. " prefix only if hardware also exists
${hardwareItems.length > 0 ? 'B. ' : ''}軟體授權與專業服務 (Software & Professional Services)
```

### Info Section

The PDF header contains two info boxes:
- Left: Company/Vendor information (name, address, contact, phone, email)
- Right: Client information and document details (name, contact, quotation number, date, validity period)
