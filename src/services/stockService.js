// Record a stock movement against a branch's on-hand quantity, atomically.
//
// `Item` has no `quantity` field of its own — stock is tracked per branch on
// `BranchItem` (companyId, itemId, branchId, quantity), the same table
// `/api/pos/checkout` and the offline products-sync rely on. Branch
// resolution mirrors `/api/pos/checkout`: explicit branchId, else the
// company's MAIN branch, else any branch for the company.
function fail(message) {
  const e = new Error(message)
  e.appCode = 'STOCK_INPUT'
  return e
}

async function recordStock(prisma, data) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.item.findUnique({ where: { id: data.itemId } })
    if (!item) throw fail('Item not found')

    let branch = null
    if (data.branchId) {
      branch = await tx.branch.findFirst({ where: { id: data.branchId, companyId: data.companyId } })
      if (!branch) throw fail(`Branch with id "${data.branchId}" not found for this company`)
    } else {
      branch = await tx.branch.findFirst({ where: { companyId: data.companyId, type: 'MAIN' } })
      if (!branch) branch = await tx.branch.findFirst({ where: { companyId: data.companyId } })
      if (!branch) throw fail('No branch found for this company. Please create a branch first or pass branchId.')
    }

    let branchItem = await tx.branchItem.findUnique({
      where: { branchId_itemId: { branchId: branch.id, itemId: data.itemId } },
    })

    const currentQty = branchItem?.quantity ?? 0
    let newQty = currentQty
    if (data.type === 'PURCHASE' || data.type === 'ADJUSTMENT') newQty = currentQty + data.quantity
    if (data.type === 'SALE') newQty = currentQty - data.quantity
    if (newQty < 0) throw fail(`Insufficient stock for "${item.sku || item.id}" — have ${currentQty}, requested ${data.quantity}`)

    branchItem = branchItem
      ? await tx.branchItem.update({ where: { id: branchItem.id }, data: { quantity: newQty } })
      : await tx.branchItem.create({ data: { branchId: branch.id, itemId: data.itemId, quantity: newQty } })

    const ledger = await tx.stockLedger.create({
      data: {
        companyId: data.companyId,
        itemId: data.itemId,
        branchId: branch.id,
        type: data.type,
        quantity: data.quantity,
        note: data.note,
      },
    })

    return { ledger, branchItem }
  })
}
module.exports = { recordStock }
