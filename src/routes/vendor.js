'use strict'
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

module.exports = async function (fastify, opts) {
    // Create Vendor
    fastify.post(
        '/vendors',
        {
            preHandler: [fastify.authenticate],
            schema: {
                tags: ['Vendors'],
                summary: 'Create a new vendor',
                body: {
                    type: 'object',
                    required: ['name'],
                    properties: {
                        name: { type: 'string' },
                        email: { type: 'string' },
                        phone: { type: 'string' },
                        address: { type: 'string' },
                        gstin: { type: 'string'}
                    }
                },
                response: {
                    200: {
                        type: 'object',
                        properties: {
                            statusCode: { type: 'string' },
                            data: {
                                type: 'object',
                                properties: {
                                    id: { type: 'string' },
                                    name: { type: 'string' },
                                    email: { type: 'string' },
                                    phone: { type: 'string' },
                                    address: { type: 'string' }
                                }
                            }
                        }
                    }
                }
            }
        },
        async (request, reply) => {
            try {
                const { name, email, phone, address, gstin } = request.body
                const companyId = request.user.companyId

                const vendor = await prisma.vendor.create({
                    data: { name, email, phone, address, companyId, gstin }
                })

                reply.send({ statusCode: '00', message:"Vendor created successfully", data: vendor })
            } catch (err) {
                request.log.error(err)
                reply.status(500).send({ statusCode: '99', error: 'Vendor creation failed' })
            }
        }
    )

    // Update Vendor
    fastify.put(
        '/vendors/:id',
        {
            preHandler: [fastify.authenticate],
            schema: {
                tags: ['Vendors'],
                summary: 'Update vendor by ID',
                params: {
                    type: 'object',
                    required: ['id'],
                    properties: { id: { type: 'string' } }
                },
                body: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                        email: { type: 'string' },
                        phone: { type: 'string' },
                        address: { type: 'string' },
                        gstin: { type: 'string'}
                    }
                }
            }
        },
        async (request, reply) => {
            try {
                const { id } = request.params
                const { name, email, phone, address } = request.body

                const vendor = await prisma.vendor.update({
                    where: { id },
                    data: { name, email, phone, address }
                })

                reply.send({ statusCode: '00', data: vendor })
            } catch (err) {
                request.log.error(err)
                reply.status(500).send({ statusCode: '99', error: 'Vendor update failed' })
            }
        }
    )

    // Get All Vendors with pagination
    fastify.get(
        '/vendors',
        {
            preHandler: [fastify.authenticate],
            schema: {
                tags: ['Vendors'],
                summary: 'Get all vendors (paginated)',
                querystring: {
                    type: 'object',
                    properties: {
                        page: { type: 'integer', minimum: 1, default: 1 },
                        limit: { type: 'integer', minimum: 1, default: 10 }
                    }
                }
            }
        },
        async (request, reply) => {
            try {
                const { page = 1, limit = 10 } = request.query
                const companyId = request.user.companyId

                const vendors = await prisma.vendor.findMany({
                    where: { companyId },
                    skip: (page - 1) * limit,
                    take: limit
                })

                const total = await prisma.vendor.count({ where: { companyId } })

                reply.send({
                    statusCode: '00',
                    data: vendors,
                    meta: { total, page, limit }
                })
            } catch (err) {
                request.log.error(err)
                reply.status(500).send({ statusCode: '99', error: 'Failed to fetch vendors' })
            }
        }
    )

    // Get Single Vendor
    fastify.get(
        '/vendors/:id',
        {
            preHandler: [fastify.authenticate],
            schema: {
                tags: ['Vendors'],
                summary: 'Get vendor by ID',
                params: {
                    type: 'object',
                    required: ['id'],
                    properties: { id: { type: 'string' } }
                }
            }
        },
        async (request, reply) => {
            try {
                const { id } = request.params
                const companyId = request.user.companyId

                const vendor = await prisma.vendor.findFirst({
                    where: { id, companyId }
                })

                if (!vendor) {
                    return reply.status(404).send({ statusCode: '01', error: 'Vendor not found' })
                }

                reply.send({ statusCode: '00', data: vendor })
            } catch (err) {
                request.log.error(err)
                reply.status(500).send({ statusCode: '99', error: 'Failed to fetch vendor' })
            }
        }
    )

    // Delete Vendor
    fastify.delete(
        '/vendors/:id',
        {
            preHandler: [fastify.authenticate],
            schema: {
                tags: ['Vendors'],
                summary: 'Delete vendor by ID',
                params: {
                    type: 'object',
                    required: ['id'],
                    properties: { id: { type: 'string' } }
                }
            }
        },
        async (request, reply) => {
            try {
                const { id } = request.params
                const companyId = request.user.companyId

                const vendor = await prisma.vendor.findFirst({
                    where: { id, companyId }
                })

                if (!vendor) {
                    return reply.status(404).send({ statusCode: '01', error: 'Vendor not found' })
                }

                await prisma.vendor.delete({ where: { id } })
                reply.send({ statusCode: '00', message: 'Vendor deleted successfully' })
            } catch (err) {
                request.log.error(err)
                reply.status(500).send({ statusCode: '99', error: 'Vendor deletion failed' })
            }
        }
    )

    fastify.get(
        '/vendors/search',
        {
            preHandler: [fastify.authenticate],
            schema: {
                tags: ['Vendors'],
                summary: 'Search vendors with multiple filters',
                querystring: {
                    type: 'object',
                    properties: {
                        name: { type: 'string', description: 'Search by vendor name (partial match)' },
                        email: { type: 'string', description: 'Search by vendor email (partial match)' },
                        phone: { type: 'string', description: 'Search by vendor phone (partial match)' },
                        gstNumber: { type: 'string', description: 'Search by GST number (partial match)' },
                        address: { type: 'string', description: 'Search by vendor address (partial match)' },
                        page: { type: 'integer', minimum: 1, default: 1 },
                        limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 }
                    }
                },
                response: {
                    200: {
                        type: 'object',
                        properties: {
                            statusCode: { type: 'string' },
                            data: {
                                type: 'object',
                                properties: {
                                    vendors: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                id: { type: 'string' },
                                                name: { type: 'string' },
                                                email: { type: 'string' },
                                                phone: { type: 'string' },
                                                address: { type: 'string' },
                                                gstNumber: { type: 'string' }
                                            }
                                        }
                                    },
                                    total: { type: 'integer' },
                                    page: { type: 'integer' },
                                    limit: { type: 'integer' }
                                }
                            }
                        }
                    }
                }
            }
        },
        async (request, reply) => {
            const { name, email, phone, gstNumber, address, page = 1, limit = 10 } = request.query
            const companyId = request.user.companyId

            // Build dynamic filters
            const filters = []
            if (name) filters.push({ name: { contains: name, mode: 'insensitive' } })
            if (email) filters.push({ email: { contains: email, mode: 'insensitive' } })
            if (phone) filters.push({ phone: { contains: phone, mode: 'insensitive' } })
            if (gstNumber) filters.push({ gstNumber: { contains: gstNumber, mode: 'insensitive' } })
            if (address) filters.push({ address: { contains: address, mode: 'insensitive' } })

            const where = {
                companyId,
                AND: filters
            }

            const [vendors, total] = await Promise.all([
                prisma.vendor.findMany({
                    where,
                    skip: (page - 1) * limit,
                    take: limit
                }),
                prisma.vendor.count({ where })
            ])

            return reply.send({
                statusCode: '00',
                data: { vendors, total, page, limit }
            })
        }
    )
}
