'use strict'
const svc = require('../services/paymentServices')

module.exports = async function (fastify, opts) {
  // ✅ Schemas
  const paymentBodySchema = {
    type: 'object',
    required: ['invoiceId', 'amount', 'method'],
    properties: {
      invoiceId: { type: 'string', example: 'inv_12345' },
      amount: { type: 'number', example: 5000 },
      method: { type: 'string', example: 'BANK_TRANSFER' },
      referenceNo: { type: 'string', example: 'TXN123456' },
      date: { type: 'string', format: 'date-time', example: '2025-08-18T10:30:00Z' },
      note: { type: 'string', example: 'Advance payment' }
    },
    additionalProperties: false
  }

  // Create Payment
  fastify.post(
    '/',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Payments'],
        summary: 'Create a payment',
        body: paymentBodySchema,
      }
    },
    async (req, reply) => {
      try {
        const { invoiceId, amount, method, referenceNo, date, note } = req.body

        const paymentData = {
          companyId: req.user.companyId,
          invoiceId,
          amount,
          method,
          referenceNo,
          date,
          note
        }

        const payment = await svc.createPayment(fastify.prisma, paymentData)

        return reply.code(201).send({
          statusCode: 201,
          message: 'Payment created successfully',
          data: payment
        })
      } catch (err) {
        fastify.log.error(err)
        return reply.code(500).send({
          statusCode: 500,
          message: 'Failed to create payment',
          error: err.message
        })
      }
    }
  )

  fastify.post(
    '/purchase',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Payments'],
        summary: 'Record Payment for Purchase',
        body: paymentBodySchema,
      }
    },
    async (req, reply) => {
      try {
        const { invoiceId, amount, method, referenceNo, date, note } = req.body

        const paymentData = {
          companyId: req.user.companyId,
          invoiceId,
          amount,
          method,
          referenceNo,
          date,
          note
        }

        const payment = await svc.recordPurchasePayment(fastify.prisma, paymentData)

        return reply.code(201).send({
          statusCode: 201,
          message: 'Payment recorded successfully',
          data: payment
        })
      } catch (err) {
        fastify.log.error(err)
        return reply.code(500).send({
          statusCode: 500,
          message: 'Failed to create payment',
          error: err.message
        })
      }
    }
  )

  // Get Payments (all or by invoiceId)
  fastify.get(
    '/',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Payments'],
        summary: 'List all payments or filter by invoiceId',
        querystring: {
          type: 'object',
          properties: {
            invoiceId: { type: 'string', example: 'inv_12345' }
          }
        }
      }
    },
    async (req, reply) => {
      try {
        const { invoiceId } = req.query
        const where = { companyId: req.user.companyId }
        if (invoiceId) where.invoiceId = invoiceId

        const payments = await fastify.prisma.payment.findMany({
          where,
          orderBy: { date: 'desc' }
        })

        return reply.code(200).send({
          statusCode: 200,
          message: 'Payments fetched successfully',
          data: payments
        })
      } catch (err) {
        fastify.log.error(err)
        return reply.code(500).send({
          statusCode: 500,
          message: 'Failed to fetch payments',
          error: err.message
        })
      }
    }
  )

  // Get single payment by ID
  fastify.get(
    '/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Payments'],
        summary: 'Get payment by ID',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', example: 'pay_12345' }
          }
        },
      }
    },
    async (req, reply) => {
      try {
        const { id } = req.params

        const payment = await fastify.prisma.payment.findUnique({
          where: { id },
          include: {
            invoice: {
              select: { id: true, invoiceNumber: true, status: true, totalAmount: true }
            }
          }
        })

        if (!payment) {
          return reply.code(404).send({
            statusCode: 404,
            message: 'Payment not found'
          })
        }

        return reply.code(200).send({
          statusCode: 200,
          message: 'Payment fetched successfully',
          data: payment
        })
      } catch (err) {
        fastify.log.error(err)
        return reply.code(500).send({
          statusCode: 500,
          message: 'Failed to fetch payment',
          error: err.message
        })
      }
    }
  )

  // Delete Payment
  fastify.delete(
    '/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Payments'],
        summary: 'Delete payment',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', example: 'pay_12345' }
          }
        },
      }
    },
    async (req, reply) => {
      try {
        const { id } = req.params

        const payment = await fastify.prisma.payment.findUnique({ where: { id } })
        if (!payment) {
          return reply.code(404).send({
            statusCode: 404,
            message: 'Payment not found'
          })
        }

        await fastify.prisma.$transaction(async (tx) => {
          await tx.payment.delete({ where: { id } })
          await svc.updateInvoiceStatus(tx, payment.invoiceId)
        })

        return reply.code(200).send({
          statusCode: 200,
          message: 'Payment deleted successfully'
        })
      } catch (err) {
        fastify.log.error(err)
        return reply.code(500).send({
          statusCode: 500,
          message: 'Failed to delete payment',
          error: err.message
        })
      }
    }
  )
}