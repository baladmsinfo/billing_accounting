// prisma/seed.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const COMPANY_ID = "d66a3d3d-9c15-422f-9f53-4c6e71cda799";

async function main() {
    console.log("🌱 Seeding started...");

    // 1️⃣ TAX RATES
    const taxRates = [
        { name: "GST 5%", rate: 5, type: "GST" },
        { name: "GST 12%", rate: 12, type: "GST" },
        { name: "GST 18%", rate: 18, type: "GST" },
        { name: "IGST 12%", rate: 12, type: "IGST" },
        { name: "VAT 10%", rate: 10, type: "VAT" },
    ];

    for (const t of taxRates) {
        const existing = await prisma.taxRate.findFirst({
            where: { name: t.name, companyId: COMPANY_ID },
        });

        if (!existing) {
            await prisma.taxRate.create({
                data: { ...t, companyId: COMPANY_ID },
            });
        }
    }
    console.log("✔ Tax Rates seeded");

    // -----------------------------------------
    // 2️⃣  25+ CATEGORIES with SUB-CATEGORIES
    // -----------------------------------------
    const categories = [
        { name: "Electronics", children: ["Mobiles", "Laptops", "Tablets", "Cameras"] },
        { name: "Groceries", children: ["Vegetables", "Fruits", "Snacks", "Beverages", "Cereals"] },
        { name: "Fashion", children: ["Men", "Women", "Kids", "Footwear"] },
        { name: "Home Appliances", children: ["Kitchen", "Cleaning", "Ironing", "Cooling", "Heating"] },
        { name: "Furniture", children: ["Living Room", "Bedroom", "Office", "Outdoor"] },
        { name: "Sports", children: ["Gym", "Cricket", "Football", "Badminton"] },
        { name: "Beauty", children: ["Makeup", "Skincare", "Haircare"] },
        { name: "Books", children: ["Novels", "Comics", "School Books"] },
        { name: "Automotive", children: ["Car Accessories", "Bike Accessories", "Oils"] },
        { name: "Toys", children: ["Learning", "Action Figures", "Soft Toys"] },
        { name: "Pet Supplies", children: ["Dog", "Cat", "Bird", "Fish"] },
        { name: "Pharmacy", children: ["Medicines", "Supplements", "Health Care"] },
        { name: "Hardware", children: ["Tools", "Pipes", "Electrical"] },
        { name: "Baby Products", children: ["Feeding", "Care", "Toys"] },
        { name: "Jewellery", children: ["Gold", "Silver", "Fashion"] },
        { name: "Stationery", children: ["Pens", "Books", "Office Supplies"] },
        { name: "Gadgets", children: ["Smartwatch", "Earbuds", "Power Banks"] },
        { name: "Kitchenware", children: ["Cookware", "Storage", "Dinner Set"] },
        { name: "Footwear", children: ["Men", "Women", "Kids"] },
        { name: "Garden", children: ["Plants", "Tools", "Seeds"] },
        { name: "Music", children: ["Guitars", "Keyboards", "Drums"] },
        { name: "Games", children: ["Board Games", "Gaming Consoles", "Accessories"] },
        { name: "Safety", children: ["Masks", "PPE Kits", "Sanitizers"] },
        { name: "CCTV & Security", children: ["Cameras", "Alarms", "Sensors"] },
        { name: "Mobile Accessories", children: ["Cases", "Cables", "Chargers"] }
    ];

    for (const c of categories) {
        // Check & create parent category if not exists
        let parent = await prisma.category.findFirst({
            where: { name: c.name, companyId: COMPANY_ID },
        });

        if (!parent) {
            parent = await prisma.category.create({
                data: {
                    name: c.name,
                    description: null,
                    companyId: COMPANY_ID,
                },
            });
        }

        // Subcategories seeding
        for (const sub of c.children) {
            const existingSub = await prisma.category.findFirst({
                where: { name: sub, companyId: COMPANY_ID },
            });

            if (!existingSub) {
                await prisma.category.create({
                    data: {
                        name: sub,
                        description: null,
                        parentId: parent.id,
                        companyId: COMPANY_ID,
                    },
                });
            }
        }
    }
    console.log("✔ 25+ Categories & Subcategories seeded");

    // -----------------------------------------
    // 3️⃣  CREATE SAMPLE PRODUCTS
    // -----------------------------------------
    const mobileCategory = await prisma.category.findFirst({
        where: { name: "Mobiles", companyId: COMPANY_ID },
    });

    const laptopCategory = await prisma.category.findFirst({
        where: { name: "Laptops", companyId: COMPANY_ID },
    });

    const sportsCategory = await prisma.category.findFirst({
        where: { name: "Cricket", companyId: COMPANY_ID },
    });

    const products = [
        {
            name: "iPhone 15 Pro",
            sku: "IP15P-001",
            description: "Latest Apple flagship",
            categoryId: mobileCategory.parentId,
            subCategoryId: mobileCategory.id,
            items: [
                { variant: "128GB", price: 129999, quantity: 10, MRP: 139999, location: "Main Store", taxRateName: "GST 18%" },
                { variant: "256GB", price: 139999, quantity: 8, MRP: 149999, location: "Main Store", taxRateName: "GST 18%" },
            ],
        },
        {
            name: "Dell Inspiron 14",
            sku: "D-INSP-14",
            description: "14-inch business laptop",
            categoryId: laptopCategory.parentId,
            subCategoryId: laptopCategory.id,
            items: [
                { variant: "8GB / 512GB", price: 62999, quantity: 12, MRP: 68999, location: "Warehouse A", taxRateName: "GST 18%" },
            ],
        },
        {
            name: "MRF Cricket Bat",
            sku: "MRF-BAT-01",
            description: "English Willow Bat",
            categoryId: sportsCategory.parentId,
            subCategoryId: sportsCategory.id,
            items: [
                { variant: "Standard Size", price: 5999, quantity: 25, MRP: 6999, location: "Warehouse B", taxRateName: "GST 12%" },
            ],
        },

        // ---------------- ADDITIONAL 25 PRODUCTS ----------------

        {
            name: "Samsung Galaxy S24",
            sku: "S24-001",
            description: "Latest Samsung smartphone",
            categoryId: mobileCategory.parentId,
            subCategoryId: mobileCategory.id,
            items: [{ variant: "256GB", price: 99999, quantity: 15, MRP: 109999, location: "Main Store", taxRateName: "GST 18%" }],
        },
        {
            name: "Redmi Note 14",
            sku: "RN14-001",
            description: "Budget performance smartphone",
            categoryId: mobileCategory.parentId,
            subCategoryId: mobileCategory.id,
            items: [{ variant: "128GB", price: 18999, quantity: 40, MRP: 19999, location: "Main Store", taxRateName: "GST 18%" }],
        },
        {
            name: "OnePlus 12",
            sku: "OP12-001",
            description: "Premium performance smartphone",
            categoryId: mobileCategory.parentId,
            subCategoryId: mobileCategory.id,
            items: [{ variant: "256GB", price: 69999, quantity: 20, MRP: 74999, location: "Warehouse C", taxRateName: "GST 18%" }],
        },
        {
            name: "HP Pavilion 15",
            sku: "HP-PAV-15",
            description: "Pavilion series work laptop",
            categoryId: laptopCategory.parentId,
            subCategoryId: laptopCategory.id,
            items: [{ variant: "16GB / 1TB", price: 82999, quantity: 10, MRP: 89999, location: "Warehouse A", taxRateName: "GST 18%" }],
        },
        {
            name: "Lenovo ThinkPad X1",
            sku: "THINK-X1",
            description: "Business productivity laptop",
            categoryId: laptopCategory.parentId,
            subCategoryId: laptopCategory.id,
            items: [{ variant: "16GB / 1TB", price: 124999, quantity: 6, MRP: 129999, location: "Warehouse A", taxRateName: "GST 18%" }],
        },
        {
            name: "Acer Aspire 7",
            sku: "A-ASP-7",
            description: "Gaming + productivity budget laptop",
            categoryId: laptopCategory.parentId,
            subCategoryId: laptopCategory.id,
            items: [{ variant: "16GB / 512GB", price: 58999, quantity: 18, MRP: 62999, location: "Main Store", taxRateName: "GST 18%" }],
        },
        {
            name: "Nikon D5600 DSLR",
            sku: "NIK-D5600",
            description: "Professional DSLR camera",
            categoryId: mobileCategory.parentId,
            subCategoryId: mobileCategory.id,
            items: [{ variant: "Body + 18-55mm", price: 55999, quantity: 9, MRP: 59999, location: "Warehouse B", taxRateName: "GST 18%" }],
        },
        {
            name: "Sony Alpha A7 III",
            sku: "SONY-A7III",
            description: "Mirrorless professional camera",
            categoryId: mobileCategory.parentId,
            subCategoryId: mobileCategory.id,
            items: [{ variant: "Body Only", price: 157999, quantity: 4, MRP: 162999, location: "Warehouse B", taxRateName: "GST 18%" }],
        },
        {
            name: "Logitech G102 Mouse",
            sku: "LOGI-G102",
            description: "Gaming wired mouse",
            categoryId: laptopCategory.parentId,
            subCategoryId: laptopCategory.id,
            items: [{ variant: "Standard", price: 1499, quantity: 60, MRP: 1799, location: "Main Store", taxRateName: "GST 18%" }],
        },
        {
            name: "Boat Airdopes 181",
            sku: "BT-181",
            description: "Bluetooth earbuds",
            categoryId: mobileCategory.parentId,
            subCategoryId: mobileCategory.id,
            items: [{ variant: "Standard", price: 1499, quantity: 100, MRP: 1999, location: "Main Store", taxRateName: "GST 18%" }],
        },
        {
            name: "JBL Bluetooth Speaker",
            sku: "JBL-SPK-01",
            description: "Portable speaker",
            categoryId: mobileCategory.parentId,
            subCategoryId: mobileCategory.id,
            items: [{ variant: "Standard", price: 3999, quantity: 30, MRP: 4499, location: "Main Store", taxRateName: "GST 18%" }],
        },
        {
            name: "Cricket Helmet",
            sku: "CRKT-HELM-01",
            description: "Professional cricket helmet",
            categoryId: sportsCategory.parentId,
            subCategoryId: sportsCategory.id,
            items: [{ variant: "Standard", price: 2499, quantity: 40, MRP: 2999, location: "Warehouse B", taxRateName: "GST 12%" }],
        },
        {
            name: "SG Test Pads",
            sku: "SG-PADS-01",
            description: "Batting leg pads",
            categoryId: sportsCategory.parentId,
            subCategoryId: sportsCategory.id,
            items: [{ variant: "Standard", price: 1999, quantity: 35, MRP: 2399, location: "Warehouse B", taxRateName: "GST 12%" }],
        },
        {
            name: "Yonex Badminton Racket",
            sku: "YONEX-RKT-01",
            description: "High tension racket",
            categoryId: sportsCategory.parentId,
            subCategoryId: sportsCategory.id,
            items: [{ variant: "Standard", price: 3499, quantity: 22, MRP: 3999, location: "Main Store", taxRateName: "GST 12%" }],
        },
        {
            name: "Adidas Sports Shoes",
            sku: "ADID-SHOE-01",
            description: "Running shoes",
            categoryId: sportsCategory.parentId,
            subCategoryId: sportsCategory.id,
            items: [{ variant: "Size 9", price: 4999, quantity: 20, MRP: 5599, location: "Main Store", taxRateName: "GST 12%" }],
        },
        {
            name: "Apple Watch Series 9",
            sku: "AW-9",
            description: "Premium smartwatch",
            categoryId: mobileCategory.parentId,
            subCategoryId: mobileCategory.id,
            items: [{ variant: "45mm", price: 45999, quantity: 12, MRP: 48999, location: "Main Store", taxRateName: "GST 18%" }],
        },
        {
            name: "Amazfit GTR 4",
            sku: "AMZ-GTR4",
            description: "Advanced fitness smartwatch",
            categoryId: mobileCategory.parentId,
            subCategoryId: mobileCategory.id,
            items: [{ variant: "46mm", price: 16999, quantity: 30, MRP: 18999, location: "Main Store", taxRateName: "GST 18%" }],
        },
        {
            name: "Mi Power Bank 20000mAh",
            sku: "MI-PB20",
            description: "Fast charging power bank",
            categoryId: mobileCategory.parentId,
            subCategoryId: mobileCategory.id,
            items: [{ variant: "20,000mAh", price: 1999, quantity: 50, MRP: 2499, location: "Warehouse C", taxRateName: "GST 18%" }],
        },
        {
            name: "Apple AirPods Pro 2",
            sku: "AP-PRO2",
            description: "ANC wireless earbuds",
            categoryId: mobileCategory.parentId,
            subCategoryId: mobileCategory.id,
            items: [{ variant: "Standard", price: 24999, quantity: 16, MRP: 26999, location: "Main Store", taxRateName: "GST 18%" }],
        },
        {
            name: "Samsung 50-inch 4K TV",
            sku: "SAM-TV-50",
            description: "Crystal UHD Smart TV",
            categoryId: mobileCategory.parentId,
            subCategoryId: mobileCategory.id,
            items: [{ variant: "50-inch", price: 44999, quantity: 7, MRP: 49999, location: "Warehouse C", taxRateName: "GST 18%" }],
        },
        {
            name: "LG 7kg Washing Machine",
            sku: "LG-WM-7KG",
            description: "Front load inverter washing machine",
            categoryId: mobileCategory.parentId,
            subCategoryId: mobileCategory.id,
            items: [{ variant: "7kg", price: 32999, quantity: 4, MRP: 36999, location: "Warehouse C", taxRateName: "GST 18%" }],
        },
        {
            name: "Prestige Gas Stove 3 Burner",
            sku: "PR-GS-3B",
            description: "Glass top gas stove",
            categoryId: mobileCategory.parentId,
            subCategoryId: mobileCategory.id,
            items: [{ variant: "3 Burner", price: 5999, quantity: 28, MRP: 6499, location: "Main Store", taxRateName: "GST 18%" }],
        },
        {
            name: "Hawkins Pressure Cooker 5L",
            sku: "HW-PC-5L",
            description: "Pressure cooker for kitchen",
            categoryId: mobileCategory.parentId,
            subCategoryId: mobileCategory.id,
            items: [{ variant: "5 Liters", price: 2799, quantity: 35, MRP: 3199, location: "Main Store", taxRateName: "GST 18%" }],
        }
    ];

    for (const p of products) {
        const product = await prisma.product.create({
            data: {
                name: p.name,
                sku: p.sku,
                description: p.description,
                categoryId: p.categoryId,
                subCategoryId: p.subCategoryId,
                companyId: COMPANY_ID,
            },
        });

        for (const item of p.items) {
            const taxRate = await prisma.taxRate.findFirst({
                where: { name: item.taxRateName, companyId: COMPANY_ID },
            });

            await prisma.item.create({
                data: {
                    variant: item.variant,
                    price: item.price,
                    quantity: item.quantity,
                    MRP: item.MRP,
                    location: item.location,
                    taxRateId: taxRate.id,
                    productId: product.id,
                    companyId: COMPANY_ID,
                },
            });
        }
    }

    console.log("✔ Sample Products seeded");
    console.log("🌱 All Seeds Completed Successfully");
}

main()
    .catch((e) => {
        console.error("❌ Seed failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
