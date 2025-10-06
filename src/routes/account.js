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
}
