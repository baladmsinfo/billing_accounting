async function createProduct(prisma, data) {
  return prisma.product.create({ data })
}
async function listProducts(prisma, companyId, pagination = {}) {
  return prisma.product.findMany({ where: { companyId }, skip: pagination.skip, take: pagination.take, include: { items: true } })
}
module.exports = { createProduct, listProducts }
