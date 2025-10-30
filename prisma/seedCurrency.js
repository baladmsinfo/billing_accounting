const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const currencies = [
    { code: "INR", name: "Indian Rupee", symbol: "₹", country: "India", isDefault: true },
    { code: "USD", name: "US Dollar", symbol: "$", country: "United States" },
    { code: "EUR", name: "Euro", symbol: "€", country: "European Union" },
    { code: "GBP", name: "British Pound", symbol: "£", country: "United Kingdom" },
    { code: "JPY", name: "Japanese Yen", symbol: "¥", country: "Japan" },
    { code: "AUD", name: "Australian Dollar", symbol: "A$", country: "Australia" },
    { code: "CAD", name: "Canadian Dollar", symbol: "C$", country: "Canada" },
    { code: "SGD", name: "Singapore Dollar", symbol: "S$", country: "Singapore" },
    { code: "AED", name: "UAE Dirham", symbol: "د.إ", country: "United Arab Emirates" },
  ];

  for (const data of currencies) {
    await prisma.currency.upsert({
      where: { code: data.code },
      update: {},
      create: data,
    });
  }

  console.log("✅ Currencies seeded successfully!");
}

main()
  .then(async () => await prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });