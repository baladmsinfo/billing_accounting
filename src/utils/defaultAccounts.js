'use strict'

// Default chart of accounts every company needs: POS checkout, invoices,
// payments and returns post journal entries against these by name.
const DEFAULT_ACCOUNTS = [
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
  // Contra Income (Sales Return)
  { name: 'Sales Return', type: 'INCOME', code: '4010' },

  // Expenses
  { name: 'Purchases', type: 'EXPENSE', code: '5000' },
  // Contra Expense (Purchase Return)
  { name: 'Purchase Return', type: 'EXPENSE', code: '5010' },
  { name: 'Rent Expense', type: 'EXPENSE', code: '5100' },
  { name: 'Salaries Expense', type: 'EXPENSE', code: '5200' },
  { name: 'Utilities Expense', type: 'EXPENSE', code: '5300' },
]

/**
 * Create whichever default accounts the company is missing (matched by name).
 * Safe to call repeatedly. `db` may be the prisma client or a transaction.
 */
async function ensureDefaultAccounts(db, companyId) {
  const existing = await db.account.findMany({
    where: { companyId },
    select: { name: true },
  })
  const have = new Set(existing.map((a) => a.name))
  const missing = DEFAULT_ACCOUNTS.filter((a) => !have.has(a.name))
  if (missing.length) {
    await db.account.createMany({
      data: missing.map((a) => ({ ...a, companyId })),
    })
  }
  return missing.length
}

/**
 * Resolve an account id by name. Companies created without a chart of accounts
 * (e.g. via /api/offline/register before it seeded one) get the defaults
 * created on first use instead of failing with "Account not found".
 */
async function getAccountId(db, companyId, name) {
  let acc = await db.account.findFirst({ where: { companyId, name } })
  if (!acc && DEFAULT_ACCOUNTS.some((a) => a.name === name)) {
    await ensureDefaultAccounts(db, companyId)
    acc = await db.account.findFirst({ where: { companyId, name } })
  }
  if (!acc) throw new Error(`Account not found: ${name}`)
  return acc.id
}

module.exports = { DEFAULT_ACCOUNTS, ensureDefaultAccounts, getAccountId }
