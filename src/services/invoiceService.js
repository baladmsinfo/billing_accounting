const { Decimal } = require('@prisma/client/runtime')

// create invoice, invoice items, and decrement stock per item in a transaction
async function createInvoice(prisma, data) {
  // data: { companyId, customerId, date, dueDate, items: [{ itemId, productId, quantity, price, taxRateId? }] }
  return prisma.$transaction(async (tx) => {
    let totalAmount = new Decimal(0)
    let taxAmount = new Decimal(0)

    for (const it of data.items) {
      const lineTotal = new Decimal(it.quantity).times(new Decimal(it.price))
      totalAmount = totalAmount.plus(lineTotal)
      if (it.taxRateId) {
        const tax = await tx.taxRate.findUnique({ where: { id: it.taxRateId } })
        if (tax) {
          const rate = new Decimal(tax.rate).dividedBy(100)
          const taxLine = lineTotal.times(rate)
          taxAmount = taxAmount.plus(taxLine)
        }
      }
    }

    const invoice = await tx.invoice.create({ data: {
      invoiceNumber: data.invoiceNumber || `INV-${Date.now()}`,
      companyId: data.companyId,
      customerId: data.customerId,
      date: data.date,
      dueDate: data.dueDate,
      status: 'PENDING',
      totalAmount: parseFloat(totalAmount.toFixed(2)),
      taxAmount: parseFloat(taxAmount.toFixed(2))
    } })

    for (const it of data.items) {
      // create invoice item
      await tx.invoiceItem.create({ data: {
        invoiceId: invoice.id,
        itemId: it.itemId,
        productId: it.productId,
        quantity: it.quantity,
        price: it.price,
        taxRateId: it.taxRateId || null,
        total: parseFloat((new Decimal(it.quantity).times(new Decimal(it.price))).toFixed(2))
      } })

      // create stock ledger and decrement item quantity
      const item = await tx.item.findUnique({ where: { id: it.itemId } })
      if (!item) throw new Error('Item not found')
      if (item.quantity < it.quantity) throw new Error(`Insufficient stock for item ${it.itemId}`)

      await tx.stockLedger.create({ data: {
        companyId: data.companyId,
        itemId: it.itemId,
        type: 'SALE',
        quantity: it.quantity,
        note: `Sale - invoice ${invoice.id}`
      } })

      await tx.item.update({ where: { id: it.itemId }, data: { quantity: item.quantity - it.quantity } })
    }

    return invoice
  })
}
module.exports = { createInvoice }
