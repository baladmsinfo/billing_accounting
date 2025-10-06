// services/accountService.js
async function createAccount(prisma, data, companyId) {
  return await prisma.account.create({
    data: {
      name: data.name,
      type: data.type,
      code: data.code,
      companyId
    }
  })
}

async function listAccounts(prisma, companyId) {
  return prisma.account.findMany({
    where: { companyId },
    orderBy: { code: 'asc' }
  })
}

module.exports = { createAccount, listAccounts }