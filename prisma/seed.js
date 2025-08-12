const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcrypt')
const prisma = new PrismaClient()

async function main() {
  const salt = await bcrypt.genSalt(10)
  const pass = await bcrypt.hash('admin123', salt)
  const company = await prisma.company.create({ data: { name: 'Default Co' } })
  const admin = await prisma.user.create({ data: { email: 'admin@local', password: pass, name: 'Admin', role: 'SUPERADMIN', companyId: company.id } })

  // create sample product and items (inventory)
  const prod = await prisma.product.create({ data: { name: 'T-Shirt', sku: 'TSHIRT', description: 'Comfort cotton tee', companyId: company.id } })
  const item1 = await prisma.item.create({ data: { productId: prod.id, sku: 'TS-M-RED', price: 499, quantity: 50, location: 'WH-1', companyId: company.id } })
  const item2 = await prisma.item.create({ data: { productId: prod.id, sku: 'TS-L-BLUE', price: 549, quantity: 30, location: 'WH-1', companyId: company.id } })

  console.log('Seeded:', { companyId: company.id, adminId: admin.id, productId: prod.id, item1: item1.id, item2: item2.id })
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
