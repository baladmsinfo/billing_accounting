'use strict'
const svc = require('../services/taxRateService')
const checkRole = require('../utils/checkRole')

module.exports = async function (fastify, opts) {
  // JSON Schemas
  const taxRateBodySchema = {
    type: 'object',
    required: ['name', 'rate', 'type'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 100 },
      rate: { type: 'number', minimum: 0 },
      type: { type: 'string', minLength: 1, maxLength: 50 }
    },
    additionalProperties: false
  }

  // Create Tax Rate
  fastify.post(
    '/',
    {
      preHandler: checkRole("ADMIN", "BRANCHADMIN"),
      schema: {
        tags: ['Tax Rate'],
        summary: 'Add Tax Rate',
        body: taxRateBodySchema,
      }
    },
    async (request, reply) => {
      try {
        const data = { ...request.body, companyId: request.user.companyId }
        const r = await svc.createTaxRate(fastify.prisma, data)

        return reply.code(201).send({
          statusCode: '00',
          message: 'Tax rate created successfully',
          data: r
        })
      } catch (err) {
        fastify.log.error(err)
        return reply.code(500).send({
          statusCode: '99',
          message: 'Failed to create tax rate',
          error: err.message
        })
      }
    }
  )

  // List Tax Rates
  fastify.get(
    '/',
    {
      preHandler: checkRole("ADMIN", "BRANCHADMIN"),
      schema: {
        tags: ['Tax Rate'],
        summary: 'Get Tax Rate',
      }
    },
    async (request, reply) => {
      try {
        const taxRates = await svc.listTaxRates(fastify.prisma, request.user.companyId)
        return reply.code(200).send({
          statusCode: '00',
          message: 'Tax rates fetched successfully',
          data: taxRates
        })
      } catch (err) {
        fastify.log.error(err)
        return reply.code(500).send({
          statusCode: '99',
          message: 'Failed to fetch tax rates',
          error: err.message
        })
      }
    }
  )

  // Update Tax Rate
  fastify.put(
    '/:id',
    {
      preHandler: checkRole("ADMIN", "BRANCHADMIN"),
      schema: {
        tags: ['Tax Rate'],
        summary: 'Update Tax Rate',
        body: taxRateBodySchema
      }
    },
    async (request, reply) => {
      try {
        const { id } = request.params

        const taxRate = await fastify.prisma.taxRate.findUnique({ where: { id } })
        if (!taxRate) {
          return reply.code(404).send({
            statusCode: '01',
            message: 'Tax rate not found'
          })
        }

        const updated = await fastify.prisma.taxRate.update({
          where: { id },
          data: request.body
        })

        return reply.code(200).send({
          statusCode: '00',
          message: 'Tax rate updated successfully',
          data: updated
        })
      } catch (err) {
        fastify.log.error(err)
        return reply.code(500).send({
          statusCode: '99',
          message: 'Failed to update tax rate',
          error: err.message
        })
      }
    }
  )

  // Delete Tax Rate
  fastify.delete(
    '/:id',
    {
      preHandler: checkRole("ADMIN", "BRANCHADMIN"),
      schema: {
        tags: ['Tax Rate'],
        summary: 'Delete a Tax Rate',
      }
    },
    async (request, reply) => {
      try {
        const { id } = request.params

        const taxRate = await fastify.prisma.taxRate.findUnique({ where: { id } })
        if (!taxRate) {
          return reply.code(404).send({
            statusCode: '01',
            message: 'Tax rate not found'
          })
        }

        await fastify.prisma.taxRate.delete({ where: { id } })

        return reply.code(200).send({
          statusCode: '00',
          message: 'Tax rate deleted successfully'
        })
      } catch (err) {
        fastify.log.error(err)
        return reply.code(500).send({
          statusCode: '99',
          message: 'Failed to delete tax rate',
          error: err.message
        })
      }
    }
  )

  fastify.post(
    "/tax",
    {
      preHandler: checkRole("ADMIN", "BRANCHADMIN"),
    },
    async (req, reply) => {
      try {
        const { fromDate, toDate } = req.body;

        const companyId = req.user.companyId;

        const taxes = await fastify.prisma.invoiceTax.findMany({
          where: {
            companyId,
            invoice: {
              date: {
                gte: new Date(fromDate),
                lte: new Date(toDate)
              }
            }
          },
          include: {
            invoice: {
              select: {
                id: true,
                invoiceNumber: true,
                date: true,
                type: true,
                customer: { select: { name: true, gstin: true } },
                vendor: { select: { name: true, gstin: true } },
                totalAmount: true
              }
            },
            taxRate: true
          },
          orderBy: { invoiceId: "asc" }
        });

        const grouped = taxes.reduce((acc, tx) => {
          if (!acc[tx.invoiceId]) {
            acc[tx.invoiceId] = {
              invoiceId: tx.invoiceId,
              invoiceNumber: tx.invoice.invoiceNumber,
              date: tx.invoice.date,
              invoiceType: tx.invoice.type,
              totalAmount: tx.invoice.totalAmount,
              customerName: tx.invoice.customer?.name || null,
              customerGST: tx.invoice.customer?.gstin || null,
              vendorName: tx.invoice.vendor?.name || null,
              vendorGST: tx.invoice.vendor?.gstin || null,
              taxes: []
            };
          }
          acc[tx.invoiceId].taxes.push({
            taxName: tx.taxRate.name,
            taxType: tx.taxRate.type,
            rate: tx.taxRate.rate,
            amount: tx.amount
          });
          return acc;
        }, {});

        return reply.send({
          statusCode: "00",
          message: "Tax report fetched successfully",
          data: Object.values(grouped)
        });
      } catch (error) {
        console.error("📌 Tax Report Error:", error);
        return reply.send({
          statusCode: "500",
          message: "Failed to fetch tax report",
          error: error.message
        });
      }
    }
  );
}