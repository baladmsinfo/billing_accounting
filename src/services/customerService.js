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
  const [data, total] = await prisma.$transaction([
    prisma.customer.findMany({
      where: { companyId },
      skip,
      take,
      include: { carts: true, addresses: true },
    }),
    prisma.customer.count({
      where: { companyId },
    }),
  ])

  return {
    statusCode: "00",
    data,
    total,
  }
}

async function getCustomerById(prisma, customerId, companyId) {
  return prisma.customer.findFirst({
    where: {
      id: customerId,
      companyId,
    },
    include: {
      company: {
        select: {
          id: true,
          name: true,
          gstNumber: true,
          primaryEmail: true,
          primaryPhoneNo: true,
        },
      },
      addresses: {
        orderBy: {
          isDefault: 'desc',
        },
      },
      invoices: {
        select: {
          id: true,
          totalAmount: true,
          status: true,
        },
      },
      carts: {
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                },
              },
              item: {
                select: {
                  id: true,
                  sku: true,
                  variant: true,
                  price: true,
                },
              },
              taxRate: true,
            },
          },
        },
      },
    },
  })
}

async function getCustomerInvoices(
  prisma,
  customerId,
  companyId,
  { startDate, endDate, take = 10 }
) {
  return prisma.invoice.findMany({
    where: {
      customerId,
      companyId,
      ...(startDate && endDate
        ? {
          date: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        }
        : {}),
    },
    orderBy: {
      createdAt: 'desc',
    },
    take,
    include: {
      items: {
        include: {
          product: {
            select: { id: true, name: true, sku: true },
          },
          taxRate: true,
        },
      },
      payments: true,
      invoiceTax: {
        include: { taxRate: true },
      },
    },
  })
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
  getCustomerById,
  getCustomerInvoices,
  createCustomer,
  listCustomers,
  updateCustomer,
  deleteCustomer,
};