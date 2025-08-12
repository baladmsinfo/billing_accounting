async function createItem(prisma, data) {
  return prisma.item.create({ data })
}
async function listItems(prisma, companyId, pagination = {}) {
  return prisma.item.findMany({ where: { companyId }, skip: pagination.skip, take: pagination.take, include: { product: true } })
}
module.exports = { createItem, listItems }
