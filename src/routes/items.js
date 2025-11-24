'use strict'
const svc = require('../services/itemService')
const stockSvc = require('../services/stockService')
const checkRole = require('../utils/checkRole')

module.exports = async function (fastify, opts) {
  /**
   * Define reusable Item schema
   */
  fastify.addSchema({
    $id: 'Item',
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      productId: { type: 'string', format: 'uuid' },
      sku: { type: 'string', example: 'LAP-001-RED' },
      price: { type: 'number', example: 75000 },
      quantity: { type: 'integer', example: 50 },
      location: { type: 'string', example: 'Warehouse A' },
      companyId: { type: 'string', format: 'uuid' }
    }
  })

  // Create item
  fastify.post(
    '/',
    {
      preHandler: checkRole("ADMIN"),
      schema: {
        tags: ['Items'],
        summary: 'Create a new item',
        body: {
          type: 'object',
          required: ['productId', 'quantity'],
          properties: {
            productId: { type: 'string', format: 'uuid' },
            sku: { type: 'string', example: 'LAP-001-RED' },
            price: { type: 'number', example: 75000 },
            quantity: { type: 'integer', example: 50 },
            location: { type: 'string', example: 'Warehouse A' }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { productId, quantity } = request.body

        if (!productId) {
          return reply.code(400).send({
            statusCode: '01',
            message: 'productId is required'
          })
        }
        if (!quantity || quantity <= 0) {
          return reply.code(400).send({
            statusCode: '01',
            message: 'Quantity must be greater than zero'
          })
        }

        const data = { ...request.body, companyId: request.user.companyId }
        const item = await svc.createItem(fastify.prisma, data)

        await stockSvc.recordStock(fastify.prisma, {
          itemId: item.id,
          companyId: request.user.companyId,
          type: 'PURCHASE',
          quantity: request.body.quantity,
          note: 'Restocking'
        })

        return reply.code(201).send({
          statusCode: '00',
          message: 'Item created successfully',
          data: item
        })
      } catch (error) {
        fastify.log.error(error)
        return reply.code(500).send({
          statusCode: '99',
          message: 'Failed to create item',
          error: error.message
        })
      }
    }
  )

  // List items
  fastify.get(
    '/',
    {
      preHandler: checkRole("ADMIN"),
      schema: {
        tags: ['Items'],
        summary: 'List items with pagination',
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', default: 1 },
            take: { type: 'integer', default: 20 }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const page = Number(request.query.page || 1)
        const take = Number(request.query.take || 20)
        const skip = (page - 1) * take

        const items = await svc.listItems(
          fastify.prisma,
          request.user.companyId,
          { skip, take }
        )

        return reply.code(200).send({
          statusCode: '00',
          message: 'Items fetched successfully',
          data: items
        })
      } catch (error) {
        fastify.log.error(error)
        return reply.code(500).send({
          statusCode: '99',
          message: 'Failed to fetch items',
          error: error.message
        })
      }
    }
  )

  // Update item
  fastify.put(
    '/:id',
    {
      preHandler: checkRole("ADMIN"),
      schema: {
        tags: ['Items'],
        summary: 'Update an existing item',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' }
          }
        },
        body: {
          type: 'object',
          properties: {
            sku: { type: 'string', example: 'LAP-001-RED' },
            price: { type: 'number', example: 76000 },
            quantity: { type: 'integer', example: 60 },
            location: { type: 'string', example: 'Warehouse B' },
            productId: { type: 'string', format: 'uuid' }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { id } = request.params
        const { sku, price, quantity, location, productId } = request.body

        if (!sku && !price && !quantity && !location && !productId) {
          return reply.code(400).send({
            statusCode: '01',
            message:
              'At least one field (sku, price, quantity, location, productId) is required to update'
          })
        }

        const item = await fastify.prisma.item.findUnique({ where: { id } })
        if (!item) {
          return reply.code(404).send({
            statusCode: '01',
            message: 'Item not found'
          })
        }

        let quantityDiff = 0
        if (typeof quantity === 'number' && quantity !== item.quantity) {
          quantityDiff = quantity - item.quantity

          await fastify.prisma.stockLedger.create({
            data: {
              companyId: item.companyId,
              itemId: item.id,
              type: quantityDiff > 0 ? 'PURCHASE' : 'ADJUSTMENT',
              quantity: Math.abs(quantityDiff),
              note: `Quantity updated from ${item.quantity} to ${quantity}`
            }
          })
        }

        const updated = await fastify.prisma.item.update({
          where: { id },
          data: { sku, price, quantity, location, productId }
        })

        return reply.code(200).send({
          statusCode: '00',
          message: 'Item updated successfully',
          data: updated
        })
      } catch (error) {
        fastify.log.error(error)
        return reply.code(500).send({
          statusCode: '99',
          message: 'Failed to update item',
          error: error.message
        })
      }
    }
  )

  // Delete item
  fastify.delete(
    '/:id',
    {
      preHandler: checkRole("ADMIN"),
      schema: {
        tags: ['Items'],
        summary: 'Delete an item',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { id } = request.params

        const item = await fastify.prisma.item.findUnique({ where: { id } })
        if (!item) {
          return reply.code(404).send({
            statusCode: '01',
            message: 'Item not found'
          })
        }

        await fastify.prisma.item.delete({ where: { id } })

        return reply.code(200).send({
          statusCode: '00',
          message: 'Item deleted successfully'
        })
      } catch (error) {
        fastify.log.error(error)
        return reply.code(500).send({
          statusCode: '99',
          message: 'Failed to delete item',
          error: error.message
        })
      }
    }
  )
}