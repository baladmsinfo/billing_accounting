'use strict'
const svc = require('../services/accountServices')

module.exports = async function (fastify, opts) {
  // Create Account
  fastify.post(
    '/',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Accounts'],
        summary: 'Create a new account for a company',
        body: {
          type: 'object',
          required: ['name', 'type', 'code'],
          properties: {
            name: { type: 'string', example: 'Travel Expense' },
            type: {
              type: 'string',
              enum: ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'],
              example: 'EXPENSE'
            },
            code: { type: 'string', example: '5300' }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const account = await svc.createAccount(fastify.prisma, request.body, request.user.companyId)

        reply.code(201).send({
          statusCode: 201,
          message: 'Account created successfully',
          data: account
        })
      } catch (error) {
        request.log.error(error)
        reply.code(500).send({
          statusCode: 500,
          message: 'Failed to create account',
          error: error.message
        })
      }
    }
  )

  // List Accounts
  fastify.get(
    '/',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Accounts'],
        summary: 'List accounts of a company',
      }
    },
    async (request, reply) => {
      try {
        const accounts = await svc.listAccounts(fastify.prisma, request.user.companyId)

        reply.code(200).send({
          statusCode: 200,
          data: accounts
        })
      } catch (error) {
        request.log.error(error)
        reply.code(500).send({
          statusCode: 500,
          message: 'Failed to fetch accounts',
          error: error.message
        })
      }
    }
  )

  fastify.get('/journals', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['Journals'],
      summary: 'Get all journal entries with pagination and date filters',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          take: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
          startDate: { type: 'string', format: 'date', nullable: true },
          endDate: { type: 'string', format: 'date', nullable: true },
        }
      }
    }
  }, async (req, reply) => {
    try {
      const { page = 1, take = 10, startDate, endDate } = req.query
      const user = req.user

      // ✅ Build filter
      const where = {
        companyId: user.companyId,
        ...(startDate && endDate
          ? {
            date: {
              gte: new Date(startDate),
              lt: new Date(new Date(endDate).setDate(new Date(endDate).getDate() + 1)) // include full end date
            }
          }
          : {})
      }

      // ✅ Fetch paginated data + count
      const [journals, total] = await Promise.all([
        fastify.prisma.journalEntry.findMany({
          where,
          include: {
            account: true,
          },
          orderBy: { date: 'desc' },
          skip: (page - 1) * take,
          take
        }),
        fastify.prisma.journalEntry.count({ where })
      ])

      return reply.send({
        statusCode: '00',
        total,
        page,
        take,
        data: journals
      })
    } catch (error) {
      fastify.log.error(error)
      return reply.status(500).send({
        statusCode: '99',
        message: 'Failed to fetch journal entries',
        error: error.message
      })
    }
  })
}
