const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const bcrypt = require("bcryptjs");

async function main() {
    /* -------------------- Seed Currencies -------------------- */
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
    console.log("✅ Currencies seeded successfully");

    /* -------------------- Get INR Currency ID -------------------- */
    const INR = await prisma.currency.findUnique({
        where: { code: "INR" }
    });

    if (!INR) throw new Error("INR currency not found");

    const { v4: uuidv4 } = require("uuid");

    const privateKey = uuidv4();
    const publicKey = uuidv4();

    const company = await prisma.company.upsert({
        where: { publicapiKey: publicKey },
        update: {},
        create: {
            name: "Chronicles Cuisines Pvt Ltd",
            gstNumber: "33ABCDE1234F1Z5",

            primaryEmail: "support@chronicles.com",
            secondaryEmail: "info@chronicles.com",

            primaryPhoneNo: "9876543210",
            secondaryPhoneNo: "9123456780",

            companyType: "Private Limited",

            addressLine1: "12, Main Road",
            addressLine2: "Near Bus Stand",
            addressLine3: "South Zone Office",

            city: "Dindigul",
            state: "Tamil Nadu",
            pincode: 624001,

            currencyId: INR.id,

            privateapiKey: privateKey,
            publicapiKey: publicKey,
        },
    });


    /* -------------------- Seed Tax Rates -------------------- */
    const taxRates = [
        { name: "GST 5%", rate: 5, type: "GST" },
        { name: "GST 12%", rate: 12, type: "GST" },
        { name: "GST 18%", rate: 18, type: "GST", isDefault: true },
    ];

    for (const tr of taxRates) {
        await prisma.taxRate.upsert({
            where: { name: tr.name },
            update: {},
            create: {
                ...tr,
                companyId: company.id,
            },
        });
    }
    console.log("💰 Tax rates seeded successfully");

    const defaultTaxRate = await prisma.taxRate.findFirst({
        where: { companyId: company.id, isDefault: true }
    });

    /* -------------------- Seed Products -------------------- */
    const products = [
        {
            name: "Laptop",
            sku: "LAP-001",
            description: "High performance laptop",
            items: [
                { sku: "LAP-001-RED", price: 75000, quantity: 10, location: "Warehouse A" },
                { sku: "LAP-001-BLK", price: 74000, quantity: 12, location: "Warehouse B" }
            ]
        },
        {
            name: "Smartphone",
            sku: "PHN-011",
            description: "5G Android Smartphone",
            items: [
                { sku: "PHN-011-128GB", price: 29000, quantity: 20, location: "Warehouse A" }
            ]
        },
    ];

    for (const p of products) {
        const createdProduct = await prisma.product.upsert({
            where: { sku: p.sku },
            update: {},
            create: {
                name: p.name,
                sku: p.sku,
                description: p.description,
                companyId: company.id,
            }
        });

        for (const item of p.items) {
            const createdItem = await prisma.item.create({
                data: {
                    sku: item.sku,
                    price: item.price,
                    quantity: item.quantity,
                    location: item.location,
                    productId: createdProduct.id,
                    companyId: company.id,
                    taxRateId: defaultTaxRate?.id ?? null   // 🔥 TAX RATE HERE
                }
            });

            // Initial stock ledger
            await prisma.stockLedger.create({
                data: {
                    itemId: createdItem.id,
                    companyId: company.id,
                    type: "PURCHASE",
                    quantity: item.quantity,
                    note: "Initial stock on product creation"
                }
            });
        }
    }

    console.log("📦 Products + items seeded successfully");

    /* -------------------- Create Admin User -------------------- */
    const hashedPassword = await bcrypt.hash("Admin@123", 10);

    await prisma.user.upsert({
        where: { email: "nandha@example.com" },
        update: {},
        create: {
            name: "Nandha Gopi",
            email: "nandha@example.com",
            password: hashedPassword,
            role: "ADMIN",
            status: true,

            companyId: company.id,
        },
    });

    console.log("👤 Admin user created and linked with company:", company.name);

    console.log("🎉 Seeding completed successfully!");
}

main()
    .then(async () => await prisma.$disconnect())
    .catch(async (e) => {
        console.error("❌ Seed error: ", e);
        await prisma.$disconnect();
        process.exit(1);
    });
