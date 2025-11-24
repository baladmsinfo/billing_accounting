'use strict'
const svc = require('../services/cartService')
const checkRole = require('../utils/checkRole')

module.exports = async function (fastify, opts) {
    // Add item to customer's cart
    fastify.post(
        '/:customerId/cart/items',
        {
            preHandler: checkRole("ADMIN"),
            schema: {
                tags: ['Cart'],
                summary: 'Add an item to a customer\'s active cart',
                params: {
                    type: 'object',
                    required: ['customerId'],
                    properties: {
                        customerId: { type: 'string', example: 'customer-id-uuid' }
                    }
                },
                body: {
                    type: 'object',
                    required: ['itemId', 'quantity'],
                    properties: {
                        itemId: { type: 'string', example: 'item-id-uuid' },
                        quantity: { type: 'number', example: 2 }
                    }
                }
            }
        },
        async (request, reply) => {
            try {
                const { customerId } = request.params
                const { itemId, quantity } = request.body
                const companyId = request.user.companyId

                const cartItem = await svc.addItemToCart(fastify.prisma, companyId, customerId, itemId, quantity)

                reply.code(201).send({
                    statusCode: 201,
                    message: 'Item added to cart successfully',
                    data: cartItem
                })
            } catch (error) {
                fastify.log.error(error)
                reply.code(500).send({
                    statusCode: 500,
                    message: 'Failed to add item to cart',
                    error: error.message
                })
            }
        }
    )

    // Get Cart Details

        fastify.get(
        '/:customerId/carts',
        {
            preHandler: checkRole("ADMIN"),
            schema: {
                tags: ['Cart'],
                summary: 'Get all carts of a customer (with items)',
                params: {
                    type: 'object',
                    required: ['customerId'],
                    properties: {
                        customerId: { type: 'string', example: 'customer-id-uuid' }
                    }
                }
            }
        },
        async (request, reply) => {
            try {
                const { customerId } = request.params
                const companyId = request.user.companyId

                const carts = await svc.getCustomerCarts(
                    fastify.prisma,
                    companyId,
                    customerId
                )

                reply.send({
                    statusCode: 200,
                    message: 'Customer carts retrieved successfully',
                    data: carts
                })
            } catch (error) {
                fastify.log.error(error)
                reply.code(500).send({
                    statusCode: 500,
                    message: 'Failed to fetch customer carts',
                    error: error.message
                })
            }
        }
    )

    // Increment cart item
    fastify.patch(
        '/:customerId/cart/items/:cartItemId/increment',
        {
            preHandler: checkRole("ADMIN"),
            schema: {
                tags: ['Cart'],
                summary: 'Increment quantity of a cart item by 1',
                params: {
                    type: 'object',
                    required: ['customerId', 'cartItemId'],
                    properties: {
                        customerId: { type: 'string', example: 'customer-id-uuid' },
                        cartItemId: { type: 'string', example: 'cart-item-id-uuid' }
                    }
                }
            }
        },
        async (request, reply) => {
            try {
                const { customerId, cartItemId } = request.params
                const companyId = request.user.companyId

                const updated = await svc.incrementCartItemQuantity(
                    fastify.prisma,
                    companyId,
                    customerId,
                    cartItemId
                )

                if (!updated) {
                    return reply.code(404).send({
                        statusCode: 404,
                        message: 'Cart item not found'
                    })
                }

                reply.send({
                    statusCode: 200,
                    message: 'Cart item quantity incremented',
                    data: updated
                })
            } catch (error) {
                fastify.log.error(error)
                reply.code(500).send({
                    statusCode: 500,
                    message: 'Failed to increment cart item',
                    error: error.message
                })
            }
        }
    )

    // Decrement cart item
    fastify.patch(
        '/:customerId/cart/items/:cartItemId/decrement',
        {
            preHandler: checkRole("ADMIN"),
            schema: {
                tags: ['Cart'],
                summary: 'Decrement quantity of a cart item by 1 (auto-delete if reaches 0)',
                params: {
                    type: 'object',
                    required: ['customerId', 'cartItemId'],
                    properties: {
                        customerId: { type: 'string', example: 'customer-id-uuid' },
                        cartItemId: { type: 'string', example: 'cart-item-id-uuid' }
                    }
                }
            }
        },
        async (request, reply) => {
            try {
                const { customerId, cartItemId } = request.params
                const companyId = request.user.companyId

                const updated = await svc.decrementCartItemQuantity(
                    fastify.prisma,
                    companyId,
                    customerId,
                    cartItemId
                )

                if (!updated) {
                    return reply.code(404).send({
                        statusCode: 404,
                        message: 'Cart item not found'
                    })
                }

                if (updated.deleted) {
                    return reply.send({
                        statusCode: 200,
                        message: 'Cart item deleted (quantity reached 0)'
                    })
                }

                reply.send({
                    statusCode: 200,
                    message: 'Cart item quantity decremented',
                    data: updated
                })
            } catch (error) {
                fastify.log.error(error)
                reply.code(500).send({
                    statusCode: 500,
                    message: 'Failed to decrement cart item',
                    error: error.message
                })
            }
        }
    )

    //  Update cart item
    fastify.patch(
        '/:customerId/cart/items/:cartItemId',
        {
            preHandler: checkRole("ADMIN"),
            schema: {
                tags: ['Cart'],
                summary: 'Update quantity of an item in customer\'s cart',
                params: {
                    type: 'object',
                    required: ['customerId', 'cartItemId'],
                    properties: {
                        customerId: { type: 'string', example: 'customer-id-uuid' },
                        cartItemId: { type: 'string', example: 'cart-item-id-uuid' }
                    }
                },
                body: {
                    type: 'object',
                    required: ['quantity'],
                    properties: {
                        quantity: { type: 'number', example: 5 }
                    }
                }
            }
        },
        async (request, reply) => {
            try {
                const { customerId, cartItemId } = request.params
                const { quantity } = request.body
                const companyId = request.user.companyId

                const updated = await svc.updateCartItemQuantity(
                    fastify.prisma,
                    companyId,
                    customerId,
                    cartItemId,
                    quantity
                )

                if (!updated) {
                    return reply.code(404).send({
                        statusCode: 404,
                        message: 'Cart item not found'
                    })
                }

                reply.send({
                    statusCode: 200,
                    message: 'Cart item updated successfully',
                    data: updated
                })
            } catch (error) {
                fastify.log.error(error)
                reply.code(500).send({
                    statusCode: 500,
                    message: 'Failed to update cart item',
                    error: error.message
                })
            }
        }
    )

    //  Delete cart item
    fastify.delete(
        '/:customerId/cart/items/:cartItemId',
        {
            preHandler: checkRole("ADMIN"),
            schema: {
                tags: ['Cart'],
                summary: 'Delete an item from customer\'s cart',
                params: {
                    type: 'object',
                    required: ['customerId', 'cartItemId'],
                    properties: {
                        customerId: { type: 'string', example: 'customer-id-uuid' },
                        cartItemId: { type: 'string', example: 'cart-item-id-uuid' }
                    }
                }
            }
        },
        async (request, reply) => {
            try {
                const { customerId, cartItemId } = request.params
                const companyId = request.user.companyId

                const deleted = await svc.deleteCartItem(
                    fastify.prisma,
                    companyId,
                    customerId,
                    cartItemId
                )

                if (!deleted) {
                    return reply.code(404).send({
                        statusCode: 404,
                        message: 'Cart item not found'
                    })
                }

                reply.send({
                    statusCode: 200,
                    message: 'Cart item deleted successfully'
                })
            } catch (error) {
                fastify.log.error(error)
                reply.code(500).send({
                    statusCode: 500,
                    message: 'Failed to delete cart item',
                    error: error.message
                })
            }
        }
    )
}
