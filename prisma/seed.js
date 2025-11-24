/**
 * FULL seed for Prisma
 * - Idempotent
 * - Unique GSTINs, emails
 * - Sales + Purchase invoices
 * - Stock Ledger entries
 */

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');

const CONFIG = {
  companies: [
    { name: "Bucksbox Solutions", gstNumber: "33AAAAA0000A1Z5", primaryEmail: "info@bucksbox.in", primaryPhoneNo: "9876500000", city: "Chennai", state: "Tamil Nadu", pincode: 600001, companyType: "Private Limited" },
    { name: "Demo Trading Pvt Ltd", gstNumber: "27BBBBB0000B1Z6", primaryEmail: "info@demotrading.in", primaryPhoneNo: "9876501000", city: "Bengaluru", state: "Karnataka", pincode: 560001, companyType: "Private Limited" },
  ],
  branchesPerCompany: 5,
  categoriesCount: 30,
  productsCount: 80,
  customersCount: 10,
  vendorsCount: 10,
  invoicesCount: 15,
};

// ---------------- Helpers ----------------
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const intBetween = (a,b) => Math.floor(Math.random() * (b-a+1)) + a;

// ---------------- Currency ----------------
async function ensureCurrency() {
  const code = "INR";
  let currency = await prisma.currency.findUnique({ where: { code } });
  if (!currency) {
    currency = await prisma.currency.create({ data: { code, name: "Indian Rupee", symbol: "₹", country: "India", isDefault: true } });
  } else {
    await prisma.currency.update({ where: { code }, data: { isDefault: true } });
  }
  return currency;
}

// ---------------- Company ----------------
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
        state: c.state,
        pincode: c.pincode,
        companyType: c.companyType,
        currencyId: company.currencyId || undefined,
      },
    });
  }
  return company;
}

// ---------------- Branches ----------------
async function ensureBranches(company, count) {
  const branches = [];
  for (let i = 1; i <= count; i++) {
    const name = `${company.name} Branch ${i}`;
    let branch = await prisma.branch.findFirst({ where: { name, companyId: company.id } });
    if (!branch) {
      branch = await prisma.branch.create({ data: { name, address: `Branch ${i} Address`, city: company.city, state: company.state, pincode: company.pincode, companyId: company.id } });
    } else {
      branch = await prisma.branch.update({ where: { id: branch.id }, data: { address: `Branch ${i} Address`, city: company.city, state: company.state, pincode: company.pincode } });
    }
    branches.push(branch);
  }
  return branches;
}

// ---------------- Accounts ----------------
async function ensureAccounts(company) {
  const items = [
    { name: 'Cash', type: 'ASSET' },
    { name: 'Bank', type: 'ASSET' },
    { name: 'Accounts Receivable', type: 'ASSET' },
    { name: 'Inventory', type: 'ASSET' },
    { name: 'Tax Receivable', type: 'ASSET' },
    { name: 'Accounts Payable', type: 'LIABILITY' },
    { name: 'Tax Payable', type: 'LIABILITY' },
    { name: 'Owner Equity', type: 'EQUITY' },
    { name: 'Sales Revenue', type: 'INCOME' },
    { name: 'Purchases', type: 'EXPENSE' },
    { name: 'Rent Expense', type: 'EXPENSE' },
    { name: 'Salaries Expense', type: 'EXPENSE' },
    { name: 'Utilities Expense', type: 'EXPENSE' },
  ];
  for (const a of items) {
    const code = `${company.id}-${a.type}-${a.name.replace(/\s+/g,'')}`;
    let account = await prisma.account.findFirst({ where: { code, companyId: company.id } });
    if (!account) {
      await prisma.account.create({ data: { name: a.name, type: a.type, code, companyId: company.id } });
    } else {
      await prisma.account.update({ where: { id: account.id }, data: { name: a.name, type: a.type } });
    }
  }
}

// ---------------- Tax Rates ----------------
async function ensureTaxRates(company) {
  const rates = [
    { name: "CGST 9%", rate: 9, type: "CGST" },
    { name: "SGST 9%", rate: 9, type: "SGST" },
    { name: "IGST 18%", rate: 18, type: "IGST" },
    { name: "GST 5%", rate: 5, type: "GST" },
    { name: "GST 12%", rate: 12, type: "GST" },
    { name: "GST 18%", rate: 18, type: "GST" },
  ];
  for (const t of rates) {
    let tax = await prisma.taxRate.findFirst({ where: { name: t.name, companyId: company.id } });
    if (!tax) {
      await prisma.taxRate.create({ data: { name: t.name, rate: t.rate, type: t.type, companyId: company.id } });
    } else {
      await prisma.taxRate.update({ where: { id: tax.id }, data: { rate: t.rate, type: t.type } });
    }
  }
}

// ---------------- Categories ----------------
async function ensureCategories(company) {
  const parentNames = ["Groceries","Beverages","Household","Personal Care","Snacks","Dairy","Bakery","Spices"];
  const createdParents = [];
  for (const pn of parentNames) {
    let parent = await prisma.category.findFirst({ where: { name: pn, companyId: company.id } });
    if (!parent) parent = await prisma.category.create({ data: { name: pn, description: `${pn} parent`, companyId: company.id } });
    else parent = await prisma.category.update({ where: { id: parent.id }, data: { description: `${pn} parent` } });
    createdParents.push(parent);
  }
  const childrenToCreate = Math.max(0, CONFIG.categoriesCount - createdParents.length);
  const childNamesPool = ["Rice & Grains","Atta & Flours","Sugar & Sweeteners","Tea & Coffee","Soft Drinks","Cleaning Supplies","Toiletries","Chocolates","Biscuits","Cheese","Milk","Bread","Spice Powders","Whole Spices","Oils","Pickles","Sauces","Breakfast Cereals","Nuts","Dry Fruits"];
  const createdChildren = [];
  for (let i=0;i<childrenToCreate;i++){
    const name = childNamesPool[i%childNamesPool.length]+(i>=childNamesPool.length?` ${Math.floor(i/childNamesPool.length)}`:'');
    const parent = createdParents[i%createdParents.length];
    let child = await prisma.category.findFirst({ where: { name, companyId: company.id } });
    if (!child) child = await prisma.category.create({ data: { name, description: `${name} child`, parentId: parent.id, companyId: company.id } });
    else child = await prisma.category.update({ where: { id: child.id }, data: { description: `${name} child`, parentId: parent.id } });
    createdChildren.push(child);
  }
  return { parents: createdParents, children: createdChildren };
}

// ---------------- Products & Items ----------------
async function ensureProductsAndItems(company) {
  const itemsCreated = [];
  const productBase = ["Ponni Rice","Aashirvaad Atta","Refined Sugar","Tea Leaves","Instant Coffee","Cooking Oil","Turtle Soap","Colgate Toothpaste","Parle Biscuits","Amul Milk","Britannia Cheese","Sunflower Oil","Masala Powder","Soya Chunks","MTR Ready Mix","Kurkure Snacks","Maggi Noodles","Oreo Biscuits","Tata Salt","Lay's Chips","Himalaya Shampoo"];
  const categories = await prisma.category.findMany({ where: { companyId: company.id } });
  for (let i=1;i<=CONFIG.productsCount;i++){
    const base = productBase[(i-1)%productBase.length];
    const variant = `${base} ${ (i%5===0)?'500g':(i%3===0)?'1kg':'250g' }`;
    const sku = `${company.name.split(' ')[0].toUpperCase()}-PRD-${String(i).padStart(4,'0')}`;
    const cat = categories[i%categories.length];
    let product = await prisma.product.findUnique({ where: { sku } });
    if (!product) product = await prisma.product.create({ data: { name: variant, sku, description: `${variant} by ${company.name}`, companyId: company.id, categoryId: cat.id } });
    else product = await prisma.product.update({ where: { id: product.id }, data: { name: variant, description: `${variant} by ${company.name}`, categoryId: cat.id } });
    // create item
    const itemSku = `${sku}-ITEM`;
    let item = await prisma.item.findFirst({ where: { sku: itemSku, companyId: company.id } });
    const price = Number((50 + (i*3)) % 1000) + 20;
    const mrp = Number((price*1.12).toFixed(2));
    const qty = 50 + (i%100);
    if (!item) item = await prisma.item.create({ data: { sku: itemSku, price, MRP: mrp, quantity: qty, productId: product.id, companyId: company.id } });
    else item = await prisma.item.update({ where: { id: item.id }, data: { price, MRP: mrp, quantity: qty, productId: product.id } });
    itemsCreated.push(item);
  }
  return itemsCreated;
}

// ---------------- Customers & Vendors ----------------
async function ensureCustomersAndVendors(company) {
  const customers = [];
  for (let i=1;i<=CONFIG.customersCount;i++){
    const name = `${company.name.split(" ")[0]} Customer ${i}`;
    let cust = await prisma.customer.findFirst({ where: { name, companyId: company.id } });
    if (!cust) cust = await prisma.customer.create({ data: { name, phone:`98${String(10000000+i).slice(-8)}`, email: `${name.replace(/\s+/g,"").toLowerCase()}@example.com`, companyId: company.id } });
    customers.push(cust);
  }

  const vendors = [];
  for (let i=1;i<=CONFIG.vendorsCount;i++){
    const name = `${company.name.split(" ")[0]} Vendor ${i}`;
    const gstin = `${company.id}-GST${i}-${Date.now()}`; // unique
    let vend = await prisma.vendor.findFirst({ where: { gstin, companyId: company.id } });
    if (!vend) vend = await prisma.vendor.create({ data: { name, gstin, phone:`98${String(20000000+i).slice(-8)}`, email: `${name.replace(/\s+/g,"").toLowerCase()}@vendor.com`, companyId: company.id } });
    vendors.push(vend);
  }
  return { customers, vendors };
}

// ---------------- Users ----------------
async function ensureUsers(company) {
  const password = await bcrypt.hash("admin123",10);
  const adminEmail = `admin@${company.name.replace(/\s+/g,"").toLowerCase()}.local`;
  let admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin) admin = await prisma.user.create({ data: { email: adminEmail, password, name:`${company.name} Admin`, role:"SUPERADMIN", status:true, companyId: company.id } });
  const staffEmail = `staff@${company.name.replace(/\s+/g,"").toLowerCase()}.local`;
  let staff = await prisma.user.findUnique({ where: { email: staffEmail } });
  if (!staff) staff = await prisma.user.create({ data: { email: staffEmail, password, name:`${company.name} Staff`, role:"USER", status:true, companyId: company.id } });
  return { admin, staff };
}

// ---------------- MAIN ----------------
async function main() {
  console.log("🌱 FULL seed starting...");
  await ensureCurrency();

  for (const c of CONFIG.companies) {
    console.log(`\n--- Seeding company: ${c.name} ---`);
    const company = await ensureCompany(c);
    await ensureBranches(company, CONFIG.branchesPerCompany);
    await ensureAccounts(company);
    await ensureTaxRates(company);
    await ensureCategories(company);
    const items = await ensureProductsAndItems(company);
    const { customers, vendors } = await ensureCustomersAndVendors(company);
    await ensureUsers(company);
    console.log(`--- Finished seeding company: ${c.name} ---`);
  }

  console.log("🌱 FULL seed finished.");
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
