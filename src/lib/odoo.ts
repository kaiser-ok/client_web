import { Pool } from 'pg'

// Odoo database connection
const odooPool = new Pool({
  host: process.env.ODOO_DB_HOST || 'localhost',
  port: parseInt(process.env.ODOO_DB_PORT || '5432'),
  database: process.env.ODOO_DB_NAME || 'odoo',
  user: process.env.ODOO_DB_USER || 'proj',
  password: process.env.ODOO_DB_PASSWORD || 'p20j2ead0n1y',
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

export interface OdooPartner {
  id: number
  name: string
  email: string | null
  phone: string | null
  mobile: string | null
  is_company: boolean
  parent_id: number | null
}

export interface OdooSaleOrder {
  id: number
  name: string
  partner_id: number
  partner_name: string
  amount_total: number
  state: string
  date_order: Date
  user_id: number | null
  user_name: string | null
  dealer_id: number | null
  dealer_name: string | null
  project_name: string | null      // 專案名稱
  client_order_ref: string | null  // 客戶參照
  project_type: string | null      // 專案類型
  note: string | null              // 備註
}

export interface OdooEmployee {
  id: number
  name: string
  email: string | null
  phone: string | null
  mobile: string | null
}

export interface OdooInvoice {
  id: number
  name: string
  partner_id: number
  partner_name: string
  amount_total: number
  amount_residual: number
  state: string
  payment_state: string
  invoice_date: Date | null
  invoice_date_due: Date | null
  user_name: string | null
}

export const odooClient = {
  /**
   * Test database connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const client = await odooPool.connect()
      await client.query('SELECT 1')
      client.release()
      return true
    } catch (error) {
      console.error('Odoo connection error:', error)
      return false
    }
  },

  /**
   * Get customers (res_partner) from Odoo
   * Only get companies (is_company = true) or contacts without parent
   * Excludes partners with "員工" (employee) or "供應商" (supplier) categories
   */
  async getCustomers(limit = 1000): Promise<OdooPartner[]> {
    const query = `
      SELECT
        p.id,
        p.name,
        p.email,
        p.phone,
        p.mobile,
        p.is_company,
        p.parent_id
      FROM res_partner p
      WHERE p.active = true
        AND (p.is_company = true OR p.parent_id IS NULL)
        AND p.name IS NOT NULL
        AND p.name != ''
        AND NOT EXISTS (
          SELECT 1 FROM res_partner_res_partner_category_rel rel
          JOIN res_partner_category cat ON rel.category_id = cat.id
          WHERE rel.partner_id = p.id
            AND (cat.name::text LIKE '%員工%' OR cat.name::text LIKE '%供應商%')
        )
      ORDER BY p.name
      LIMIT $1
    `
    const result = await odooPool.query(query, [limit])
    return result.rows
  },

  /**
   * Get confirmed sale orders from Odoo
   */
  async getSaleOrders(options: {
    state?: string
    fromDate?: Date
    limit?: number
  } = {}): Promise<OdooSaleOrder[]> {
    const { state = 'sale', fromDate, limit = 1000 } = options

    let query = `
      SELECT
        so.id,
        so.name,
        so.partner_id,
        p.name as partner_name,
        so.amount_total,
        so.state,
        so.date_order,
        so.user_id,
        u.name as user_name,
        so.dealer_id,
        d.name as dealer_name,
        so.project_name,
        so.client_order_ref,
        pt.name as project_type,
        so.note
      FROM sale_order so
      JOIN res_partner p ON so.partner_id = p.id
      LEFT JOIN res_users ru ON so.user_id = ru.id
      LEFT JOIN res_partner u ON ru.partner_id = u.id
      LEFT JOIN res_partner d ON so.dealer_id = d.id
      LEFT JOIN project_type pt ON so.project_type_id = pt.id
      WHERE so.state = $1
    `
    const params: (string | Date | number)[] = [state]

    if (fromDate) {
      query += ` AND so.date_order >= $2`
      params.push(fromDate)
    }

    query += ` ORDER BY so.date_order DESC LIMIT $${params.length + 1}`
    params.push(limit)

    const result = await odooPool.query(query, params)
    return result.rows
  },

  /**
   * Get sale orders for a specific partner (customer)
   */
  async getSaleOrdersByPartner(partnerId: number): Promise<OdooSaleOrder[]> {
    const query = `
      SELECT
        so.id,
        so.name,
        so.partner_id,
        p.name as partner_name,
        so.amount_total,
        so.state,
        so.date_order,
        so.user_id,
        u.name as user_name,
        so.dealer_id,
        d.name as dealer_name,
        so.project_name,
        so.client_order_ref,
        pt.name as project_type,
        so.note
      FROM sale_order so
      JOIN res_partner p ON so.partner_id = p.id
      LEFT JOIN res_users ru ON so.user_id = ru.id
      LEFT JOIN res_partner u ON ru.partner_id = u.id
      LEFT JOIN res_partner d ON so.dealer_id = d.id
      LEFT JOIN project_type pt ON so.project_type_id = pt.id
      WHERE so.partner_id = $1 AND so.state = 'sale'
      ORDER BY so.date_order DESC
    `
    const result = await odooPool.query(query, [partnerId])
    return result.rows
  },

  /**
   * Get a single partner by ID
   */
  async getPartnerById(id: number): Promise<OdooPartner | null> {
    const query = `
      SELECT
        id,
        name,
        email,
        phone,
        mobile,
        is_company,
        parent_id
      FROM res_partner
      WHERE id = $1
    `
    const result = await odooPool.query(query, [id])
    return result.rows[0] || null
  },

  /**
   * Get employees (partners with "員工" category tag)
   * Category ID 3 = 員工
   */
  async getEmployees(): Promise<OdooEmployee[]> {
    const query = `
      SELECT
        p.id,
        p.name,
        p.email,
        p.phone,
        p.mobile
      FROM res_partner p
      JOIN res_partner_res_partner_category_rel rel ON p.id = rel.partner_id
      WHERE rel.category_id = 3
        AND p.active = true
        AND p.name IS NOT NULL
      ORDER BY p.name
    `
    const result = await odooPool.query(query)
    return result.rows
  },

  /**
   * Get sale order lines (products) for an order
   */
  async getOrderLines(orderId: number): Promise<Array<{
    product_name: string | null
    line_name: string
    quantity: number
    price_unit: number
    price_subtotal: number
  }>> {
    const query = `
      SELECT
        pt.name as product_name,
        sol.name as line_name,
        sol.product_uom_qty as quantity,
        sol.price_unit,
        sol.price_subtotal
      FROM sale_order_line sol
      LEFT JOIN product_product pp ON sol.product_id = pp.id
      LEFT JOIN product_template pt ON pp.product_tmpl_id = pt.id
      WHERE sol.order_id = $1
      ORDER BY sol.sequence
    `
    const result = await odooPool.query(query, [orderId])
    return result.rows
  },

  /**
   * Get order tags (crm_tag) for a partner
   * Returns unique tag names from all orders of the partner
   */
  async getPartnerOrderTags(partnerId: number): Promise<string[]> {
    const query = `
      SELECT DISTINCT ct.name->>'zh_TW' as tag_name
      FROM sale_order so
      JOIN sale_order_tag_rel sotr ON so.id = sotr.order_id
      JOIN crm_tag ct ON sotr.tag_id = ct.id
      WHERE so.partner_id = $1
        AND ct.name->>'zh_TW' IS NOT NULL
      ORDER BY tag_name
    `
    const result = await odooPool.query(query, [partnerId])
    return result.rows.map(row => row.tag_name).filter(Boolean)
  },

  /**
   * Get all order tags grouped by partner
   * Returns a map of partner_id -> tag names
   */
  async getAllPartnerOrderTags(): Promise<Map<number, string[]>> {
    const query = `
      SELECT
        so.partner_id,
        array_agg(DISTINCT ct.name->>'zh_TW') as tags
      FROM sale_order so
      JOIN sale_order_tag_rel sotr ON so.id = sotr.order_id
      JOIN crm_tag ct ON sotr.tag_id = ct.id
      WHERE ct.name->>'zh_TW' IS NOT NULL
      GROUP BY so.partner_id
    `
    const result = await odooPool.query(query)
    const tagMap = new Map<number, string[]>()
    for (const row of result.rows) {
      tagMap.set(row.partner_id, row.tags.filter(Boolean))
    }
    return tagMap
  },

  /**
   * Get customer invoices (account_move with move_type = 'out_invoice')
   * Only posted invoices (state = 'posted')
   */
  async getInvoices(options: {
    partnerId?: number
    fromDate?: Date
    limit?: number
  } = {}): Promise<OdooInvoice[]> {
    const { partnerId, fromDate, limit = 500 } = options

    let query = `
      SELECT
        am.id,
        am.name,
        am.partner_id,
        p.name as partner_name,
        am.amount_total,
        am.amount_residual,
        am.state,
        am.payment_state,
        am.invoice_date,
        am.invoice_date_due,
        u.name as user_name
      FROM account_move am
      JOIN res_partner p ON am.partner_id = p.id
      LEFT JOIN res_users ru ON am.invoice_user_id = ru.id
      LEFT JOIN res_partner u ON ru.partner_id = u.id
      WHERE am.move_type = 'out_invoice'
        AND am.state = 'posted'
    `
    const params: (number | Date)[] = []
    let paramIndex = 1

    if (partnerId) {
      query += ` AND am.partner_id = $${paramIndex}`
      params.push(partnerId)
      paramIndex++
    }

    if (fromDate) {
      query += ` AND am.invoice_date >= $${paramIndex}`
      params.push(fromDate)
      paramIndex++
    }

    query += ` ORDER BY am.invoice_date DESC LIMIT $${paramIndex}`
    params.push(limit)

    const result = await odooPool.query(query, params)
    return result.rows
  },

  /**
   * Get invoices for a specific partner
   */
  async getPartnerInvoices(partnerId: number, limit = 100): Promise<OdooInvoice[]> {
    return this.getInvoices({ partnerId, limit })
  },

  /**
   * Get suppliers (partners with "供應商" category tag)
   * Category ID 2 = 供應商
   */
  async getSuppliers(): Promise<OdooPartner[]> {
    const query = `
      SELECT
        p.id,
        p.name,
        p.email,
        p.phone,
        p.mobile,
        p.is_company,
        p.parent_id,
        p.website
      FROM res_partner p
      JOIN res_partner_res_partner_category_rel rel ON p.id = rel.partner_id
      WHERE rel.category_id = 2
        AND p.active = true
        AND p.name IS NOT NULL
      ORDER BY p.name
    `
    const result = await odooPool.query(query)
    return result.rows
  },

  /**
   * Create a new partner (customer) in Odoo
   * Returns the created partner's ID
   */
  async createPartner(data: {
    name: string
    email?: string | null
    phone?: string | null
    mobile?: string | null
    is_company?: boolean
  }): Promise<number> {
    const { name, email, phone, mobile, is_company = true } = data

    // Insert into res_partner
    const query = `
      INSERT INTO res_partner (
        name,
        email,
        phone,
        mobile,
        is_company,
        active,
        type,
        create_date,
        write_date
      ) VALUES (
        $1, $2, $3, $4, $5, true, 'contact', NOW(), NOW()
      )
      RETURNING id
    `
    const result = await odooPool.query(query, [
      name,
      email || null,
      phone || null,
      mobile || null,
      is_company,
    ])
    return result.rows[0].id
  },

  /**
   * Update partner's x_crm_customer_id field to link with CRM system
   * @param odooPartnerId - The Odoo partner ID
   * @param crmPartnerId - The CRM partner ID to store
   */
  async updatePartnerCrmId(odooPartnerId: number, crmPartnerId: string): Promise<boolean> {
    try {
      const query = `
        UPDATE res_partner
        SET x_crm_customer_id = $1, write_date = NOW()
        WHERE id = $2
      `
      const result = await odooPool.query(query, [crmPartnerId, odooPartnerId])
      return result.rowCount === 1
    } catch (error) {
      console.error('Error updating partner CRM ID:', error)
      return false
    }
  },

  /**
   * Get partner by CRM customer ID
   */
  async getPartnerByCrmId(crmPartnerId: string): Promise<OdooPartner | null> {
    const query = `
      SELECT
        id,
        name,
        email,
        phone,
        mobile,
        is_company,
        parent_id
      FROM res_partner
      WHERE x_crm_customer_id = $1
    `
    const result = await odooPool.query(query, [crmPartnerId])
    return result.rows[0] || null
  },

  /**
   * Get delivery items (出貨紀錄) for a sale order
   * Returns products shipped out with valuation cost
   */
  async getDeliveryCosts(saleOrderId: number): Promise<Array<{
    product_name: string
    qty: number
    unit_cost: number
    total_cost: number
    date_done: string | null
  }>> {
    const query = `
      SELECT
        COALESCE(pt.name->>'zh_TW', pt.name->>'en_US', sol.name) as product_name,
        sol.product_uom_qty as qty,
        COALESCE(sol.purchase_price, 0) as unit_cost,
        COALESCE(sol.purchase_price * sol.product_uom_qty, 0) as total_cost,
        (SELECT sp.date_done::date::text
         FROM stock_picking sp
         JOIN stock_move sm ON sm.picking_id = sp.id
         WHERE sp.sale_id = sol.order_id
           AND sm.product_id = sol.product_id
           AND sp.state = 'done'
         ORDER BY sp.date_done DESC LIMIT 1
        ) as date_done
      FROM sale_order_line sol
      LEFT JOIN product_product pp ON sol.product_id = pp.id
      LEFT JOIN product_template pt ON pp.product_tmpl_id = pt.id
      WHERE sol.order_id = $1
        AND sol.product_uom_qty > 0
        AND sol.purchase_price > 0
      ORDER BY sol.sequence, sol.id
    `
    const result = await odooPool.query(query, [saleOrderId])
    return result.rows.map(r => ({
      ...r,
      qty: Number(r.qty),
      unit_cost: Number(r.unit_cost),
      total_cost: Number(r.total_cost),
    }))
  },
}

export default odooClient
