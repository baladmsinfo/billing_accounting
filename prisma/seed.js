/**
 * Full idempotent Prisma seed for your schema
 *
 * - Uses findFirst / create / update (no reliance on composite unique constraints)
 * - Ensures unique emails, gstins, skus, invoiceNumbers
 * - Creates sale + purchase invoices with items and stock ledger
 *
 * Usage:
 *   node prisma/seed.js
 *
 * Note: adjust CONFIG counts as needed.
 */

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const bcrypt = require("bcrypt");
const { generateApiKey } = require('../src/utils/keyGenerator')
const { generateShortTenant, getShortName } = require('../src/utils/tenant')
const currencyData = require('./currencyList.json')

async function getAccountId(tx, companyId, name) {
  const acc = await tx.account.findFirst({
    where: { companyId, name }
  })
  if (!acc) {
    throw new Error(`Account not found: ${name}`)
  }
  return acc.id
}

const CONFIG = {
  companies: [
    {
      name: "Bucksbox Solutions",
      gstNumber: "33AAAAA0000A1Z5",
      primaryEmail: "info@bucksbox.in",
      primaryPhoneNo: "9876500000",
      city: "Chennai",
      state: "Tamil Nadu",
      pincode: 600001,
      companyType: "Private Limited",
    },
    // {
    //   name: "Demo Trading Pvt Ltd",
    //   gstNumber: "27BBBBB0000B1Z6",
    //   primaryEmail: "info@demotrading.in",
    //   primaryPhoneNo: "9876501000",
    //   city: "Bengaluru",
    //   state: "Karnataka",
    //   pincode: 560001,
    //   companyType: "Private Limited",
    // },
  ],
  branchesPerCompany: 3,
  categoriesCount: 12,
  productsCount: 40,
  customersCount: 8,
  vendorsCount: 6,
  invoicesCount: 8,
  invoiceLineQuantity: 3, // per invoice
};

// small helpers
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const intBetween = (a, b) =>
  Math.floor(Math.random() * (b - a + 1)) + a;

// ---- Seed functions ----

async function ensureCurrency() {
  console.log("Seeding currencies with upsert...");

  if (!currencyData || typeof currencyData !== "object") {
    throw new Error("currencyData is missing or invalid");
  }

  const entries = Object.values(currencyData); // Works because your JSON is an object, not an array.

  for (const c of entries) {
    await prisma.currency.upsert({
      where: { code: c.code },
      update: {
        name: c.name,
        symbol: c.symbol,
        country: c.name, // you can change to c.country if available
        decimalDigits: c.decimal_digits ?? null,
        rounding: c.rounding ?? null,
        isDefault: c.code === "INR", // INR is default
      },
      create: {
        code: c.code,
        name: c.name,
        symbol: c.symbol,
        country: c.name,
        decimalDigits: c.decimal_digits ?? null,
        rounding: c.rounding ?? null,
        isDefault: c.code === "INR",
      }
    });
  }

  // Ensure ONLY INR is default
  await prisma.currency.updateMany({
    where: { code: { not: "INR" } },
    data: { isDefault: false }
  });

  console.log("Currency UPSERT completed successfully.");
}

async function ensureCompany(c) {
  let company = await prisma.company.findFirst({ where: { name: c.name } });
  if (!company) {
    company = await prisma.company.create({
      data: {
        name: c.name,
        gstNumber: c.gstNumber,
        primaryEmail: c.primaryEmail,
        primaryPhoneNo: c.primaryPhoneNo,
        addressLine1: `Registered Office - ${c.city}`,
        city: c.city,
        state: c.state,
        pincode: c.pincode,
        shortname: await generateShortTenant(c.name),
        tenant: await getShortName(c.name),
        publicapiKey: generateApiKey(),
        privateapiKey: generateApiKey(),
        companyType: c.companyType,
        currency: { connect: { code: "INR" } },
      },
    });
  } else {
    company = await prisma.company.update({
      where: { id: company.id },
      data: {
        gstNumber: c.gstNumber,
        primaryEmail: c.primaryEmail,
        primaryPhoneNo: c.primaryPhoneNo,
        addressLine1: `Registered Office - ${c.city}`,
        city: c.city,
        shortname: await generateShortTenant(c.name),
        tenant: await getShortName(c.name),
        publicapiKey: generateApiKey(),
        privateapiKey: generateApiKey(),
        state: c.state,
        pincode: c.pincode,
        companyType: c.companyType,
      },
    });
  }
  return company;
}

async function ensureBranches(company) {
  const branches = [];

  let mainBranch = await prisma.branch.findFirst({
    where: { companyId: company.id, main: true }
  });

  if (!mainBranch) {
    mainBranch = await prisma.branch.create({
      data: {
        name: "Main Branch",
        main: true,
        companyId: company.id,
        addressLine1: "Default Address",
        city: "Chennai",
        pincode: 600001
      }
    });
  }

  branches.push(mainBranch);

  return branches;
}

async function ensureAccounts(company) {
  const items = [
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
  ];

  for (const a of items) {
    const code = `${company.id.slice(0, 8)}-${a.type}-${a.name.replace(/\s+/g, "")}`;
    let account = await prisma.account.findFirst({ where: { code, companyId: company.id } });
    if (!account) {
      await prisma.account.create({ data: { name: a.name, type: a.type, code, companyId: company.id } });
    } else {
      await prisma.account.update({ where: { id: account.id }, data: { name: a.name, type: a.type } });
    }
  }
}

async function ensureTaxRates(company) {
  const base = [
    { name: "GST 5%", rate: 5, type: "GST" },
    { name: "GST 12%", rate: 12, type: "GST" },
    { name: "GST 18%", rate: 18, type: "GST" },
  ];
  for (const t of base) {
    let tr = await prisma.taxRate.findFirst({ where: { name: t.name, companyId: company.id } });
    if (!tr) {
      await prisma.taxRate.create({ data: { ...t, companyId: company.id } });
    } else {
      await prisma.taxRate.update({ where: { id: tr.id }, data: { rate: t.rate, type: t.type } });
    }
  }
  return prisma.taxRate.findMany({ where: { companyId: company.id } });
}

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

async function ensureCategories(company) {
  const parentPool = [
    "Groceries", "Beverages", "Household", "Personal Care", "Stationery",
    "Electronics", "Dairy", "Snacks", "Frozen Foods", "Bakery",
    "Spices", "Condiments", "Baby Care", "Pet Supplies", "Cleaning",
    "Health", "Beauty", "Kitchenware", "Clothing", "Footwear",
    "Home Decor", "Gardening", "Automotive", "Books", "Toys"
  ]

  const childPool = [
    "Premium", "Budget", "Organic", "Daily Use", "Bulk Pack",
    "Small Pack", "Family Pack", "Imported", "Local", "Eco Friendly"
  ]

  const parents = []
  const children = []

  for (let i = 0; i < 25; i++) {
    const parentName = parentPool[i]
    let parent = await prisma.category.findFirst({
      where: { name: parentName, companyId: company.id }
    })

    if (!parent) {
      parent = await prisma.category.create({
        data: {
          name: parentName,
          description: `${parentName} category`,
          companyId: company.id
        }
      })
    }

    parents.push(parent)

    const childCount = rand(5, 10)

    for (let j = 1; j <= childCount; j++) {
      const childName = `${parentName} ${pick(childPool)} ${j}`

      let child = await prisma.category.findFirst({
        where: { name: childName, companyId: company.id }
      })

      if (!child) {
        child = await prisma.category.create({
          data: {
            name: childName,
            description: `${childName} sub category`,
            parentId: parent.id,
            companyId: company.id
          }
        })
      }

      children.push(child)
    }
  }

  return { parents, children }
}

async function ensureProductsAndItems(company) {
  const subCategories = await prisma.category.findMany({
    where: {
      companyId: company.id,
      parentId: { not: null }
    }
  })

  const productBaseNames = [
    "Rice", "Atta", "Sugar", "Tea", "Coffee",
    "Oil", "Soap", "Toothpaste", "Biscuits", "Milk",
    "Shampoo", "Spices", "Snacks", "Juice", "Detergent"
  ]

  const sizeVariants = ["100g", "250g", "500g", "1kg", "2kg", "5kg"]

  const itemsCreated = []

  for (const sub of subCategories) {
    const productCount = Math.max(5, rand(5, 8))

    for (let p = 1; p <= productCount; p++) {
      const base = pick(productBaseNames)
      const productName = `${sub.name} ${base}`
      const sku = `${company.id.slice(0, 4)}-${sub.id.slice(0, 4)}-P${p}`

      let product = await prisma.product.findUnique({ where: { sku } })

      if (!product) {
        product = await prisma.product.create({
          data: {
            name: productName,
            sku,
            description: `${productName} by ${company.name}`,
            companyId: company.id,
            categoryId: sub.parentId,
            subCategoryId: sub.id
          }
        })
      }

      const itemCount = rand(2, 10)

      for (let i = 1; i <= itemCount; i++) {
        const size = pick(sizeVariants)
        const itemSku = `${sku}-I${i}`
        const price = rand(40, 1200)
        const mrp = Number((price * 1.15).toFixed(2))

        let item = await prisma.item.findFirst({
          where: { sku: itemSku, companyId: company.id }
        })

        if (!item) {
          item = await prisma.item.create({
            data: {
              sku: itemSku,
              variant: size,
              price,
              MRP: mrp,
              productId: product.id,
              companyId: company.id
            }
          })
        }

        itemsCreated.push(item)
      }
    }
  }

  return itemsCreated
}

async function ensureCustomersAndVendors(company) {
  const customers = [];
  for (let i = 1; i <= CONFIG.customersCount; i++) {
    const name = `${company.name.split(" ")[0]} Customer ${i}`;
    const email = `${company.name.split(" ")[0].toLowerCase()}.cust${i}@example.com`;
    let cust = await prisma.customer.findFirst({ where: { OR: [{ email }, { name, companyId: company.id }], companyId: company.id } });
    if (!cust) {
      cust = await prisma.customer.create({ data: { name, email, phone: `98${String(10000000 + i).slice(-8)}`, companyId: company.id } });
    } else {
      cust = await prisma.customer.update({ where: { id: cust.id }, data: { phone: cust.phone || `98${String(10000000 + i).slice(-8)}` } });
    }
    customers.push(cust);
  }

  const vendors = [];
  for (let i = 1; i <= CONFIG.vendorsCount; i++) {
    const name = `${company.name.split(" ")[0]} Vendor ${i}`;
    const gstin = `${company.id.slice(0, 8)}GST${i}`;
    let vend = await prisma.vendor.findFirst({ where: { gstin, companyId: company.id } });
    if (!vend) {
      vend = await prisma.vendor.create({ data: { name, gstin, phone: `80${String(20000000 + i).slice(-8)}`, email: `${name.replace(/\s+/g, "").toLowerCase()}@vendor.com`, companyId: company.id } });
    } else {
      vend = await prisma.vendor.update({ where: { id: vend.id }, data: { phone: vend.phone || `80${String(20000000 + i).slice(-8)}` } });
    }
    vendors.push(vend);
  }
  return { customers, vendors };
}

async function ensureUsers(company, branches) {
  const passwordHash = await bcrypt.hash("bucksbox", 8);

  const adminEmail = `admin@${company.name.replace(/\s+/g, "").toLowerCase()}.local`;
  let admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        email: adminEmail,
        password: passwordHash,
        name: `${company.name} Admin`,
        role: "ADMIN",
        status: true,
        companyId: company.id,
      },
    });
  } else {
    admin = await prisma.user.update({
      where: { id: admin.id },
      data: { status: true, companyId: company.id }
    });
  }

  const branchEmail = `branch@${company.name.replace(/\s+/g, "").toLowerCase()}.local`;
  let branchUser = await prisma.user.findUnique({ where: { email: branchEmail } });

  if (!branchUser) {
    branchUser = await prisma.user.create({
      data: {
        email: branchEmail,
        password: passwordHash,
        name: `${company.name} Branch Main`,
        role: "BRANCHADMIN",
        status: true,
        companyId: company.id,
        branchId: branches[0].id   // 🟢 FIXED
      },
    });
  } else {
    branchUser = await prisma.user.update({
      where: { id: branchUser.id },
      data: {
        status: true,
        companyId: company.id,
        branchId: branches[0].id
      },
    });
  }

  return { admin, branchUser };
}

async function createInvoices(company, branches, items, customers, vendors, taxRates) {
  for (let i = 1; i <= CONFIG.invoicesCount; i++) {
    const isSale = i % 2 === 0
    const invoiceNumber = `INV-${company.id.slice(0, 6)}-${i}`

    const exists = await prisma.invoice.findFirst({
      where: { invoiceNumber, companyId: company.id }
    })
    if (exists) continue

    const branch = pick(branches)   // 🟢 ADD THIS

    await prisma.$transaction(async (tx) => {
      let totalAmount = 0
      let totalTax = 0

      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          companyId: company.id,
          branchId: branch.id,          // 🟢 ADDED
          type: isSale ? 'SALE' : 'PURCHASE',
          status: 'PENDING',
          date: new Date(),
          customerId: isSale ? pick(customers).id : null,
          vendorId: !isSale ? pick(vendors).id : null,
          totalAmount: 0,
          taxAmount: 0
        }
      })

      // ---- Invoice Items ----
      for (let ln = 0; ln < CONFIG.invoiceLineQuantity; ln++) {
        const item = pick(items)
        const qty = intBetween(1, 5)
        const lineTotal = Number((item.price * qty).toFixed(2))
        const taxRate = pick(taxRates)

        totalAmount += lineTotal

        let taxAmt = 0
        if (taxRate) {
          taxAmt = Number(((lineTotal * taxRate.rate) / 100).toFixed(2))
          totalTax += taxAmt

          await tx.invoiceTax.create({
            data: {
              invoiceId: invoice.id,
              taxRateId: taxRate.id,
              companyId: company.id,
              invoiceType: isSale ? 'SALE' : 'PURCHASE',
              amount: taxAmt
            }
          })
        }

        await tx.invoiceItem.create({
          data: {
            invoiceId: invoice.id,
            itemId: item.id,
            productId: item.productId,
            quantity: qty,
            price: item.price,
            total: lineTotal,
            taxRateId: taxRate?.id ?? null,
            status: 'ORDERED',
          }
        })

        // ---- Stock Ledger ----
        await tx.stockLedger.create({
          data: {
            companyId: company.id,
            branchId: branch.id,
            itemId: item.id,
            type: isSale ? 'SALE' : 'PURCHASE',
            quantity: qty,
            note: `${isSale ? 'Sale' : 'Purchase'} for ${invoice.invoiceNumber}`
          }
        })
      }

      // ---- Update totals ----
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          totalAmount: Number(totalAmount.toFixed(2)),
          taxAmount: Number(totalTax.toFixed(2))
        }
      })

      const description = `${isSale ? 'Invoice' : 'Purchase Invoice'} ${invoice.invoiceNumber}`

      // ======================================================
      // 🧾 JOURNAL ENTRIES (NO BRANCH NEEDED — SCHEMA HAS NONE)
      // ======================================================

      if (isSale) {
        await tx.journalEntry.create({
          data: {
            companyId: company.id,
            accountId: await getAccountId(tx, company.id, 'Accounts Receivable'),
            date: invoice.date,
            description,
            debit: Number((totalAmount + totalTax).toFixed(2)),
            credit: 0
          }
        })

        await tx.journalEntry.create({
          data: {
            companyId: company.id,
            accountId: await getAccountId(tx, company.id, 'Sales Revenue'),
            date: invoice.date,
            description,
            debit: 0,
            credit: Number(totalAmount.toFixed(2))
          }
        })

        if (totalTax > 0) {
          await tx.journalEntry.create({
            data: {
              companyId: company.id,
              accountId: await getAccountId(tx, company.id, 'Tax Payable'),
              date: invoice.date,
              description,
              debit: 0,
              credit: Number(totalTax.toFixed(2))
            }
          })
        }
      } else {
        await tx.journalEntry.create({
          data: {
            companyId: company.id,
            accountId: await getAccountId(tx, company.id, 'Purchases'),
            date: invoice.date,
            description,
            debit: Number(totalAmount.toFixed(2)),
            credit: 0
          }
        })

        if (totalTax > 0) {
          await tx.journalEntry.create({
            data: {
              companyId: company.id,
              accountId: await getAccountId(tx, company.id, 'Tax Receivable'),
              date: invoice.date,
              description,
              debit: Number(totalTax.toFixed(2)),
              credit: 0
            }
          })
        }

        await tx.journalEntry.create({
          data: {
            companyId: company.id,
            accountId: await getAccountId(tx, company.id, 'Accounts Payable'),
            date: invoice.date,
            description,
            debit: 0,
            credit: Number((totalAmount + totalTax).toFixed(2))
          }
        })
      }
    })
  }
}

async function seedExpenses(company, branches) {
  const branchId = branches?.[0]?.id ?? null;

  const expenseCategories = [
    'Rent',
    'Electricity',
    'Office Supplies',
    'Internet',
    'Fuel'
  ];

  const taxRates = await prisma.taxRate.findMany({
    where: { companyId: company.id }
  });

  for (let i = 1; i <= 8; i++) {
    const category = expenseCategories[i % expenseCategories.length];
    const amount = Math.floor(Math.random() * 12000) + 800;
    const useTax = Math.random() > 0.4;

    await seedCreateExpense({
      prisma,
      companyId: company.id,
      branchId,
      category,
      date: new Date(),
      amount,
      note: `Seeded ${category} expense #${i}`,
      taxRateId: useTax ? taxRates[i % taxRates.length]?.id : null
    });
  }
}

async function seedCreateExpense({
  prisma,
  companyId,
  branchId = null,
  category,
  date,
  amount,
  note,
  taxRateId = null,
  imageId = null,
  imageUrl = null
}) {
  const expenseAccountMap = {
    Rent: 'Rent Expense',
    Electricity: 'Utilities Expense',
    Internet: 'Utilities Expense',
    Fuel: 'Utilities Expense',
    'Office Supplies': 'Purchases'
  };

  const expenseAccountName = expenseAccountMap[category];
  if (!expenseAccountName) {
    throw new Error(`No expense account mapped for category: ${category}`);
  }

  const expenseAccount = await prisma.account.findFirst({
    where: {
      companyId,
      type: 'EXPENSE',
      name: expenseAccountName
    }
  });

  const cashAccount = await prisma.account.findFirst({
    where: {
      companyId,
      type: 'ASSET',
      name: 'Cash'
    }
  });

  if (!expenseAccount || !cashAccount) {
    throw new Error(
      `Required accounts not found (Expense: ${expenseAccountName}, Cash)`
    );
  }

  // ------------------------ NO TAX -------------------------
  if (!taxRateId) {
    await prisma.$transaction(async (tx) => {
      await tx.journalEntry.create({
        data: {
          companyId,
          date,
          description: note ?? `${category} Expense`,
          debit: amount,
          credit: 0,
          accountId: expenseAccount.id
        }
      });

      await tx.journalEntry.create({
        data: {
          companyId,
          date,
          description: note ?? `${category} Expense Payment`,
          debit: 0,
          credit: amount,
          accountId: cashAccount.id
        }
      });
    });

    return null;
  }

  // ------------------------ WITH TAX -------------------------
  return prisma.$transaction(async (tx) => {
    const tax = await tx.taxRate.findUnique({ where: { id: taxRateId } });
    if (!tax) throw new Error('Tax rate not found');

    const taxAmount = Number(((amount * tax.rate) / 100).toFixed(2));
    const total = Number((amount + taxAmount).toFixed(2));

    const invoice = await tx.invoice.create({
      data: {
        companyId,
        branchId,              // 🔥 NEW FIELD
        date,
        dueDate: date,
        type: 'EXPENSE',
        status: 'PAID',
        totalAmount: total,
        taxAmount,
        customerId: null,
        vendorId: null,
        invoiceNumber: `EXP-${Date.now()}`
      }
    });

    await tx.invoiceTax.create({
      data: {
        invoiceId: invoice.id,
        companyId,
        taxRateId,
        invoiceType: 'EXPENSE',
        amount: taxAmount
      }
    });

    const taxPayableAccountId = await getAccountId(tx, companyId, 'Tax Payable');

    const description = note ?? `Expense Invoice ${invoice.invoiceNumber}`;

    await tx.journalEntry.create({
      data: {
        companyId,
        date,
        description,
        debit: amount,
        credit: 0,
        accountId: expenseAccount.id
      }
    });

    await tx.journalEntry.create({
      data: {
        companyId,
        date,
        description,
        debit: taxAmount,
        credit: 0,
        accountId: taxPayableAccountId
      }
    });

    await tx.journalEntry.create({
      data: {
        companyId,
        date,
        description,
        debit: 0,
        credit: total,
        accountId: cashAccount.id
      }
    });

    return invoice;
  });
}

async function main() {
  console.log("🌱 Starting full idempotent seed...");

  await ensureCurrency();

  for (const c of CONFIG.companies) {

    console.log(`\n--- Seeding company: ${c.name} ---`);

    const company = await ensureCompany(c);

    const branches = await ensureBranches(company);   // ✅ MUST BE HERE
    // console.log("DEBUG BRANCHES:", branches);

    const { admin, branchUser } = await ensureUsers(company, branches);  // NEEDS BRANCHES

    await ensureAccounts(company);

    const taxRates = await ensureTaxRates(company);

    const { parents, children } = await ensureCategories(company);

    const items = await ensureProductsAndItems(company);

    const { customers, vendors } = await ensureCustomersAndVendors(company);

    await createInvoices(company, branches, items, customers, vendors, taxRates);

    await seedExpenses(company, branches);

    console.log(`🌱 Company ${company.name} seeded successfully.`);
  }
}

main()
  .catch((e) => {
    console.error("SEED ERROR:", e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });