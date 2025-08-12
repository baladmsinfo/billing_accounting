async function createCustomer(prisma, data) { return prisma.customer.create({ data }) }
async function listCustomers(prisma, companyId, pagination = {}) { return prisma.customer.findMany({ where: { companyId }, skip: pagination.skip, take: pagination.take }) }
module.exports = { createCustomer, listCustomers }
