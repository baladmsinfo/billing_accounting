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
const { generateShortTenant,getShortName } = require('../src/utils/tenant')
const currencyData = require('./currencyList.json')

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
    {
      name: "Demo Trading Pvt Ltd",
      gstNumber: "27BBBBB0000B1Z6",
      primaryEmail: "info@demotrading.in",
      primaryPhoneNo: "9876501000",
      city: "Bengaluru",
      state: "Karnataka",
      pincode: 560001,
      companyType: "Private Limited",
    },
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

async function ensureBranches(company, count) {
  const branches = [];
  for (let i = 1; i <= count; i++) {
    const name = `${company.name} Branch ${i}`;
    let branch = await prisma.branch.findFirst({ where: { name, companyId: company.id } });
    if (!branch) {
      branch = await prisma.branch.create({
        data: {
          name,
          city: company.city,
          state: company.state,
          pincode: company.pincode,
          companyId: company.id,
          addressLine1: `Registered Office - ${company.city}`,
        },
      });
    } else {
      branch = await prisma.branch.update({
        where: { id: branch.id },
        data: {
          city: company.city,
          state: company.state,
          pincode: company.pincode,
          addressLine1: `Registered Office - ${company.city}`,
        },
      });
    }
    branches.push(branch);
  }
  return branches;
}

async function ensureAccounts(company) {
  const items = [
        { name: 'Cash', type: 'ASSET', code: '1000' },
        { name: 'Bank', type: 'ASSET', code: '1010' },
        { name: 'Accounts Receivable', type: 'ASSET', code: '1100' },
        { name: 'Inventory', type: 'ASSET', code: '1200' },
        { name: 'Tax Receivable', type: 'ASSET', code: '1300' },
        { name: 'Accounts Payable', type: 'LIABILITY', code: '2000' },
        { name: 'Tax Payable', type: 'LIABILITY', code: '2100' },
        { name: 'Owner Equity', type: 'EQUITY', code: '3000' },
        { name: 'Sales Revenue', type: 'INCOME', code: '4000' },
        { name: 'Purchases', type: 'EXPENSE', code: '5000' },
        { name: 'Rent Expense', type: 'EXPENSE', code: '5001' },
        { name: 'Salaries Expense', type: 'EXPENSE', code: '5100' },
        { name: 'Utilities Expense', type: 'EXPENSE', code: '5200' },
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

async function ensureCategories(company) {
  const parentNames = ["Groceries", "Beverages", "Household", "Personal Care"];
  const createdParents = [];
  for (const pn of parentNames) {
    let parent = await prisma.category.findFirst({ where: { name: pn, companyId: company.id } });
    if (!parent) parent = await prisma.category.create({ data: { name: pn, description: `${pn} parent`, companyId: company.id } });
    else parent = await prisma.category.update({ where: { id: parent.id }, data: { description: `${pn} parent` } });
    createdParents.push(parent);
  }

  // create children up to CONFIG.categoriesCount
  const childPool = ["Rice", "Atta", "Sugar", "Tea", "Coffee", "Chips", "Biscuits", "Milk", "Bread", "Spices", "Oil", "Sauces"];
  const createdChildren = [];
  const toCreate = Math.max(0, CONFIG.categoriesCount - createdParents.length);
  for (let i = 0; i < toCreate; i++) {
    const name = `${childPool[i % childPool.length]} ${Math.floor(i / childPool.length) + 1}`.trim();
    const parent = createdParents[i % createdParents.length];
    let child = await prisma.category.findFirst({ where: { name, companyId: company.id } });
    if (!child) child = await prisma.category.create({ data: { name, description: `${name} child`, parentId: parent.id, companyId: company.id } });
    else child = await prisma.category.update({ where: { id: child.id }, data: { description: `${name} child`, parentId: parent.id } });
    createdChildren.push(child);
  }

  return { parents: createdParents, children: createdChildren };
}

async function ensureProductsAndItems(company) {
  const categories = await prisma.category.findMany({ where: { companyId: company.id } });
  const itemsCreated = [];
  const baseNames = [
    "Ponni Rice",
    "Aashirvaad Atta",
    "Refined Sugar",
    "Tea Leaves",
    "Instant Coffee",
    "Cooking Oil",
    "Soap Bar",
    "Toothpaste",
    "Biscuits",
    "Milk Packet",
  ];

  for (let i = 1; i <= CONFIG.productsCount; i++) {
    const base = baseNames[(i - 1) % baseNames.length];
    const variant = `${base} ${i % 3 === 0 ? "1kg" : i % 2 === 0 ? "500g" : "250g"}`;
    const sku = `${company.id.slice(0, 6)}-PRD-${String(i).padStart(4, "0")}`;

    let product = await prisma.product.findUnique({ where: { sku } });
    if (!product) {
      product = await prisma.product.create({
        data: {
          name: variant,
          sku,
          description: `${variant} by ${company.name}`,
          companyId: company.id,
          categoryId: pick(categories).id,
        },
      });
    } else {
      product = await prisma.product.update({
        where: { id: product.id },
        data: { name: variant, description: `${variant} by ${company.name}`, categoryId: pick(categories).id },
      });
    }

    const itemSku = `${sku}-ITEM`;
    const price = Number((50 + (i * 7)) % 1000) + 30;
    const mrp = Number((price * 1.12).toFixed(2));
    const qty = 50 + (i % 120);

    let item = await prisma.item.findFirst({ where: { sku: itemSku, companyId: company.id } });
    if (!item) {
      item = await prisma.item.create({
        data: {
          sku: itemSku,
          price,
          MRP: mrp,
          quantity: qty,
          productId: product.id,
          companyId: company.id,
        },
      });
    } else {
      item = await prisma.item.update({
        where: { id: item.id },
        data: { price, MRP: mrp, quantity: qty, productId: product.id },
      });
    }

    itemsCreated.push(item);
  }

  return itemsCreated;
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

async function ensureUsers(company) {
  const passwordHash = await bcrypt.hash("admin123", 10);

  const adminEmail = `admin@${company.name.replace(/\s+/g, "").toLowerCase()}.local`;
  let admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        email: adminEmail,
        password: passwordHash,
        name: `${company.name} Admin`,
        role: "SUPERADMIN",
        status: true,
        companyId: company.id,
      },
    });
  } else {
    await prisma.user.update({ where: { id: admin.id }, data: { status: true, companyId: company.id } });
  }

  const staffEmail = `staff@${company.name.replace(/\s+/g, "").toLowerCase()}.local`;
  let staff = await prisma.user.findUnique({ where: { email: staffEmail } });
  if (!staff) {
    staff = await prisma.user.create({
      data: {
        email: staffEmail,
        password: passwordHash,
        name: `${company.name} Staff`,
        role: "USER",
        status: true,
        companyId: company.id,
      },
    });
  } else {
    await prisma.user.update({ where: { id: staff.id }, data: { status: true, companyId: company.id } });
  }

  return { admin, staff };
}

async function createInvoices(company, items, customers, vendors, taxRates) {
  // find some accounts if needed (not strictly required for invoice creation in schema)
  for (let i = 1; i <= CONFIG.invoicesCount; i++) {
    const isSale = i % 2 === 0;
    const invoiceNumber = `INV-${company.id.slice(0, 6)}-${i}`;
    let invoice = await prisma.invoice.findFirst({ where: { invoiceNumber, companyId: company.id } });
    if (invoice) {
      // skip duplicates
      continue;
    }

    const invoiceData = {
      invoiceNumber,
      companyId: company.id,
      type: isSale ? "SALE" : "PURCHASE",
      date: new Date(),
      status: "PENDING",
      totalAmount: 0,
      taxAmount: 0,
    };

    if (isSale) {
      invoiceData.customerId = pick(customers).id;
    } else {
      invoiceData.vendorId = pick(vendors).id;
    }

    invoice = await prisma.invoice.create({ data: invoiceData });

    // pick N lines
    const lines = [];
    for (let ln = 0; ln < CONFIG.invoiceLineQuantity; ln++) {
      const item = pick(items);
      const qty = intBetween(1, 5);
      const lineTotal = Number((item.price * qty).toFixed(2));
      const taxRate = pick(taxRates);
      const invItem = await prisma.invoiceItem.create({
        data: {
          invoiceId: invoice.id,
          itemId: item.id,
          productId: item.productId,
          quantity: qty,
          price: item.price,
          total: lineTotal,
          taxRateId: taxRate ? taxRate.id : null,
          status: "ORDERED",
        },
      });

      // Stock ledger entry
      await prisma.stockLedger.create({
        data: {
          companyId: company.id,
          itemId: item.id,
          date: new Date(),
          type: isSale ? "SALE" : "PURCHASE",
          quantity: qty,
          note: `${isSale ? "Sale" : "Purchase"} for invoice ${invoice.invoiceNumber}`,
        },
      });

      lines.push({ invItem, lineTotal, taxRate });
    }

    // compute totals and invoiceTax records
    let totalAmount = 0;
    let totalTax = 0;
    for (const l of lines) {
      totalAmount += l.lineTotal;
      if (l.taxRate) {
        // simple tax calculation: tax rate percentage on line total
        const taxAmount = Number(((l.lineTotal * l.taxRate.rate) / 100).toFixed(2));
        totalTax += taxAmount;

        // create invoiceTax entry if not exists for invoice+taxRate
        await prisma.invoiceTax.create({
          data: {
            invoiceId: invoice.id,
            taxRateId: l.taxRate.id,
            companyId: company.id,
            amount: taxAmount,
            invoiceType: isSale ? "SALE" : "PURCHASE",
          },
        });
      }
    }

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { totalAmount: Number(totalAmount.toFixed(2)), taxAmount: Number(totalTax.toFixed(2)) },
    });

    // Optionally create a payment record for partial / full payments (skipped by default)
  }
}

async function main() {
  console.log("🌱 Starting full idempotent seed...");

  await ensureCurrency();

  for (const c of CONFIG.companies) {
    console.log(`\n--- Seeding company: ${c.name} ---`);
    const company = await ensureCompany(c);
    await ensureBranches(company, CONFIG.branchesPerCompany);
    await ensureAccounts(company);
    const taxRates = await ensureTaxRates(company);
    const { parents, children } = await ensureCategories(company);
    const items = await ensureProductsAndItems(company);
    const { customers, vendors } = await ensureCustomersAndVendors(company);
    await ensureUsers(company);
    await createInvoices(company, items, customers, vendors, taxRates);

    console.log(`--- Done company: ${c.name} ---`);
  }

  console.log("🌱 Seed finished.");
}

main()
  .catch((err) => {
    console.error("SEED ERROR:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
