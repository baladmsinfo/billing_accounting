'use strict'

module.exports = async function (fastify, opts) {
    // Create category with optional children (subcategories)
    fastify.post(
        '/',
        {
            preHandler: [fastify.authenticate],
            schema: {
                tags: ['Category'],
                description: 'Create a new category with optional subcategories',
                body: {
                    type: 'object',
                    required: ['name'],
                    properties: {
                        name: { type: 'string', example: 'Electronics' },
                        description: { type: 'string', example: 'All electronic items' },
                        children: {
                            type: 'array',
                            items: {
                                type: 'object',
                                required: ['name'],
                                properties: {
                                    name: { type: 'string', example: 'Laptops' },
                                    description: { type: 'string', example: 'Portable computers' }
                                }
                            }
                        }
                    }
                }
            }
        },
        async (request, reply) => {
            try {
                const data = { ...request.body, companyId: request.user.companyId }

                const category = await fastify.prisma.category.create({
                    data: {
                        name: data.name.toUpperCase(),
                        description: data.description,
                        companyId: data.companyId,
                        children: {
                            create: data.children?.map(c => ({
                                name: c.name.toUpperCase(),
                                description: c.description,
                                companyId: data.companyId,
                            }))
                        }
                    },
                    include: { children: true }
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

    // List categories with children
    fastify.get(
        '/',
        {
            preHandler: [fastify.authenticate],
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
            preHandler: [fastify.authenticate],
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
            preHandler: [fastify.authenticate],
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

    // Delete category
    fastify.delete(
        '/:id',
        {
            preHandler: [fastify.authenticate],
            schema: {
                tags: ['Category'],
                description: 'Delete a category by ID',
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
                const { id } = request.params

                const category = await fastify.prisma.category.findUnique({ where: { id } })
                if (!category) {
                    return reply.code(404).send({
                        statusCode: '01',
                        message: 'Category not found'
                    })
                }

                await fastify.prisma.category.delete({ where: { id } })

                return reply.code(200).send({
                    statusCode: '00',
                    message: 'Category deleted successfully'
                })
            } catch (error) {
                fastify.log.error(error)
                return reply.code(500).send({
                    statusCode: '99',
                    message: 'Failed to delete category',
                    error: error.message
                })
            }
        }
    )
}