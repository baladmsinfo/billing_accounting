'use strict'
const checkRole = require('../utils/checkRole');
const { enqueueUserRegistrationEmail } = require("../services/emailServices");
const bcrypt = require('bcrypt');

module.exports = async function (fastify, opts) {

    function generateRandomPassword(length = 10) {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$&!";
        let password = "";
        for (let i = 0; i < length; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
    }

    fastify.post("/login", async (request, reply) => {
        try {
            const { email, password } = request.body;

            if (!email || !password) {
                return reply.send({
                    statusCode: "01",
                    message: "Email & password required",
                });
            }

            const user = await fastify.prisma.user.findUnique({
                where: { email },
                include: {
                    company: { include: { currency: true } },
                    branch: true
                }
            });

            if (!user) {
                return reply.send({
                    statusCode: "02",
                    message: "Invalid login credentials",
                });
            }

            const validPassword = await bcrypt.compare(password, user.password);
            if (!validPassword) {
                return reply.send({
                    statusCode: "02",
                    message: "Invalid login credentials",
                });
            }

            // Issue Offline JWT
            const token = fastify.jwt.sign({
                id: user.id,
                role: user.role,
                companyId: user.companyId,
                branchId: user.branchId ?? null,
            });

            return reply.send({
                statusCode: "00",
                message: "login successful",
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                },
                company: {
                    id: user.company.id,
                    name: user.company.name,
                    email: user.company.primaryEmail,
                    phone: user.company.primaryPhoneNo,
                    address: user.company.addressLine1,
                    currency: user.company.currency
                },
                branch: user.branch ? {
                    id: user.branch.id,
                    name: user.branch.name,
                    address: user.branch.addressLine1
                } : null
            });

        } catch (err) {
            console.error(err);
            return reply.send({
                statusCode: "99",
                message: "Login error",
                error: err.message
            });
        }
    });

    fastify.get("/company-sync", async (req, reply) => {
        try {
            const { companyId } = req.user;

            const company = await fastify.prisma.company.findUnique({
                where: { id: companyId },
                include: {
                    currency: true,
                    taxRates: true,
                    categories: true
                }
            });

            return reply.send({
                statusCode: "00",
                company
            });

        } catch (err) {
            console.error("company-sync error:", err);
            return reply.send({
                statusCode: "99",
                message: "Failed to fetch company data",
                error: err.message
            });
        }
    });

    fastify.get("/branch-sync", async (req, reply) => {
        try {
            const { branchId } = req.user;

            if (!branchId) {
                return reply.send({
                    statusCode: "01",
                    message: "Admin has no branch. Skip."
                });
            }

            const branch = await fastify.prisma.branch.findUnique({
                where: { id: branchId },
                include: {
                    users: true
                }
            });

            return reply.send({
                statusCode: "00",
                branch
            });

        } catch (err) {
            console.error("branch-sync error:", err);
            return reply.send({
                statusCode: "99",
                message: "Failed to fetch branch data",
                error: err.message
            });
        }
    });

    // ===========================================
    //  NEW: /tax-sync  (Option 2 Selected)
    // ===========================================
    fastify.get("/tax-sync", async (req, reply) => {
        try {
            const { companyId } = req.user;

            const taxRates = await fastify.prisma.taxRate.findMany({
                where: { companyId },
                orderBy: { name: "asc" }
            });

            return reply.send({
                statusCode: "00",
                tax_rates: taxRates
            });

        } catch (err) {
            console.error("tax-sync error:", err);
            return reply.send({
                statusCode: "99",
                message: "Failed to fetch tax rates",
                error: err.message
            });
        }
    });

    fastify.get("/products-sync", async (req, reply) => {
        try {
            const { companyId, branchId } = req.user;

            const categories = await fastify.prisma.category.findMany({
                where: { companyId }
            });

            const products = await fastify.prisma.product.findMany({
                where: { companyId },
                include: {
                    items: true,
                    category: true,
                    subCategory: true
                }
            });

            const branchItems = await fastify.prisma.branchItem.findMany({
                where: { branchId },
                include: {
                    item: {
                        include: {
                            product: true
                        }
                    }
                }
            });

            return reply.send({
                statusCode: "00",
                categories,
                products,
                branchItems
            });

        } catch (err) {
            console.error("products-sync error:", err);
            return reply.send({
                statusCode: "99",
                message: "Failed to fetch products",
                error: err.message
            });
        }
    });

    fastify.get("/parties-sync", async (req, reply) => {
        try {
            const { companyId } = req.user;

            const parties = await fastify.prisma.party.findMany({
                where: { companyId },
                include: { addresses: true }
            });

            return reply.send({
                statusCode: "00",
                parties
            });

        } catch (err) {
            console.error("parties-sync error:", err);
            return reply.send({
                statusCode: "99",
                message: "Failed to fetch parties",
                error: err.message
            });
        }
    });

    fastify.get("/invoices-sync", async (req, reply) => {
        try {
            const { branchId, companyId, role } = req.user;

            const filter = (role === "ADMIN" || role === "SUPERADMIN")
                ? { companyId }
                : { branchId };

            const invoices = await fastify.prisma.invoice.findMany({
                where: filter,
                include: {
                    items: {
                        include: {
                            product: true,
                            item: true
                        }
                    },
                    taxes: true,
                    party: true
                }
            });

            return reply.send({
                statusCode: "00",
                invoices
            });

        } catch (err) {
            console.error("invoices-sync error:", err);
            return reply.send({
                statusCode: "99",
                message: "Failed to fetch invoices",
                error: err.message
            });
        }
    });

    fastify.get("/payments-sync", async (req, reply) => {
        try {
            const { companyId } = req.user;

            const payments = await fastify.prisma.payment.findMany({
                where: { companyId },
                include: {
                    invoice: true
                }
            });

            return reply.send({
                statusCode: "00",
                payments
            });

        } catch (err) {
            console.error("payments-sync error:", err);
            return reply.send({
                statusCode: "99",
                message: "Failed to fetch payments",
                error: err.message
            });
        }
    });

    // ===========================================
    // OFFLINE REGISTER COMPANY
    // ===========================================
    fastify.post("/register", async (request, reply) => {
        try {
            const data = request.body;

            const {
                name,               // companyName
                adminName,
                adminPassword,
                adminEmail,
                adminPhone,

                branchEmail,
                branchPhone,
                branchPassword,

                tenant,
                gstNumber,
                companyType,
                currencyId,
                city,
                state,
                pincode,
                addressLine1,
                addressLine2,
                addressLine3
            } = data;

            // ------------------------------------
            // 1️⃣ Validate required fields
            // ------------------------------------
            if (!adminName || !adminPassword || !adminEmail) {
                return reply.send({
                    statusCode: "01",
                    message: "Admin name, email & password are required"
                });
            }

            // Admin email check
            const existingAdmin = await fastify.prisma.user.findUnique({
                where: { email: adminEmail }
            });

            if (existingAdmin) {
                return reply.send({
                    statusCode: "02",
                    message: "Admin email already exists"
                });
            }

            // Currency check
            const currency = await fastify.prisma.currency.findUnique({
                where: { id: currencyId }
            });

            if (!currency) {
                return reply.send({ statusCode: "01", message: "Invalid currencyId" });
            }

            // ------------------------------------
            // 2️⃣ Create Company
            // ------------------------------------
            const company = await fastify.prisma.company.create({
                data: {
                    name,
                    gstNumber: gstNumber || null,
                    primaryEmail: adminEmail,
                    primaryPhoneNo: adminPhone,
                    addressLine1,
                    addressLine2,
                    addressLine3,
                    city,
                    state,
                    pincode: Number(pincode),
                    companyType,
                    currencyId,
                    tenant,
                }
            });

            // ------------------------------------
            // 3️⃣ Create Branch
            // ------------------------------------
            const branch = await fastify.prisma.branch.create({
                data: {
                    name: `${name} Main Branch`,
                    companyId: company.id,
                    type: "MAIN",
                    main: true,
                    addressLine1,
                    addressLine2,
                    addressLine3,
                    city,
                    state,
                    pincode: Number(pincode)
                }
            });

            // ------------------------------------
            // 4️⃣ Create Admin User
            // ------------------------------------
            const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);

            const adminUser = await fastify.prisma.user.create({
                data: {
                    email: adminEmail,
                    password: hashedAdminPassword,
                    name: adminName,
                    role: "ADMIN",
                    companyId: company.id
                }
            });

            // ------------------------------------
            // 5️⃣ Create Branch User (Optional)
            // ------------------------------------
            let branchUser = null;

            if (branchEmail) {
                const hashedBranchPassword = await bcrypt.hash(branchPassword, 10);

                branchUser = await fastify.prisma.user.create({
                    data: {
                        email: branchEmail,
                        password: hashedBranchPassword,
                        name: `${name} Branch Admin`,
                        role: "BRANCHADMIN",
                        companyId: company.id,
                        branchId: branch.id,
                    }
                });
            }

            // ------------------------------------
            // 6️⃣ Email Notifications
            // ------------------------------------
            await enqueueUserRegistrationEmail({
                to: adminEmail,
                name,
                role: "ADMIN",
                email: adminEmail,
                mobile_no: adminPhone,
                password: adminPassword,
            });

            if (branchEmail) {
                await enqueueUserRegistrationEmail({
                    to: branchEmail,
                    name: `${name} Branch`,
                    role: "BRANCHADMIN",
                    email: branchEmail,
                    mobile_no: branchPhone,
                    password: branchPassword,
                });
            }

            // ------------------------------------
            // 7️⃣ Final Response
            // ------------------------------------
            return reply.send({
                statusCode: "00",
                message: "Offline company registration successful",
                data: {
                    company,
                    branch,
                    adminUser,
                    branchUser
                }
            });

        } catch (err) {
            request.log.error(err);
            return reply.send({
                statusCode: "99",
                message: "Offline company register failed",
                error: err.message
            });
        }
    });

}
