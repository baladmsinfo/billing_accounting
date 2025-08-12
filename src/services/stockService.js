// record stock movement and update item quantity atomically
async function recordStock(prisma, data) {
  return prisma.$transaction(async (tx) => {
    const ledger = await tx.stockLedger.create({ data })
    const item = await tx.item.findUnique({ where: { id: data.itemId } })
    if (!item) throw new Error('Item not found')
    let newQty = item.quantity
    if (data.type === 'PURCHASE' || data.type === 'ADJUSTMENT') newQty = item.quantity + data.quantity
    if (data.type === 'SALE') newQty = item.quantity - data.quantity
    if (newQty < 0) throw new Error('Insufficient stock')
    await tx.item.update({ where: { id: data.itemId }, data: { quantity: newQty } })
    return ledger
  })
}
module.exports = { recordStock }
