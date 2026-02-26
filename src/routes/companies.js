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

    fastify.post(
        "/register/branch",
        { preHandler: checkRole("ADMIN") },
        async (request, reply) => {
            try {
                const companyId = request.companyId || request.user.companyId;

                const {
                    name: branchName,
                    addressLine1,
                    addressLine2,
                    addressLine3,
                    city,
                    state,
                    pincode,
                    user
                } = request.body;

                const { email, name } = user;

                console.log("Registering branch payload:", {
                    branchName,
                    email,
                    name,
                    addressLine1,
                    addressLine2,
                    addressLine3,
                    city,
                    state,
                    pincode
                });

                const existingUser = await fastify.prisma.user.findUnique({ where: { email } });
                if (existingUser) {
                    return reply.send({ statusCode: "02", message: "Email already registered" });
                }

                const company = await fastify.prisma.company.findUnique({ where: { id: companyId } });
                if (!company) {
                    return reply.send({ statusCode: "03", message: "Company not found" });
                }

                const branch = await fastify.prisma.branch.create({
                    data: {
                        name: branchName,
                        addressLine1,
                        addressLine2,
                        addressLine3,
                        city,
                        state,
                        pincode: Number(pincode),
                        companyId
                    }
                });

                const password = generateRandomPassword();

                const hashedPassword = await bcrypt.hash(password, 10);

                const createdUser = await fastify.prisma.user.create({
                    data: {
                        email,
                        password: hashedPassword,
                        name,
                        role: "BRANCHADMIN",
                        companyId,
                        branchId: branch.id
                    },
                    include: {
                        company: true,
                        branch: true
                    }
                });

                await enqueueUserRegistrationEmail({
                    to: email,
                    name: branch.name,
                    role: "BRANCHADMIN",
                    email: email,
                    mobile_no: null,
                    password: password,
                });

                return reply.send({
                    statusCode: "00",
                    message: "Branch & Store Admin registered successfully",
                    data: createdUser
                });

            } catch (err) {
                request.log.error(err);
                return reply.send({
                    statusCode: "99",
                    message: "Internal server error",
                    error: err.message
                });
            }
        }
    );

    fastify.get(
        "/branches/options",
        { preHandler: checkRole("ADMIN", "BRANCHADMIN") },
        async (req, reply) => {
            try {
                const companyId = req.companyId;

                const branches = await fastify.prisma.branch.findMany({
                    where: { companyId },
                    select: { id: true, name: true }
                });

                return reply.send({
                    statusCode: "00",
                    data: branches
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

    fastify.get(
        "/branches",
        { preHandler: checkRole("ADMIN", "BRANCHADMIN") },
        async (req, reply) => {
            try {
                const companyId = req.companyId;
                const { page = 1, limit = 10, search = "" } = req.query;

                const skip = (page - 1) * limit;

                const where = {
                    companyId,
                    ...(search
                        ? {
                            OR: [
                                { name: { contains: search, mode: "insensitive" } },
                                { city: { contains: search, mode: "insensitive" } },
                                { state: { contains: search, mode: "insensitive" } }
                            ]
                        }
                        : {})
                };

                const [branches, total] = await Promise.all([
                    fastify.prisma.branch.findMany({
                        where,
                        skip,
                        take: parseInt(limit),
                        orderBy: { createdAt: "desc" },
                        include: {
                            users: true,
                        },
                    }),
                    fastify.prisma.branch.count({ where })
                ]);

                return reply.send({
                    statusCode: "00",
                    data: branches,
                    meta: {
                        total,
                        page: parseInt(page),
                        limit: parseInt(limit),
                        totalPages: Math.ceil(total / limit)
                    }
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

    /** -------------------------------------------
 * 📌 UPDATE BRANCH (Admin only)
 * -------------------------------------------*/
    fastify.put(
        "/branch/:id",
        { preHandler: checkRole("ADMIN") },
        async (req, reply) => {
            try {
                const companyId = req.companyId;
                const branchId = req.params.id;

                const {
                    name,
                    addressLine1,
                    addressLine2,
                    addressLine3,
                    city,
                    state,
                    pincode
                } = req.body;

                const branch = await fastify.prisma.branch.findFirst({
                    where: { id: branchId, companyId }
                });

                if (!branch) {
                    return reply.send({
                        statusCode: "03",
                        message: "Branch not found"
                    });
                }

                const updated = await fastify.prisma.branch.update({
                    where: { id: branchId },
                    data: {
                        name,
                        addressLine1,
                        addressLine2,
                        addressLine3,
                        city,
                        state,
                        pincode
                    }
                });

                return reply.send({
                    statusCode: "00",
                    message: "Branch updated successfully",
                    data: updated
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


    fastify.delete(
        "/branch/:id",
        { preHandler: checkRole("ADMIN") },
        async (req, reply) => {
            try {
                const companyId = req.companyId;
                const branchId = req.params.id;

                const branch = await fastify.prisma.branch.findFirst({
                    where: { id: branchId, companyId }
                });

                if (!branch) {
                    return reply.send({
                        statusCode: "03",
                        message: "Branch not found"
                    });
                }

                await fastify.prisma.user.deleteMany({
                    where: { branchId }
                });

                await fastify.prisma.branchItem.deleteMany({
                    where: { branchId }
                });

                await fastify.prisma.stockLedger.deleteMany({
                    where: { branchId }
                });

                await fastify.prisma.branch.delete({
                    where: { id: branchId }
                });

                return reply.send({
                    statusCode: "00",
                    message: "Branch deleted successfully"
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

    // BANNERS: GET ALL UNDER COMPANY
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
                        image: true     // Include image details
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

    fastify.put(
        "/banners/:id",
        { preHandler: checkRole("ADMIN") },
        async (request, reply) => {
            try {
                const companyId = request.user.companyId;
                const { id } = request.params;
                const { manage } = request.body;

                // 🔥 If setting this banner as default
                if (manage === true) {
                    await fastify.prisma.$transaction([
                        // 1️⃣ Reset all banners under company
                        fastify.prisma.banner.updateMany({
                            where: { companyId },
                            data: { manage: false }
                        }),

                        // 2️⃣ Set selected banner as default
                        fastify.prisma.banner.update({
                            where: { id },
                            data: { manage: true }
                        })
                    ]);
                } else {
                    // Normal update (disable only this banner)
                    await fastify.prisma.banner.update({
                        where: { id },
                        data: { manage: false }
                    });
                }

                return reply.send({
                    statusCode: "00",
                    message: "Banner updated successfully"
                });

            } catch (err) {
                request.log.error(err);
                return reply.code(500).send({
                    statusCode: "99",
                    message: "Failed to update banner",
                    error: err.message
                });
            }
        }
    );

    // BANNERS: CREATE
    fastify.post(
        "/banners",
        { preHandler: checkRole("ADMIN") },
        async (request, reply) => {
            try {
                const companyId = request.user.companyId;
                const { title, description, imageUrl, imageId, manage = true } = request.body;

                await fastify.prisma.banner.updateMany({
                    where: { companyId },
                    data: { manage: false }
                })

                // Create banner under Company
                const banner = await fastify.prisma.banner.create({
                    data: {
                        title,
                        description,
                        imageUrl,
                        manage,
                        companyId,
                        ...(imageId ? { imageId } : {}) // only if imageId provided
                    }
                });

                // If imageId provided, bind image to this banner
                if (imageId) {
                    await fastify.prisma.images.update({
                        where: { id: imageId },
                        data: { banners: { connect: { id: banner.id } } }
                    });
                }

                const bannerWithImage = await fastify.prisma.banner.findUnique({
                    where: { id: banner.id },
                    include: { image: true }
                });

                return reply.code(201).send({
                    statusCode: "00",
                    message: "Banner created successfully",
                    data: bannerWithImage
                });

            } catch (err) {
                request.log.error(err);
                return reply.code(500).send({
                    statusCode: "99",
                    message: "Failed to create banner",
                    error: err.message
                });
            }
        }
    );

}
