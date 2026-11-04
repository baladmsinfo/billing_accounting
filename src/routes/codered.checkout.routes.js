// routes/codered.checkout.routes.js
// Register: fastify.register(require('./routes/codered.checkout.routes'), { prefix: '/api/codered' })
'use strict'

const Decimal = require('decimal.js')

module.exports = async function coderedCheckoutRoutes(fastify) {
  const prisma = fastify.prisma

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /api/codered/checkout
  //
  // Body: { cartId, form: { firstName, lastName, email, phone, address, city, state, zip } }
  //
  // Flow:
  //  1. Validate cart has items
  //  2. Resolve or create Customer from form
  //  3. Resolve MAIN branch for the company
  //  4. Create ONLINE Invoice with items, taxes, journal entries
  //  5. Decrement stock via StockLedger
  //  6. Mark cart CHECKEDOUT
  //  7. Return invoiceId + customerId
  // ─────────────────────────────────────────────────────────────────────────────
  fastify.post('/checkout', async (req, reply) => {
    const { cartId, form } = req.body

    if (!cartId || !form) {
      return reply.code(400).send({ statusCode: '01', message: 'cartId and form are required' })
    }

    const companyId = req.companyId
    let customerId = req.customerId ?? null

    // ── Resolve existing customer by email/phone if not authenticated ─────────
    if (!customerId) {
      const email = form.email?.trim() || null
      const phone = form.phone ? String(form.phone).trim() : null

      if (email || phone) {
        const existing = await prisma.customer.findFirst({
          where: {
            companyId,
            OR: [
              email ? { email } : undefined,
              phone ? { phone } : undefined,
            ].filter(Boolean),
          },
          select: { id: true },
        })
        if (existing) customerId = existing.id
      }
    }

    return await prisma.$transaction(async (tx) => {

      // ── 1. Validate cart ────────────────────────────────────────────────────
      const cart = await tx.cart.findUnique({
        where: { id: cartId },
        include: {
          items: {
            include: {
              item: { include: { taxRate: true } },
            },
          },
        },
      })

      if (!cart || cart.items.length === 0) {
        return reply.code(400).send({ statusCode: '01', message: 'Cart is empty or not found' })
      }

      if (cart.companyId !== companyId) {
        return reply.code(403).send({ statusCode: '01', message: 'Cart does not belong to this company' })
      }

      // ── 2. Resolve / create customer ────────────────────────────────────────
      let customer

      if (customerId) {
        customer = await tx.customer.findFirst({ where: { id: customerId, companyId } })
        if (!customer) {
          return reply.code(400).send({ statusCode: '01', message: 'Customer not found' })
        }
      } else {
        // Create guest customer
        customer = await tx.customer.create({
          data: {
            companyId,
            name: `${form.firstName ?? ''} ${form.lastName ?? ''}`.trim() || 'Guest',
            email: form.email?.trim() || null,
            phone: form.phone ? String(form.phone).trim() : null,
          },
        })
        customerId = customer.id

        // Create customer address
        if (form.address) {
          await tx.customerAddress.create({
            data: {
              customerId,
              addressLine1: form.address,
              city: form.city || '',
              state: form.state || '',
              pincode: form.zip || null,
              isDefault: true,
            },
          })
        }
      }

      // ── 3. Resolve MAIN branch ──────────────────────────────────────────────
      const mainBranch = await tx.branch.findFirst({
        where: {
          companyId,
          OR: [{ main: true }, { type: 'MAIN' }],
        },
        select: { id: true },
      })
      // If no main branch tagged, fall back to any branch
      const branchId = mainBranch?.id ?? (
        await tx.branch.findFirst({ where: { companyId }, select: { id: true } })
      )?.id ?? null

      // ── 4. Create invoice ───────────────────────────────────────────────────
      const invoiceNumber = `INV-CR-${Date.now()}`

      const invoice = await tx.invoice.create({
        data: {
          companyId,
          customerId,
          branchId,
          date: new Date(),
          status: 'PENDING',
          type: 'ONLINE',
          invoiceNumber,
          totalAmount: 0,
          taxAmount: 0,
        },
      })

      let totalAmount = new Decimal(0)
      let totalTax = new Decimal(0)

      // ── 5. Create invoice items, handle stock & tax ─────────────────────────
      for (const row of cart.items) {
        const lineTotal = new Decimal(row.quantity).times(new Decimal(row.price))
        totalAmount = totalAmount.plus(lineTotal)

        let taxAmountForItem = new Decimal(0)

        if (row.item?.taxRate) {
          const rate = new Decimal(row.item.taxRate.rate).div(100)
          taxAmountForItem = lineTotal.times(rate)
          totalTax = totalTax.plus(taxAmountForItem)

          await tx.invoiceTax.create({
            data: {
              invoiceId: invoice.id,
              taxRateId: row.item.taxRate.id,
              companyId,
              invoiceType: 'ONLINE',
              amount: parseFloat(taxAmountForItem.toFixed(2)),
            },
          })
        }

        await tx.invoiceItem.create({
          data: {
            invoiceId: invoice.id,
            itemId: row.itemId,
            productId: row.productId,
            quantity: row.quantity,
            price: row.price,
            total: parseFloat(lineTotal.toFixed(2)),
            taxRateId: row.item?.taxRate?.id ?? null,
          },
        })

        // Stock ledger entry (SALE)
        await tx.stockLedger.create({
          data: {
            companyId,
            itemId: row.itemId,
            branchId,
            type: 'SALE',
            quantity: row.quantity,
            note: `Online sale — ${invoiceNumber}`,
          },
        })
      }

      // ── 6. Update invoice totals ────────────────────────────────────────────
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          totalAmount: parseFloat(totalAmount.toFixed(2)),
          taxAmount: parseFloat(totalTax.toFixed(2)),
        },
      })

      // ── 7. Journal entries ──────────────────────────────────────────────────
      const grandTotal = totalAmount.plus(totalTax)
      const description = `Online enrollment — ${invoiceNumber}`

      const arAccount = await resolveAccount(tx, companyId, 'Accounts Receivable')
      const srAccount = await resolveAccount(tx, companyId, 'Sales Revenue')

      if (arAccount) {
        await tx.journalEntry.create({
          data: {
            companyId,
            accountId: arAccount,
            date: new Date(),
            description,
            debit: parseFloat(grandTotal.toFixed(2)),
            credit: 0,
          },
        })
      }

      if (srAccount) {
        await tx.journalEntry.create({
          data: {
            companyId,
            accountId: srAccount,
            date: new Date(),
            description,
            debit: 0,
            credit: parseFloat(totalAmount.toFixed(2)),
          },
        })
      }

      if (totalTax.gt(0)) {
        const taxAccount = await resolveAccount(tx, companyId, 'Tax Payable')
        if (taxAccount) {
          await tx.journalEntry.create({
            data: {
              companyId,
              accountId: taxAccount,
              date: new Date(),
              description,
              debit: 0,
              credit: parseFloat(totalTax.toFixed(2)),
            },
          })
        }
      }

      // ── 8. Mark cart checked out ────────────────────────────────────────────
      await tx.cart.update({
        where: { id: cartId },
        data: { status: 'CHECKEDOUT' },
      })

      // ── 9. Return ───────────────────────────────────────────────────────────
      return reply.send({
        statusCode: '00',
        message: 'Enrollment successful',
        invoiceId: invoice.id,
        invoiceNumber,
        customerId,
        branchId,
        total: parseFloat(grandTotal.toFixed(2)),
      })
    })
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /api/codered/invoice/:id
  // Returns a full invoice with items, customer, payments
  // ─────────────────────────────────────────────────────────────────────────────
  fastify.get('/invoice/:id', async (req, reply) => {
    try {
      const invoice = await prisma.invoice.findFirst({
        where: { id: req.params.id, companyId: req.companyId },
        include: {
          items: {
            include: {
              product: true,
              item: true,
              taxRate: true,
            },
          },
          payments: true,
          customer: true,
          invoiceTax: { include: { taxRate: true } },
          branch: true,
        },
      })

      if (!invoice) {
        return reply.code(404).send({ statusCode: '99', message: 'Invoice not found' })
      }

      return reply.send({ statusCode: '00', message: 'Invoice fetched', data: invoice })
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to fetch invoice', error: error.message })
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: resolve account ID by name (same pattern as invoiceService)
// ─────────────────────────────────────────────────────────────────────────────
async function resolveAccount(tx, companyId, name) {
  const account = await tx.account.findFirst({
    where: { companyId, name: { contains: name, mode: 'insensitive' } },
    select: { id: true },
  })
  return account?.id ?? null
}