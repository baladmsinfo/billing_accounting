const { Prisma } = require('@prisma/client')

async function createPayment(prisma, data) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        companyId: data.companyId,
        invoiceId: data.invoiceId,
        amount: data.amount,
        method: data.method,
        referenceNo: data.referenceNo,
        date: data.date || new Date(),
        note: data.note
      }
    })

    // Update Invoice Status
    await updateInvoiceStatus(tx, data.invoiceId)

    // Journal Entries (optional, can remove if not needed)
    const desc = `Payment for Invoice ${data.invoiceId}`

    await tx.journalEntry.create({
      data: {
        companyId: data.companyId,
        accountId: await getAccountId(tx, data.companyId, 'Cash'),
        date: payment.date,
        description: desc,
        debit: parseFloat(payment.amount.toFixed(2)),
        credit: 0
      }
    })

    await tx.journalEntry.create({
      data: {
        companyId: data.companyId,
        accountId: await getAccountId(tx, data.companyId, 'Accounts Receivable'),
        date: payment.date,
        description: desc,
        debit: 0,
        credit: parseFloat(payment.amount.toFixed(2))
      }
    })

    return payment
  })
}

async function recordPurchasePayment(prisma, data) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        companyId: data.companyId,
        invoiceId: data.invoiceId,
        amount: data.amount,
        method: data.method,
        referenceNo: data.referenceNo,
        date: data.date || new Date(),
        note: data.note
      }
    })

    // Update Invoice Status
    await updateInvoiceStatus(tx, data.invoiceId)

    // Journal Entries (optional, can remove if not needed)
    const desc = `Payment for Purchase Invoice ${data.invoiceId}`

    // 3. Create journal entries
    await tx.journalEntry.create({
      data: {
        companyId: data.companyId,
        accountId: await svc.getAccountId(tx, data.companyId, 'Cash'),
        date: payment.date,
        description: desc,
        debit: parseFloat(payment.amount.toFixed(2)),
        credit: 0
      }
    })

    await tx.journalEntry.create({
      data: {
        companyId: data.companyId,
        accountId: await svc.getAccountId(tx, data.companyId, 'Accounts Receivable'),
        date: payment.date,
        description: desc,
        debit: 0,
        credit: parseFloat(payment.amount.toFixed(2))
      }
    })

    return payment
  })
}

async function updateInvoiceStatus(tx, invoiceId) {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    include: { payments: true }
  })
  if (!invoice) throw new Error('Invoice not found')

  const totalPaid = invoice.payments.reduce((s, p) => s + p.amount, 0)

  let newStatus = 'PENDING'
  if (totalPaid === 0) newStatus = 'PENDING'
  else if (totalPaid < invoice.totalAmount) newStatus = 'PARTIAL'
  else if (totalPaid >= invoice.totalAmount) newStatus = 'PAID'

  await tx.invoice.update({
    where: { id: invoiceId },
    data: { status: newStatus }
  })
}

async function getAccountId(tx, companyId, name) {
  const acc = await tx.account.findFirst({ where: { companyId, name } })
  if (!acc) throw new Error(`Account not found: ${name}`)
  return acc.id
}

module.exports = { createPayment, recordPurchasePayment }
