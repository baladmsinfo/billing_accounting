// services/customerService.js
async function createCustomer(prisma, data) {
  return prisma.customer.create({
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone,
      gstin: data.gstin,
      companyId: data.companyId,

      // create cart automatically
      carts: {
        create: {
          companyId: data.companyId,  // ensure company relation
          status: 'ACTIVE'            // default status
        }
      }
    },
    include: {
      carts: true   // return the created cart too
    }
  })
}

async function listCustomers(prisma, companyId, { skip, take }) {
  return prisma.customer.findMany({
    where: { companyId },
    skip,
    take,
    include: {
      carts: true
    }
  })
}

async function updateCustomer(prisma, id, data, companyId) {
  return prisma.customer.updateMany({
    where: { id, companyId },
    data
  })
}

async function deleteCustomer(prisma, id, companyId) {
  return prisma.customer.deleteMany({
    where: { id, companyId }
  })
}

module.exports = {
  createCustomer,
  listCustomers,
  updateCustomer,
  deleteCustomer
}