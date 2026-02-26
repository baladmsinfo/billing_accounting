'use strict'
const checkRole = require('../utils/checkRole')

module.exports = async function (fastify, opts) {
    fastify.post(
        '/',
        {
            preHandler: checkRole("ADMIN"),
        },
        async (request, reply) => {
            try {
                const { name, description, children = [] } = request.body
                const { companyId } = request.user

                const company = await fastify.prisma.company.findUnique({
                    where: { id: companyId },
                    select: { trial: true }
                })

                if (company?.trial) {
                    const categoryCount = await fastify.prisma.category.count({
                        where: { companyId }
                    })

                    if (categoryCount >= 100) {
                        return reply.code(201).send({
                            statusCode: '05',
                            message: 'Trial limit reached. You can create only 100 categories. Subscribe to a plan to create more.',
                        })
                    }
                }

                const existingCategory = await fastify.prisma.category.findFirst({
                    where: {
                        companyId,
                        name: {
                            equals: name,
                            mode: 'insensitive',
                        },
                    },
                })

                if (existingCategory) {
                    return reply.code(400).send({
                        statusCode: '01',
                        message: `Category '${name}' already exists for this company.`,
                    })
                }

                const category = await fastify.prisma.category.create({
                    data: {
                        name: name.toUpperCase(),
                        description,
                        companyId,
                        children: {
                            create: children.map(c => ({
                                name: c.name.toUpperCase(),
                                description: c.description,
                                companyId,
                            })),
                        },
                    },
                    include: { children: true },
                })

                return reply.code(201).send({
                    statusCode: '00',
                    message: 'Category created successfully',
                    data: category
                })
            } catch (error) {
                fastify.log.error(error)
                return reply.code(500).send({
                    statusCode: '99',
                    message: 'Failed to create category',
                    error: error.message
                })
            }
        }
    )

    fastify.delete("/:id", {
        preHandler: checkRole("ADMIN"),
    }, async (req) => {
        const { id } = req.params
        const companyId = req.user.companyId

        try {
            // check if category has subcategories
            const subs = await fastify.prisma.category.findMany({
                where: { parentId: id, companyId }
            })
            if (subs.length > 0) {
                return { statusCode: "01", message: "Remove subcategories first" }
            }

            // check if products exist under this category
            const products = await fastify.prisma.product.findMany({
                where: { categoryId: id, companyId }
            })
            if (products.length > 0) {
                return { statusCode: "01", message: "Cannot delete — products linked" }
            }

            await fastify.prisma.category.delete({
                where: { id }
            })

            return { statusCode: "00", message: "Category deleted successfully" }
        } catch (err) {
            console.error("Delete category error:", err)
            return { statusCode: "99", message: "Internal error" }
        }
    })


    fastify.delete("/:id/subcategory", {
        preHandler: checkRole("ADMIN"),
    }, async (req) => {
        const { id } = req.params
        const companyId = req.user.companyId

        try {
            // check if subcategory is linked to any products
            const products = await fastify.prisma.product.findMany({
                where: { subCategoryId: id, companyId }
            })

            if (products.length > 0) {
                return { statusCode: "01", message: "Cannot delete — products linked" }
            }

            await fastify.prisma.category.delete({
                where: { id }
            })

            return { statusCode: "00", message: "Subcategory deleted successfully" }
        } catch (err) {
            console.error("Delete subcategory error:", err)
            return { statusCode: "99", message: "Internal error" }
        }
    })


    fastify.post(
        '/:parentId/subcategory',
        {
            preHandler: checkRole("ADMIN"),
        },
        async (request, reply) => {
            try {
                const { parentId } = request.params
                const { name, description } = request.body
                const { companyId } = request.user

                const parent = await fastify.prisma.category.findUnique({
                    where: { id: parentId },
                })

                if (!parent) {
                    return reply.code(404).send({
                        statusCode: '01',
                        message: 'Parent category not found'
                    })
                }

                const subcategory = await fastify.prisma.category.create({
                    data: {
                        name: name.toUpperCase(),
                        description,
                        parentId: parentId,
                        companyId
                    }
                })

                return reply.code(201).send({
                    statusCode: '00',
                    message: 'Subcategory created successfully',
                    data: subcategory
                })
            } catch (error) {
                fastify.log.error(error)
                return reply.code(500).send({
                    statusCode: '99',
                    message: 'Failed to create subcategory',
                    error: error.message
                })
            }
        }
    )

    // List categories with children
    fastify.get(
        '/',
        {
            preHandler: checkRole("ADMIN"),
            schema: {
                tags: ['Category'],
                description: 'List categories with pagination',
                querystring: {
                    type: 'object',
                    properties: {
                        page: { type: 'integer', example: 1 },
                        take: { type: 'integer', example: 20 }
                    }
                }
            }
        },
        async (request, reply) => {
            try {
                const page = Number(request.query.page || 1)
                const take = Number(request.query.take || 20)
                const skip = (page - 1) * take

                const categories = await fastify.prisma.category.findMany({
                    where: { companyId: request.user.companyId, parentId: null }, // only root categories
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
        }
    )

    // Get category by ID with children
    fastify.get(
        '/:id',
        {
            preHandler: checkRole("ADMIN"),
            schema: {
                tags: ['Category'],
                description: 'Get category by ID including children',
                params: {
                    type: 'object',
                    required: ['id'],
                    properties: {
                        id: { type: 'string', example: 'cat12345' }
                    }
                }
            }
        },
        async (request, reply) => {
            try {
                const category = await fastify.prisma.category.findUnique({
                    where: { id: request.params.id },
                    include: { children: true }
                })

                if (!category) {
                    return reply.code(404).send({
                        statusCode: '01',
                        message: 'Category not found'
                    })
                }

                return reply.code(200).send({
                    statusCode: '00',
                    message: 'Category fetched successfully',
                    data: category
                })
            } catch (error) {
                fastify.log.error(error)
                return reply.code(500).send({
                    statusCode: '99',
                    message: 'Failed to fetch category',
                    error: error.message
                })
            }
        }
    )

    // Update category & children
    fastify.put(
        '/:id',
        {
            preHandler: checkRole("ADMIN"),
            schema: {
                tags: ['Category'],
                description: 'Update category and its children',
                params: {
                    type: 'object',
                    required: ['id'],
                    properties: {
                        id: { type: 'string', example: 'cat12345' }
                    }
                },
                body: {
                    type: 'object',
                    properties: {
                        name: { type: 'string', example: 'Updated Electronics' },
                        description: { type: 'string', example: 'Updated description' },
                        children: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    id: { type: 'string', example: 'child12345' },
                                    name: { type: 'string', example: 'Gaming Laptops' },
                                    description: { type: 'string', example: 'Updated description' }
                                }
                            }
                        }
                    }
                }
            }
        },
        async (request, reply) => {
            try {
                const { id } = request.params
                const { children, ...categoryData } = request.body

                const category = await fastify.prisma.category.findUnique({
                    where: { id },
                    include: { children: true }
                })
                if (!category) {
                    return reply.code(404).send({
                        statusCode: '01',
                        message: 'Category not found'
                    })
                }

                await fastify.prisma.category.update({
                    where: { id },
                    data: categoryData
                })

                if (Array.isArray(children)) {
                    for (const c of children) {
                        if (c.id) {
                            // Update existing child
                            await fastify.prisma.category.update({
                                where: { id: c.id },
                                data: { name: c.name, description: c.description }
                            })
                        } else {
                            // Create new child
                            await fastify.prisma.category.create({
                                data: {
                                    name: c.name,
                                    description: c.description,
                                    parentId: id,
                                    companyId: request.user.companyId
                                }
                            })
                        }
                    }
                }

                const updated = await fastify.prisma.category.findUnique({
                    where: { id },
                    include: { children: true }
                })

                return reply.code(200).send({
                    statusCode: '00',
                    message: 'Category & children updated successfully',
                    data: updated
                })
            } catch (error) {
                fastify.log.error(error)
                return reply.code(500).send({
                    statusCode: '99',
                    message: 'Failed to update category',
                    error: error.message
                })
            }
        }
    )
}