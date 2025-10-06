const { hashPassword } = require('../utils/hash')

async function createUser(prisma, data) {
  console.log('Creating user:', data)
  data.password = await hashPassword(data.password)

  const companyData = data.company || {}

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: data.email,
        password: data.password,
        name: data.name,
        role: data.role || 'USER',
        companies: {
          create: {
            name: companyData.name || `${data.name}'s Company`,
            primaryEmail: data.email,
            primaryPhoneNo: companyData.primaryPhoneNo || '0000000000',
            addressLine1: companyData.addressLine1 || 'N/A',
            addressLine2: companyData.addressLine2,
            addressLine3: companyData.addressLine3,
            city: companyData.city || 'N/A',
            state: companyData.state || 'N/A',
            pincode: companyData.pincode || 0,
            companyType: companyData.companyType || 'Private'
          }
        }
      },
      include: {
        companies: true
      }
    })

    // Default company
    const company = user.companies[0]

    // Default chart of accounts
    const defaultAccounts = [
      // Assets
      { name: 'Cash', type: 'ASSET', code: '1000' },
      { name: 'Bank', type: 'ASSET', code: '1010' },
      { name: 'Accounts Receivable', type: 'ASSET', code: '1100' },
      { name: 'Inventory', type: 'ASSET', code: '1200' },
      { name: 'Tax Receivable', type: 'ASSET', code: '1300' },

      // Liabilities
      { name: 'Accounts Payable', type: 'LIABILITY', code: '2000' },
      { name: 'Tax Payable', type: 'LIABILITY', code: '2100' },

      // Equity
      { name: 'Owner Equity', type: 'EQUITY', code: '3000' },

      // Income
      { name: 'Sales Revenue', type: 'INCOME', code: '4000' },

      // Expenses
      { name: 'Purchases', type: 'EXPENSE', code: '5000' }, 
      { name: 'Rent Expense', type: 'EXPENSE', code: '5000' },
      { name: 'Salaries Expense', type: 'EXPENSE', code: '5100' },
      { name: 'Utilities Expense', type: 'EXPENSE', code: '5200' },
    ];

    await tx.account.createMany({
      data: defaultAccounts.map(acc => ({
        ...acc,
        companyId: company.id
      }))
    })

    return user
  })
}

async function findByEmail(prisma, email) {
  return prisma.user.findUnique({
    where: { email },
    include: { companies: true } // include companies for login
  })
}

// Now list users by companyId means: fetch users that *own* that company
async function listUsers(prisma, userId, pagination = {}) {
  return prisma.user.findMany({
    where: {
      id: userId
    },
    skip: pagination.skip,
    take: pagination.take,
    include: { companies: true }
  })
}

module.exports = { createUser, findByEmail, listUsers }
