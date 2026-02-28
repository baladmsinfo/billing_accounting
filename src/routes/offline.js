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

    // ===========================================
    // OFFLINE LOGIN
    // ===========================================
    fastify.post("/login", async (request, reply) => {
        try {
            const { email, password } = request.body;

            if (!email || !password) {
                return reply.send({
                    statusCode: "01",
                    message: "Email & password required",
                });
            }

            // 1️⃣ Find user
            const user = await fastify.prisma.user.findUnique({
                where: { email },
                include: {
                    company: true,
                    branch: true
                }
            });

            if (!user) {
                return reply.send({
                    statusCode: "02",
                    message: "Invalid login credentials",
                });
            }

            // 2️⃣ Check password
            const validPassword = await bcrypt.compare(password, user.password);
            if (!validPassword) {
                return reply.send({
                    statusCode: "02",
                    message: "Invalid login credentials",
                });
            }

            // 3️⃣ Issue token (for offline sync)
            const token = fastify.jwt.sign({
                id: user.id,
                role: user.role,
                companyId: user.companyId,
                branchId: user.branchId || null,
            });

            // ===========================================
            // 4️⃣ ROLE-BASED OFFLINE RESPONSE
            // ===========================================

            let offlineData = {
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                }
            };

            // ADMIN → Return company details
            if (user.role === "ADMIN" || user.role === "SUPERADMIN") {
                offlineData.company = {
                    id: user.company.id,
                    name: user.company.name,
                    email: user.company.primaryEmail,
                    phone: user.company.primaryPhoneNo,
                    address: user.company.addressLine1,
                    currency: user.company.currencyId,
                    license: {
                        key: user.company.license?.licenseKey || "OFFLINE-LICENSE",
                        expiry: user.company.license?.expiresAt || null
                    }
                };
            }

            // BRANCH ADMIN → Return company + branch details
            if (user.role === "BRANCHADMIN") {
                offlineData.company = {
                    id: user.company.id,
                    name: user.company.name,
                    email: user.company.primaryEmail,
                    phone: user.company.primaryPhoneNo,
                    address: user.company.addressLine1,
                };

                offlineData.branch = {
                    id: user.branch.id,
                    name: user.branch.name,
                    address: user.branch.addressLine1,
                    city: user.branch.city,
                    pincode: user.branch.pincode,
                };
            }

            // USER → Return only user details (already set above)

            return reply.code(200).send({
                statusCode: "00",
                message: "login successful",
                token,
                ...offlineData
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
