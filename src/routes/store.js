// routes/store.routes.js

const {
    addItemToCart,
    updateCartItemQuantity,
    deleteCartItem,
    incrementCartItemQuantity,
    decrementCartItemQuantity,
    getCustomerCarts
} = require("../services/cartService");

const productSvc = require('../services/productService')

const checkRole = require('../utils/checkRole')

module.exports = async function (fastify) {
    const prisma = fastify.prisma;

    // -------------------------------------------------------
    // 1. PRODUCT APIs
    // -------------------------------------------------------

    fastify.get("/products", async (req, reply) => {
        try {
            const page = Number(req.query.page || 1)
            const take = Number(req.query.take || 20)
            const skip = (page - 1) * take

            const [products, total] = await Promise.all([
                productSvc.listProducts(fastify.prisma, req.companyId, { skip, take }),
                fastify.prisma.product.count({
                    where: { companyId: req.companyId },
                }),
            ])

            return reply.code(200).send({
                statusCode: '00',
                message: 'Products fetched successfully',
                data: products,
                pagination: { page, take, total },
            })
        } catch (error) {
            fastify.log.error(error)
            return reply.code(500).send({
                statusCode: '99',
                message: 'Failed to fetch products',
                error: error.message,
            })
        }
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

    fastify.get("/categories", async (request, reply) => {
        try {
            const page = Number(request.query.page || 1)
            const take = Number(request.query.take || 20)
            const skip = (page - 1) * take

            const categories = await fastify.prisma.category.findMany({
                where: { companyId: request.companyId, parentId: null },
                skip,
                take,
                include: { children: true }
            })

            return reply.code(200).send({
                statusCode: '00',
                message: 'Categories fetched successfully',
                data: categories
            })
        } catch (error) {
            fastify.log.error(error)
            return reply.code(500).send({
                statusCode: '99',
                message: 'Failed to fetch categories',
                error: error.message
            })
        }
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

    // fastify.post("/cart/add", {
    //     preHandler: checkRole("STOREADMIN"),
    // }, async (req) => {
    //     const { companyId, customerId, itemId, quantity } = req.body;
    //     return addItemToCart(prisma, companyId, customerId, itemId, quantity);
    // });

    // fastify.put("/cart/item/:cartItemId", {
    //     preHandler: checkRole("STOREADMIN"),
    // }, async (req) => {
    //     const { cartItemId } = req.params;
    //     const { companyId, customerId, quantity } = req.body;
    //     return updateCartItemQuantity(prisma, companyId, customerId, cartItemId, quantity);
    // });

    // fastify.put("/cart/item/:cartItemId/increment", {
    //     preHandler: checkRole("STOREADMIN"),
    // }, async (req) => {
    //     const { cartItemId } = req.params;
    //     const { companyId, customerId } = req.body;
    //     return incrementCartItemQuantity(prisma, companyId, customerId, cartItemId);
    // });

    // fastify.put("/cart/item/:cartItemId/decrement", {
    //     preHandler: checkRole("STOREADMIN"),
    // }, async (req) => {
    //     const { cartItemId } = req.params;
    //     const { companyId, customerId } = req.body;
    //     return decrementCartItemQuantity(prisma, companyId, customerId, cartItemId);
    // });

    // fastify.delete("/cart/item/:cartItemId", {
    //     preHandler: checkRole("STOREADMIN"),
    // }, async (req) => {
    //     const { cartItemId } = req.params;
    //     const { companyId, customerId } = req.body;
    //     return deleteCartItem(prisma, companyId, customerId, cartItemId);
    // });

    // fastify.get("/cart/customer/:customerId", {
    //     preHandler: checkRole("STOREADMIN"),
    // }, async (req) => {
    //     const { customerId } = req.params;
    //     const { companyId } = req.query;
    //     return getCustomerCarts(prisma, companyId, customerId);
    // });

    // cart func

    fastify.post("/cart/initalize", async (req) => {
        const cart = await prisma.cart.create({
            data: {
                companyId: req.companyId,
                status: "PENDING",
            },
            include: {
                items: true
            }
        });
        return {
            statusCode: "00",
            data: { cart },
        }
    });

    fastify.post("/cart/add", {
        preHandler: checkRole("ADMIN"),
    }, async (req) => {
        const { cartId, itemId, productId } = req.body;

        const item = await prisma.item.findUnique({
            where: { id: itemId },
        });

        if (!item) {
            return {
                statusCode: "01",
                message: "Item not found"
            };
        }

        let cartItem = await prisma.cartItem.findFirst({
            where: { cartId, itemId }
        });

        if (cartItem) {
            // increment qty
            const newQty = cartItem.quantity + 1;
            const baseTotal = newQty * cartItem.price;

            await prisma.cartItem.update({
                where: { id: cartItem.id },
                data: {
                    quantity: newQty,
                    total: baseTotal,
                    taxRateId: item.taxRateId || null
                }
            });
        } else {
            // create new cart item
            await prisma.cartItem.create({
                data: {
                    cartId,
                    itemId,
                    productId,
                    quantity: 1,
                    price: item.price,
                    total: item.price,
                    taxRateId: item.taxRateId || null
                }
            });
        }

        const fullCart = await prisma.cart.findUnique({
            where: { id: cartId },
            include: {
                items: {
                    include: { taxRate: true }
                }
            }
        });

        return {
            statusCode: "00",
            message: "Item successfully added to cart",
            data: fullCart
        };
    });

    // Fetch full cart with items
    fastify.get("/cart/:cartId", async (req) => {
        const { cartId } = req.params;

        const cart = await prisma.cart.findUnique({
            where: { id: cartId },
            include: {
                items: {
                    include: {
                        taxRate: true,
                        item: { include: { product: true } } // item + product details
                    }
                }
            }
        });

        if (!cart) {
            return {
                statusCode: "01",
                message: "Cart not found"
            };
        }

        return {
            statusCode: "00",
            message: "Cart fetched successfully",
            data: cart
        };
    });

    // Increment quantity
    fastify.put("/cart/item/:cartItemId/increment", async (req) => {
        const { cartItemId } = req.params;

        const ci = await prisma.cartItem.findUnique({ where: { id: cartItemId } });
        if (!ci) throw new Error("Cart item not found");

        return prisma.cartItem.update({
            where: { id: cartItemId },
            data: {
                quantity: ci.quantity + 1,
                total: (ci.quantity + 1) * ci.price
            }
        });
    });

    // Decrement quantity
    fastify.put("/cart/item/:cartItemId/decrement", async (req) => {
        const { cartItemId } = req.params;

        const ci = await prisma.cartItem.findUnique({ where: { id: cartItemId } });
        if (!ci) throw new Error("Cart item not found");

        // if quantity is 1 → remove item
        if (ci.quantity <= 1)
            return prisma.cartItem.delete({ where: { id: cartItemId } });

        return prisma.cartItem.update({
            where: { id: cartItemId },
            data: {
                quantity: ci.quantity - 1,
                total: (ci.quantity - 1) * ci.price
            }
        });
    });

    fastify.delete("/cart/item/:cartItemId", async (req) => {
        const { cartItemId } = req.params;

        const cartItem = await prisma.cartItem.findUnique({
            where: { id: cartItemId },
            select: { cartId: true }
        });

        if (!cartItem) {
            return {
                statusCode: "01",
                message: "Cart item not found"
            };
        }

        // Delete item
        await prisma.cartItem.delete({ where: { id: cartItemId } });

        // Fetch updated cart
        const updatedCart = await prisma.cart.findUnique({
            where: { id: cartItem.cartId },
            include: {
                items: {
                    include: {
                        item: { include: { product: true } }
                    }
                }
            }
        });

        return {
            statusCode: "00",
            message: "Cart item deleted successfully",
            data: updatedCart
        };
    });

    fastify.post("/cart/:cartId/finish", async (req) => {
        const { cartId } = req.params;

        const cart = await prisma.cart.findUnique({
            where: { id: cartId },
        });

        if (!cart) throw new Error("Cart not found");

        await prisma.cartItem.deleteMany({ where: { cartId } });

        await prisma.cart.delete({ where: { id: cartId } });


        console.log("Deleted Cart");

        return {
            statusCode: "00",
            message: "Deleted Cart"
        };
    });

    // -------------------------------------------------------
    // 5. CHECKOUT (Cart → Invoice + InvoiceItems + Payment)
    // -------------------------------------------------------


    fastify.post(
        "/checkout",
        async (req, reply) => {
            const {
                cartId,
                paymentMethod,
            } = req.body;

            const companyId = req.companyId;
            const customerId = req.customerId || null;

            return await fastify.prisma.$transaction(async (tx) => {
                //  CART VALIDATION 
                const cart = await tx.cart.findUnique({
                    where: { id: cartId },
                    include: {
                        items: {
                            include: {
                                item: { include: { taxRate: true } } // 👈 one taxRate only
                            }
                        }
                    }
                });
                if (!cart || cart.items.length === 0) throw new Error("Cart empty");

                const existingCustomer = await tx.customer.findFirst({
                    where: { id: customerId, companyId }
                });

                if (customerId && !existingCustomer) {
                    return reply.code(400).send({
                        statusCode: "01",
                        message: "Customer not found"
                    });
                }

                //  INVOICE CREATE 
                const invoice = await tx.invoice.create({
                    data: {
                        companyId,
                        customerId,
                        date: new Date(),
                        status: "PENDING",
                        type: "ONLINE",
                        invoiceNumber: `INV${Date.now()}`,
                        totalAmount: 0,
                        taxAmount: 0
                    }
                });

                let totalAmount = new Decimal(0);
                let totalTax = new Decimal(0);

                //  INVOICE ITEMS / STOCK / TAX 
                for (const row of cart.items) {
                    const lineTotal = new Decimal(row.quantity).times(new Decimal(row.price));
                    totalAmount = totalAmount.plus(lineTotal);

                    let taxAmountForItem = new Decimal(0);

                    if (row.item.taxRate) {
                        const rate = new Decimal(row.item.taxRate.rate).div(100);
                        taxAmountForItem = lineTotal.times(rate);
                        totalTax = totalTax.plus(taxAmountForItem);

                        await tx.invoiceTax.create({
                            data: {
                                invoiceId: invoice.id,
                                taxRateId: row.item.taxRate.id,
                                companyId,
                                invoiceType: "ONLINE",
                                amount: parseFloat(taxAmountForItem.toFixed(2))
                            }
                        });
                    }

                    await tx.invoiceItem.create({
                        data: {
                            invoiceId: invoice.id,
                            itemId: row.itemId,
                            productId: row.productId,
                            quantity: row.quantity,
                            price: row.price,
                            total: parseFloat(lineTotal.toFixed(2)),
                            taxRateId: row.item.taxRate?.id ?? null
                        }
                    });

                    if (row.item.quantity < row.quantity) {
                        throw new Error(`Insufficient stock for item ${row.item.name}`);
                    }

                    await tx.item.update({
                        where: { id: row.itemId },
                        data: { quantity: { decrement: row.quantity } }
                    });

                    await tx.stockLedger.create({
                        data: {
                            companyId,
                            itemId: row.itemId,
                            type: "SALE",
                            quantity: row.quantity,
                            note: `Sale  invoice ${invoice.invoiceNumber}`
                        }
                    });
                }

                //  UPDATE INVOICE TOTALS 
                await tx.invoice.update({
                    where: { id: invoice.id },
                    data: {
                        totalAmount: parseFloat(totalAmount.toFixed(2)),
                        taxAmount: parseFloat(totalTax.toFixed(2))
                    }
                });

                //  JOURNAL ENTRIES 
                const description = `Invoice ${invoice.invoiceNumber}`;

                await tx.journalEntry.create({
                    data: {
                        companyId,
                        accountId: await getAccountId(tx, companyId, "Accounts Receivable"),
                        date: new Date(),
                        description,
                        debit: parseFloat(totalAmount.plus(totalTax).toFixed(2)),
                        credit: 0
                    }
                });

                await tx.journalEntry.create({
                    data: {
                        companyId,
                        accountId: await getAccountId(tx, companyId, "Sales Revenue"),
                        date: new Date(),
                        description,
                        debit: 0,
                        credit: parseFloat(totalAmount.toFixed(2))
                    }
                });

                if (totalTax.gt(0)) {
                    await tx.journalEntry.create({
                        data: {
                            companyId,
                            accountId: await getAccountId(tx, companyId, "Tax Payable"),
                            date: new Date(),
                            description,
                            debit: 0,
                            credit: parseFloat(totalTax.toFixed(2))
                        }
                    });
                }

                //  CLOSE CART 
                await tx.cart.update({
                    where: { id: cartId },
                    data: { status: "CHECKEDOUT" }
                });

                return reply.send({
                    statusCode: "00",
                    message: "Checkout successful",
                    invoiceId: invoice.id,
                    customerId
                });
            });
        }
    );

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
                status: "DRAFT"
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
