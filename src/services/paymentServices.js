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
    await updateInvoiceStatus(tx, data.invoiceId, data.items)

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
    await updateInvoiceStatus(tx, data.invoiceId, data.items)

    // Journal Entries (optional, can remove if not needed)
    const desc = `Payment for Purchase Invoice ${data.invoiceId}`

    // 3. Create journal entries
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

async function updateInvoiceStatus(tx, invoiceId, items) {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    include: { payments: true, items: true }
  })
  if (!invoice) throw new Error('Invoice not found')

  const totalPaid = invoice.payments.reduce((s, p) => s + p.amount, 0)
  const invoiceItems = invoice.items

  let newStatus = 'PENDING'
  if (totalPaid === 0) newStatus = 'PENDING'
  else if (totalPaid < invoice.totalAmount) newStatus = 'PARTIAL'
  else if (totalPaid >= invoice.totalAmount) newStatus = 'PAID'

  await tx.invoice.update({
    where: { id: invoiceId },
    data: { status: newStatus }
  })

  console.log("Items from payload:", items);

  const updatedInvoiceItems = invoiceItems.map(async (item) => {
    const selected = items.find(i => i.itemId === item.id);

    if (selected) {
      const newPaidAmount = (item.paidAmount || 0) + selected.balance;

      return tx.invoiceItem.update({
        where: { id: item.id },
        data: {
          paidAmount: newPaidAmount,
        }
      });
    }

    return item;
  });

  console.log("updatedInvoiceItems:", await Promise.all(updatedInvoiceItems));
}

async function getAccountId(tx, companyId, name) {
  const acc = await tx.account.findFirst({ where: { companyId, name } })
  if (!acc) throw new Error(`Account not found: ${name}`)
  return acc.id
}

module.exports = { createPayment, recordPurchasePayment }
