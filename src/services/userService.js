const { hashPassword } = require('../utils/hash')

async function createUser(prisma, data) {
  data.password = await hashPassword(data.password)
  return prisma.user.create({ data })
}

async function findByEmail(prisma, email) {
  return prisma.user.findUnique({ where: { email } })
}

async function listUsers(prisma, companyId, pagination = {}) {
  return prisma.user.findMany({ where: { companyId }, skip: pagination.skip, take: pagination.take })
}

module.exports = { createUser, findByEmail, listUsers }
