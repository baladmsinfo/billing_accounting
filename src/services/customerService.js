// src/services/customerService.js
async function createCustomer(prisma, data) {
  return prisma.customer.create({
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone,
      gstin: data.gstin,
      companyId: data.companyId,

      // Create Customer Address
      addresses: {
        create: [
          {
            addressLine1: data.addressLine1,
            addressLine2: data.addressLine2,
            addressLine3: data.addressLine3,
            city: data.city,
            state: data.state,
            country: data.country,
            pincode: data.pincode,
            isDefault: true,
          }
        ]
      },

      // Create default Cart
      carts: {
        create: {
          companyId: data.companyId,
          status: "ACTIVE",
        }
      }
    },
    include: {
      addresses: true,
      carts: true
    }
  });
}

async function listCustomers(prisma, companyId, { skip, take }) {
  return prisma.customer.findMany({
    where: { companyId },
    skip,
    take,
    include: { carts: true , addresses: true},
  });
}

async function updateCustomer(prisma, id, data, companyId) {
  // ✅ Step 1: Verify the record belongs to the same company
  const existing = await prisma.customer.findFirst({
    where: { id, companyId },
  });

  if (!existing) return null;

  // ✅ Step 2: Remove invalid fields
  const {
    id: _,
    companyId: __,
    carts,
    createdAt,
    updatedAt,
    ...cleanData
  } = data;

  // ✅ Step 3: Update safely
  return prisma.customer.update({
    where: { id },
    data: cleanData,
  });
}

async function deleteCustomer(prisma, id, companyId) {
  // Optional ownership check
  const existing = await prisma.customer.findFirst({
    where: { id, companyId },
  });
  if (!existing) return null;

  return prisma.customer.delete({ where: { id } });
}

module.exports = {
  createCustomer,
  listCustomers,
  updateCustomer,
  deleteCustomer,
};