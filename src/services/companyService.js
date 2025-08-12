async function createCompany(prisma, data) {
  return prisma.company.create({ data })
}
async function getCompany(prisma, id) { return prisma.company.findUnique({ where: { id } }) }
async function listCompanies(prisma, pagination = {}) { return prisma.company.findMany({ skip: pagination.skip, take: pagination.take }) }
module.exports = { createCompany, getCompany, listCompanies }
