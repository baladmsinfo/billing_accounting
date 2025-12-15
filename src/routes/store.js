// routes/store.routes.js

const {
    addItemToCart,
    updateCartItemQuantity,
    deleteCartItem,
    incrementCartItemQuantity,
    decrementCartItemQuantity,
    getCustomerCarts
} = require("../services/cartService");

const { getAccountId } = require("../services/invoiceService");

const productSvc = require('../services/productService')

const checkRole = require('../utils/checkRole')

const Decimal = require("decimal.js");

module.exports = async function (fastify) {
    const prisma = fastify.prisma;

    // -------------------------------------------------------
    // 1. PRODUCT APIs
    // -------------------------------------------------------

    fastify.get("/init/:id", async (req, reply) => {
        const tenant = req.params.id

        try {
            const data = await prisma.company.findUnique({
                where: { tenant },
                include: {
                    currency: true,

                    // ✅ ONLY DEFAULT BANNER
                    banners: {
                        where: {
                            manage: true
                        },
                        take: 1   // extra safety (even if logic breaks someday)
                    }
                }
            })

            if (!data) {
                return reply.code(404).send({
                    statusCode: "99",
                    message: "Tenant not found",
                })
            }

            return reply.send({
                statusCode: "00",
                message: "Tenant fetched successfully",
                data
            })

        } catch (error) {
            return reply.code(500).send({
                statusCode: "99",
                message: "Failed to fetch tenant",
                error: error.message,
            })
        }
    })

    fastify.get('/me', async (request, reply) => {
        try {
            const company = await fastify.prisma.company.findUnique({
                where: { id: request.companyId },
                include: {
                    currency: true
                }
            })

            if (!company) {
                return reply.code(404).send({
                    statusCode: 404,
                    message: 'Company not found',
                })
            }


            return reply.code(200).send({
                statusCode: 200,
                message: 'Company fetched successfully',
                company,
            })
        } catch (err) {
            request.log.error(err)
            return reply.code(500).send({
                statusCode: 500,
                message: 'Internal server error',
                error: err.message,
            })
        }
    })

    fastify.get("/products", async (req, reply) => {
        try {
            const page = Number(req.query.page || 1);
            const take = Number(req.query.take || 20);
            const skip = (page - 1) * take;

            const { categoryId, subCategoryId, minPrice, maxPrice } = req.query;

            // Build base filter
            const where = {
                companyId: req.companyId,
                ...(categoryId ? { categoryId } : {}),
                ...(subCategoryId ? { subCategoryId } : {}),
                ...(minPrice || maxPrice
                    ? {
                        items: {
                            some: {
                                ...(minPrice ? { price: { gte: Number(minPrice) } } : {}),
                                ...(maxPrice ? { price: { lte: Number(maxPrice) } } : {}),
                            },
                        },
                    }
                    : {}),
            };

            const [products, total] = await Promise.all([
                fastify.prisma.product.findMany({
                    where,
                    skip,
                    take,
                    include: {
                        items: true, // include items if needed for price display
                    },
                    orderBy: { createdAt: "desc" },
                }),
                fastify.prisma.product.count({ where }),
            ]);

            return reply.code(200).send({
                statusCode: "00",
                message: "Products fetched successfully",
                data: products,
                pagination: { page, take, total },
            });
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({
                statusCode: "99",
                message: "Failed to fetch products",
                error: error.message,
            });
        }
    });

    fastify.get(
        "/banners",
        { preHandler: checkRole("ADMIN") },
        async (req, reply) => {
            try {
                const companyId = req.companyId;

                const banners = await fastify.prisma.banner.findMany({
                    where: { companyId },
                    orderBy: { createdAt: "desc" },
                    include: {
                        image: true
                    }
                });

                return reply.send({
                    statusCode: "00",
                    message: "Banners fetched successfully",
                    data: banners
                });
            } catch (err) {
                req.log.error(err);
                return reply.send({
                    statusCode: "99",
                    message: "Internal server error",
                    error: err.message
                });
            }
        }
    );

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
            const page = Number(request.query.page || 1);
            const take = Number(request.query.take || 20);
            const skip = (page - 1) * take;

            const categories = await fastify.prisma.category.findMany({
                where: {
                    companyId: request.companyId,
                    parentId: null
                },
                skip,
                take,
                include: {
                    children: true,

                    // Return ONLY 10 products per category
                    products: {
                        take: 10,
                        include: { items: true },
                        orderBy: { createdAt: "desc" } // Optional sorting
                    }
                }
            });

            return reply.code(200).send({
                statusCode: '00',
                message: 'Categories fetched successfully',
                data: categories
            });

        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({
                statusCode: '99',
                message: 'Failed to fetch categories',
                error: error.message
            });
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

    // fastify.post("/cart/add", async (req) => {
    //     const { cartId, itemId, productId } = req.body;

    //     const item = await prisma.item.findUnique({
    //         where: { id: itemId },
    //     });

    //     if (!item) {
    //         return {
    //             statusCode: "01",
    //             message: "Product Item not found"
    //         };
    //     }

    //     let cartItem = await prisma.cartItem.findFirst({
    //         where: { cartId, itemId }
    //     });

    //     if (cartItem) {
    //         // increment qty
    //         const newQty = cartItem.quantity + 1;
    //         const baseTotal = newQty * cartItem.price;

    //         await prisma.cartItem.update({
    //             where: { id: cartItem.id },
    //             data: {
    //                 quantity: newQty,
    //                 total: baseTotal,
    //                 taxRateId: item.taxRateId || null
    //             },
    //             include: {
    //                 product: true
    //             }
    //         });
    //     } else {
    //         // create new cart item
    //         await prisma.cartItem.create({
    //             data: {
    //                 cartId,
    //                 itemId,
    //                 productId,
    //                 quantity: 1,
    //                 price: item.price,
    //                 total: item.price,
    //                 taxRateId: item.taxRateId || null
    //             },
    //             include: {
    //                 product: true
    //             }
    //         });
    //     }

    //     const fullCart = await prisma.cart.findUnique({
    //         where: { id: cartId },
    //         include: {
    //             items: {
    //                 include: { taxRate: true }
    //             }
    //         }
    //     });

    //     return {
    //         statusCode: "00",
    //         message: "Item successfully added to cart",
    //         data: fullCart
    //     };
    // });

    fastify.post("/cart/add", async (req, reply) => {
        const { cartId, itemId, productId } = req.body;

        if (!cartId || !itemId || !productId) {
            return reply.send({
                statusCode: "01",
                message: "cartId, itemId, productId are required",
            });
        }

        // 1. Validate item exists (and its taxRate)
        const item = await prisma.item.findUnique({
            where: { id: itemId },
            include: { taxRate: true },
        });

        if (!item) {
            return reply.send({
                statusCode: "01",
                message: "Product Item not found",
            });
        }

        // 2. Check existing cart item
        let cartItem = await prisma.cartItem.findFirst({
            where: { cartId, itemId },
        });

        if (cartItem) {
            // 3. Increment quantity and update total (no taxAmount column in DB)
            const newQty = cartItem.quantity + 1;
            const unitPrice = cartItem.price;
            const baseTotal = newQty * unitPrice;

            // calculate tax in memory (not persisted to cartItem)
            const taxAmountForLine = item.taxRate ? (baseTotal * item.taxRate.rate) / 100 : 0;
            const finalTotal = baseTotal + taxAmountForLine;

            cartItem = await prisma.cartItem.update({
                where: { id: cartItem.id },
                data: {
                    quantity: newQty,
                    total: finalTotal,
                    taxRateId: item.taxRateId || null,
                },
                include: { product: true, item: true, taxRate: true },
            });
        } else {
            // 4. Create new cart item (no taxAmount column)
            const unitPrice = item.price;
            const baseTotal = unitPrice * 1;
            const taxAmountForLine = item.taxRate ? (baseTotal * item.taxRate.rate) / 100 : 0;
            const finalTotal = baseTotal + taxAmountForLine;

            cartItem = await prisma.cartItem.create({
                data: {
                    cartId,
                    itemId,
                    productId,
                    quantity: 1,
                    price: unitPrice,
                    total: finalTotal,
                    taxRateId: item.taxRateId || null,
                },
                include: { product: true, item: true, taxRate: true },
            });
        }

        // 5. Re-fetch full cart and compute totals in memory
        const fullCart = await prisma.cart.findUnique({
            where: { id: cartId },
            include: {
                items: {
                    include: {
                        product: true,
                        item: { include: { taxRate: true } }, // ensure item.taxRate is available
                        taxRate: true,
                    },
                    orderBy: { createdAt: "desc" },
                },
            },
        });

        if (!fullCart) {
            return reply.send({
                statusCode: "01",
                message: "Cart not found",
            });
        }

        // 6. Calculate subtotal, taxTotal, grandTotal
        let subtotal = 0;
        let taxTotal = 0;

        for (const ci of fullCart.items) {
            // prefer ci.price and ci.quantity saved on line
            const lineBase = (ci.price || 0) * (ci.quantity || 0);
            subtotal += lineBase;

            // determine tax rate: prefer ci.taxRate, else item.taxRate
            const taxRate =
                (ci.taxRate && typeof ci.taxRate.rate === "number" ? ci.taxRate.rate : null) ??
                (ci.item && ci.item.taxRate && typeof ci.item.taxRate.rate === "number" ? ci.item.taxRate.rate : null);

            if (taxRate != null) {
                taxTotal += (lineBase * taxRate) / 100;
            }
        }

        const grandTotal = subtotal + taxTotal;

        // 7. Persist totals to cart (ensure Cart model has these fields or skip if not)
        // If your Cart model does not have subtotal/taxTotal/total fields, skip updating DB and just return computed values.
        const cartUpdateData = {};
        const cartModelHasTotals = true; // set to false if your Cart model lacks these columns

        // Quick check: only attempt update if those fields exist in DB schema.
        // (You can change cartModelHasTotals to false if you didn't add columns.)
        if (cartModelHasTotals) {
            try {
                await prisma.cart.update({
                    where: { id: cartId },
                    data: {
                        subtotal: subtotal,
                        taxTotal: taxTotal,
                        total: grandTotal,
                        // optionally update status/updatedAt if needed
                    },
                });
            } catch (e) {
                // If update fails because fields don't exist, ignore and continue returning computed totals.
                fastify.log.warn("Unable to persist cart totals; returning computed totals only.", e.message);
            }
        }

        // attach computed totals to fullCart response (do not mutate DB object permanently)
        const responseCart = {
            ...fullCart,
            subtotal,
            taxTotal,
            total: grandTotal,
        };

        return reply.send({
            statusCode: "00",
            message: "Item added to cart",
            cartItem,
            cart: responseCart,
        });
    });


    // Fetch full cart with items
    fastify.get("/cart/:cartId", async (req) => {
        const { cartId } = req.params;

        console.log("Getting cartId", cartId);

        const fullCart = await prisma.cart.findUnique({
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

        console.log("Getting cart", cartId);

        if (!fullCart) {
            return {
                statusCode: "01",
                message: "Cart not found"
            };
        }

        let subtotal = 0;
        let taxTotal = 0;

        for (const ci of fullCart.items) {
            // prefer ci.price and ci.quantity saved on line
            const lineBase = (ci.price || 0) * (ci.quantity || 0);
            subtotal += lineBase;

            // determine tax rate: prefer ci.taxRate, else item.taxRate
            const taxRate =
                (ci.taxRate && typeof ci.taxRate.rate === "number" ? ci.taxRate.rate : null) ??
                (ci.item && ci.item.taxRate && typeof ci.item.taxRate.rate === "number" ? ci.item.taxRate.rate : null);

            if (taxRate != null) {
                taxTotal += (lineBase * taxRate) / 100;
            }
        }

        const grandTotal = subtotal + taxTotal;

        // 7. Persist totals to cart (ensure Cart model has these fields or skip if not)
        // If your Cart model does not have subtotal/taxTotal/total fields, skip updating DB and just return computed values.
        const cartUpdateData = {};
        const cartModelHasTotals = true; // set to false if your Cart model lacks these columns

        // Quick check: only attempt update if those fields exist in DB schema.
        // (You can change cartModelHasTotals to false if you didn't add columns.)
        if (cartModelHasTotals) {
            try {
                await prisma.cart.update({
                    where: { id: cartId },
                    data: {
                        subtotal: subtotal,
                        taxTotal: taxTotal,
                        total: grandTotal,
                        // optionally update status/updatedAt if needed
                    },
                });
            } catch (e) {
                // If update fails because fields don't exist, ignore and continue returning computed totals.
                fastify.log.warn("Unable to persist cart totals; returning computed totals only.", e.message);
            }
        }

        // attach computed totals to fullCart response (do not mutate DB object permanently)
        const cart = {
            ...fullCart,
            subtotal,
            taxTotal,
            total: grandTotal,
        };

        return {
            statusCode: "00",
            message: "Cart fetched successfully",
            data: cart
        };
    });

    // ---------------------------------------------
    // INCREMENT CART ITEM
    // ---------------------------------------------
    fastify.put("/cart/item/:cartItemId/increment", async (req, reply) => {
        const { cartItemId } = req.params;

        // 1️⃣ Fetch cart item with related product/tax
        const ci = await prisma.cartItem.findUnique({
            where: { id: cartItemId },
            include: {
                item: { include: { taxRate: true, product: true } },
                taxRate: true,
                product: true,
            },
        });

        if (!ci) {
            return reply.send({
                statusCode: "01",
                message: "Cart item not found",
            });
        }

        const newQty = ci.quantity + 1;
        const unitPrice = ci.price;

        // 2️⃣ Calculate line totals
        const baseTotal = newQty * unitPrice;
        const taxRate = ci.taxRate?.rate ?? ci.item?.taxRate?.rate ?? 0;
        const taxAmountForLine = (baseTotal * taxRate) / 100;
        const finalTotal = baseTotal + taxAmountForLine;

        // 3️⃣ Update cart item
        const updatedCartItem = await prisma.cartItem.update({
            where: { id: cartItemId },
            data: {
                quantity: newQty,
                total: finalTotal,
                taxRateId: ci.taxRateId || ci.item?.taxRateId || null,
            },
            include: {
                product: true,
                item: { include: { taxRate: true } },
                taxRate: true,
            },
        });

        // 4️⃣ Fetch full cart with all items
        const fullCart = await prisma.cart.findUnique({
            where: { id: ci.cartId },
            include: {
                items: {
                    include: {
                        product: true,
                        item: { include: { taxRate: true } },
                        taxRate: true,
                    },
                    orderBy: { createdAt: "desc" },
                },
            },
        });

        // 5️⃣ Calculate cart totals
        const summary = calculateCartTotals(fullCart.items);

        const responseCart = {
            ...fullCart,
            ...summary,
        };

        // 6️⃣ Send response
        return reply.send({
            statusCode: "00",
            message: "Cart item incremented",
            cartItem: updatedCartItem,
            cart: responseCart,
        });
    });

    // Decrement quantity
    fastify.put("/cart/item/:cartItemId/decrement", async (req, reply) => {
        const { cartItemId } = req.params;

        // Fetch cart item with tax info
        const ci = await prisma.cartItem.findUnique({
            where: { id: cartItemId },
            include: {
                item: {
                    include: { taxRate: true }
                }
            }
        });

        if (!ci) {
            return reply.send({
                statusCode: "01",
                message: "Cart item not found"
            });
        }

        // If quantity is 1 → delete item
        if (ci.quantity <= 1) {
            await prisma.cartItem.delete({ where: { id: cartItemId } });

            // Return updated cart summary
            const updatedCart = await prisma.cart.findUnique({
                where: { id: ci.cartId },
                include: {
                    items: {
                        include: { taxRate: true, product: true, item: true }
                    }
                }
            });

            const summary = calculateCartTotals(updatedCart.items);

            return reply.send({
                statusCode: "00",
                message: "Item removed from cart",
                cart: {
                    ...updatedCart,
                    ...summary
                }
            });
        }

        // New quantity
        const newQty = ci.quantity - 1;
        const unitPrice = ci.price;
        const baseTotal = unitPrice * newQty;

        let taxAmount = 0;
        if (ci.item?.taxRate) {
            taxAmount = (baseTotal * ci.item.taxRate.rate) / 100;
        }

        const finalTotal = baseTotal + taxAmount;

        // Update cart item
        const updatedItem = await prisma.cartItem.update({
            where: { id: cartItemId },
            data: {
                quantity: newQty,
                total: finalTotal,
                taxRateId: ci.item.taxRateId || null
            },
            include: {
                item: true,
                taxRate: true,
                product: true
            }
        });

        // Get full cart updated
        const fullCart = await prisma.cart.findUnique({
            where: { id: ci.cartId },
            include: {
                items: {
                    include: {
                        product: true,
                        item: { include: { taxRate: true } },
                        taxRate: true,
                    },
                },
            },
        });

        const summary = calculateCartTotals(fullCart.items);

        return reply.send({
            statusCode: "00",
            message: "Item decremented",
            cartItem: updatedItem,
            cart: {
                ...fullCart,
                ...summary
            }
        });
    });

    // ---------------------------------------------
    // DELETE CART ITEM
    // ---------------------------------------------
    fastify.delete("/cart/item/:cartItemId", async (req, reply) => {
        const { cartItemId } = req.params;

        // Get cart item with cartId
        const cartItem = await prisma.cartItem.findUnique({
            where: { id: cartItemId },
            select: { cartId: true }
        });

        if (!cartItem) {
            return reply.send({
                statusCode: "01",
                message: "Cart item not found"
            });
        }

        // Delete the item
        await prisma.cartItem.delete({ where: { id: cartItemId } });

        // Fetch updated cart with nested product, taxRate info
        const updatedCart = await prisma.cart.findUnique({
            where: { id: cartItem.cartId },
            include: {
                items: {
                    include: {
                        item: {
                            include: {
                                product: true,
                                taxRate: true,
                            }
                        },
                        product: true,
                        taxRate: true
                    }
                }
            }
        });

        // Calculate totals
        const summary = calculateCartTotals(updatedCart.items);

        return reply.send({
            statusCode: "00",
            message: "Cart item deleted successfully",
            cart: {
                ...updatedCart,
                ...summary
            }
        });
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


    fastify.post("/checkout", async (req, reply) => {
        const { cartId, form } = req.body;

        console.log("Checkout request for cartId:", cartId, form);

        const companyId = req.companyId;
        let customerId = req.customerId || null;

        return await fastify.prisma.$transaction(async (tx) => {
            // --------------------------- CART VALIDATION --------------------------- //
            const cart = await tx.cart.findUnique({
                where: { id: cartId },
                include: {
                    items: {
                        include: {
                            item: {
                                include: { taxRate: true }
                            }
                        }
                    }
                }
            });

            if (!cart || cart.items.length === 0) {
                return reply.code(400).send({
                    statusCode: "01",
                    message: "Cart empty"
                });
            }

            // --------------------------- CUSTOMER HANDLING --------------------------- //
            let customer = null;

            if (customerId) {
                customer = await tx.customer.findFirst({
                    where: { id: customerId, companyId }
                });

                if (!customer) {
                    return reply.code(400).send({
                        statusCode: "01",
                        message: "Customer not found"
                    });
                }
            } else {
                // CREATE GUEST CUSTOMER
                customer = await tx.customer.create({
                    data: {
                        companyId,
                        name: `${form.firstName} ${form.lastName}`.trim(),
                        email: form.email || null,
                        phone: String(form.phone) || null
                    }
                });

                customerId = customer.id;

                // CREATE CUSTOMER ADDRESS
                await tx.customerAddress.create({
                    data: {
                        customerId,
                        addressLine1: form.address,
                        city: form.city,
                        state: form.state,
                        pincode: form.zip,
                        isDefault: true
                    }
                });
            }

            // --------------------------- INVOICE CREATION --------------------------- //
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

            // --------------------------- INVOICE ITEMS & STOCK --------------------------- //
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
                        note: `Sale invoice ${invoice.invoiceNumber}`
                    }
                });
            }

            // --------------------------- UPDATE TOTALS --------------------------- //
            await tx.invoice.update({
                where: { id: invoice.id },
                data: {
                    totalAmount: parseFloat(totalAmount.toFixed(2)),
                    taxAmount: parseFloat(totalTax.toFixed(2))
                }
            });

            // --------------------------- JOURNAL ENTRIES --------------------------- //
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

            // --------------------------- CLOSE CART --------------------------- //
            await tx.cart.update({
                where: { id: cartId },
                data: { status: "CHECKEDOUT" }
            });

            // --------------------------- RESPONSE --------------------------- //
            return reply.send({
                statusCode: "00",
                message: "Checkout successful",
                invoiceId: invoice.id,
                customerId
            });
        });
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

// ------------------------------------------------------
// CART TOTAL CALCULATOR
// ------------------------------------------------------
function calculateCartTotals(items) {
    let subtotal = 0;
    let tax = 0;
    let total = 0;

    for (const item of items) {
        subtotal += item.price * item.quantity;

        if (item.taxRate) {
            tax += ((item.price * item.quantity) * item.taxRate.rate) / 100;
        }

        total += item.total;
    }

    return { subtotal, tax, total };
}
