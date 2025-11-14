'use strict'
const svc = require('../services/stockService')

module.exports = async function (fastify, opts) {
  // Record stock entry
  fastify.post(
    '/',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Stock'],
        summary: 'Record a stock entry',
        body: {
          type: 'object',
          required: ['itemId', 'type', 'quantity'],
          properties: {
            itemId: { type: 'string', example: '<item-id>' },
            type: { type: 'string', enum: ['PURCHASE', 'SALE', 'ADJUSTMENT'], example: 'PURCHASE' },
            quantity: { type: 'number', example: 20 },
            note: { type: 'string', example: 'Restocking' }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const data = { ...request.body, companyId: request.user.companyId }
        const rec = await svc.recordStock(fastify.prisma, data)

        return reply.code(201).send({
          statusCode: '00',
          message: 'Stock recorded successfully',
          data: rec
        })
      } catch (err) {
        fastify.log.error(err)
        return reply.code(500).send({
          statusCode: '99',
          message: 'Failed to record stock',
          error: err.message
        })
      }
    }
  )

  // Get stock ledger entries
  fastify.get(
    '/',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Stock'],
        summary: 'Get stock ledger entries with pagination',
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'number', example: 1 },
            take: { type: 'number', example: 20 }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const page = Number(request.query.page || 1)
        const take = Number(request.query.take || 20)
        const skip = (page - 1) * take

        const [ledger, totalCount] = await Promise.all([
          fastify.prisma.stockLedger.findMany({
            where: { companyId: request.user.companyId },
            skip,
            take,
            orderBy: { date: 'desc' },
            include: { item: { include: { product: true } } },
          }),
          fastify.prisma.stockLedger.count({
            where: { companyId: request.user.companyId },
          }),
        ])

        return reply.code(200).send({
          statusCode: '00',
          message: 'Stock ledger fetched successfully',
          data: ledger,
          totalCount,
        })
      } catch (err) {
        fastify.log.error(err)
        return reply.code(500).send({
          statusCode: '99',
          message: 'Failed to fetch stock ledger',
          error: err.message,
        })
      }
    }
  )
}