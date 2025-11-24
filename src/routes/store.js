// routes/store.routes.js

const {
    addItemToCart,
    updateCartItemQuantity,
    deleteCartItem,
    incrementCartItemQuantity,
    decrementCartItemQuantity,
    getCustomerCarts
} = require("../services/cartService");

module.exports = async function (fastify) {
    const prisma = fastify.prisma;

    // -------------------------------------------------------
    // 1. PRODUCT APIs
    // -------------------------------------------------------

    fastify.get("/products", async (req) => {
        const { companyId, search } = req.query;
        return prisma.product.findMany({
            where: {
                companyId,
                OR: search
                    ? [
                        { name: { contains: search, mode: "insensitive" } },
                        { sku: { contains: search, mode: "insensitive" } }
                    ]
                    : undefined
            },
            include: { item: true }
        });
    });

    fastify.get("/product/:id", async (req) => {
        return prisma.product.findUnique({
            where: { id: req.params.id },
            include: { item: true, category: true }
        });
    });

    // -------------------------------------------------------
    // 2. CATEGORY APIs
    // -------------------------------------------------------

    fastify.get("/categories", async (req) => {
        const { companyId } = req.query;
        return prisma.category.findMany({
            where: { companyId },
            include: { products: true }
        });
    });

    // -------------------------------------------------------
    // 3. CUSTOMER APIs
    // -------------------------------------------------------

    fastify.post('/store/auth/register', async (req, reply) => {
        try {
            const { name, email, phone, password, companyId } = req.body;

            if (!name || !password || !companyId) {
                return reply.code(400).send({ message: "Name, password & companyId required" });
            }

            const hashed = await fastify.bcrypt.hash(password);

            const customer = await fastify.prisma.customer.create({
                data: {
                    name,
                    email,
                    phone,
                    password: hashed,
                    companyId
                }
            });

            return reply.send({
                message: "Customer registered successfully",
                customer: {
                    id: customer.id,
                    name: customer.name,
                    email: customer.email,
                    phone: customer.phone
                }
            });

        } catch (err) {
            return reply.code(500).send({ message: "Registration error", error: err.message });
        }
    });

    fastify.post('/store/auth/login', async (req, reply) => {
        try {
            const { email, phone, password } = req.body;

            if ((!email && !phone) || !password) {
                return reply.code(400).send({ message: "Email/Phone & password required" });
            }

            let customer;

            if (email) {
                customer = await fastify.prisma.customer.findFirst({ where: { email } });
            } else {
                customer = await fastify.prisma.customer.findFirst({ where: { phone } });
            }

            if (!customer || !customer.password) {
                return reply.code(401).send({ message: "Invalid login credentials" });
            }

            const match = await fastify.bcrypt.compare(password, customer.password);
            if (!match) {
                return reply.code(401).send({ message: "Invalid password" });
            }

            const token = fastify.jwt.sign({
                id: customer.id,
                name: customer.name,
                phone: customer.phone,
                email: customer.email,
                companyId: customer.companyId
            });

            return reply.send({
                message: "Login successful",
                token,
                customer: {
                    id: customer.id,
                    name: customer.name,
                    email: customer.email,
                    phone: customer.phone,
                    companyId: customer.companyId
                }
            });

        } catch (err) {
            return reply.code(500).send({ message: "Login error", error: err.message });
        }
    });

    fastify.post("/customer/create", async (req) => {
        const { companyId, name, email, phone } = req.body;
        return prisma.customer.create({
            data: { companyId, name, email, phone }
        });
    });

    fastify.get("/customer/search", async (req) => {
        const { companyId, q } = req.query;
        return prisma.customer.findMany({
            where: {
                companyId,
                OR: [
                    { name: { contains: q, mode: "insensitive" } },
                    { phone: { contains: q } },
                    { email: { contains: q, mode: "insensitive" } }
                ]
            }
        });
    });

    // -------------------------------------------------------
    // 4. CART APIs (using your cart.service.js)
    // -------------------------------------------------------

    fastify.post("/cart/add", async (req) => {
        const { companyId, customerId, itemId, quantity } = req.body;
        return addItemToCart(prisma, companyId, customerId, itemId, quantity);
    });

    fastify.put("/cart/item/:cartItemId", async (req) => {
        const { cartItemId } = req.params;
        const { companyId, customerId, quantity } = req.body;
        return updateCartItemQuantity(prisma, companyId, customerId, cartItemId, quantity);
    });

    fastify.put("/cart/item/:cartItemId/increment", async (req) => {
        const { cartItemId } = req.params;
        const { companyId, customerId } = req.body;
        return incrementCartItemQuantity(prisma, companyId, customerId, cartItemId);
    });

    fastify.put("/cart/item/:cartItemId/decrement", async (req) => {
        const { cartItemId } = req.params;
        const { companyId, customerId } = req.body;
        return decrementCartItemQuantity(prisma, companyId, customerId, cartItemId);
    });

    fastify.delete("/cart/item/:cartItemId", async (req) => {
        const { cartItemId } = req.params;
        const { companyId, customerId } = req.body;
        return deleteCartItem(prisma, companyId, customerId, cartItemId);
    });

    fastify.get("/cart/customer/:customerId", async (req) => {
        const { customerId } = req.params;
        const { companyId } = req.query;
        return getCustomerCarts(prisma, companyId, customerId);
    });

    // -------------------------------------------------------
    // 5. CHECKOUT (Cart → Invoice + InvoiceItems + Payment)
    // -------------------------------------------------------

    fastify.post("/checkout", async (req) => {
        const { companyId, branchId, customerId, cartId, paymentMethod } = req.body;

        const cart = await prisma.cart.findUnique({
            where: { id: cartId },
            include: {
                items: { include: { item: true } }
            }
        });

        if (!cart || cart.items.length === 0) {
            throw new Error("Cart empty");
        }

        // Create invoice
        const invoice = await prisma.invoice.create({
            data: {
                companyId,
                branchId,
                customerId,
                status: "PAID",
                total: cart.items.reduce((s, i) => s + i.total, 0)
            }
        });

        // Create invoice items + stock reduce
        for (const c of cart.items) {
            await prisma.invoiceItem.create({
                data: {
                    invoiceId: invoice.id,
                    itemId: c.itemId,
                    productId: c.productId,
                    quantity: c.quantity,
                    price: c.price,
                    total: c.total
                }
            });

            // Reduce stock
            await prisma.item.update({
                where: { id: c.itemId },
                data: { stock: { decrement: c.quantity } }
            });

            await prisma.stockLedger.create({
                data: {
                    companyId,
                    branchId,
                    itemId: c.itemId,
                    type: "SALE",
                    quantity: c.quantity,
                    reference: invoice.id
                }
            });
        }

        // Payment
        await prisma.payment.create({
            data: {
                invoiceId: invoice.id,
                amount: invoice.total,
                method: paymentMethod || "CASH"
            }
        });

        // Empty cart
        await prisma.cartItem.deleteMany({
            where: { cartId }
        });

        return { invoiceId: invoice.id };
    });

    // -------------------------------------------------------
    // 6. POS Quick Checkout (No Cart)
    // -------------------------------------------------------

    fastify.post("/pos/quick-sale", async (req) => {
        const { companyId, branchId, customerId, items, paymentMethod } = req.body;

        // items = [{ itemId, quantity }]

        const invoice = await prisma.invoice.create({
            data: {
                companyId,
                branchId,
                customerId,
                status: "PAID"
            }
        });

        let total = 0;

        for (const x of items) {
            const item = await prisma.item.findUnique({
                where: { id: x.itemId },
                include: { product: true }
            });
            if (!item) throw new Error("Item not found");

            const lineTotal = item.price * x.quantity;
            total += lineTotal;

            await prisma.invoiceItem.create({
                data: {
                    invoiceId: invoice.id,
                    itemId: item.id,
                    productId: item.productId,
                    quantity: x.quantity,
                    price: item.price,
                    total: lineTotal
                }
            });

            await prisma.item.update({
                where: { id: x.itemId },
                data: { stock: { decrement: x.quantity } }
            });

            await prisma.stockLedger.create({
                data: {
                    companyId,
                    branchId,
                    itemId: item.id,
                    type: "SALE",
                    quantity: x.quantity,
                    reference: invoice.id
                }
            });
        }

        await prisma.invoice.update({
            where: { id: invoice.id },
            data: { total }
        });

        await prisma.payment.create({
            data: {
                invoiceId: invoice.id,
                amount: total,
                method: paymentMethod || "CASH"
            }
        });

        return { invoiceId: invoice.id, total };
    });

    // -------------------------------------------------------
    // 7. Invoice View
    // -------------------------------------------------------

    fastify.get("/invoice/:id", async (req) => {
        return prisma.invoice.findUnique({
            where: { id: req.params.id },
            include: { items: true, payments: true, customer: true }
        });
    });

};
