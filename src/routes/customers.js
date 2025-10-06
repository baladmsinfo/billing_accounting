'use strict'
const svc = require('../services/customerService')

module.exports = async function (fastify, opts) {
  // Create customer
  fastify.post(
    '/',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Customers'],
        summary: 'Create a new customer',
        body: {
          type: 'object',
          required: ['name', 'email', 'phone'],
          properties: {
            name: { type: 'string', example: 'John Doe' },
            email: { type: 'string', format: 'email', example: 'john@example.com' },
            phone: { type: 'string', example: '+91-9876543210' },
            gstin: { type: 'string', example: '22BBBBB1111B2Z6' }
          },
          example: {
            name: 'John Doe',
            email: 'john@example.com',
            phone: '+91-9876543210',
            gstin: '22BBBBB1111B2Z6'
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const data = { ...request.body, companyId: request.user.companyId }
        const customer = await svc.createCustomer(fastify.prisma, data)

        reply.code(201).send({
          statusCode: 201,
          message: 'Customer created successfully',
          data: customer
        })
      } catch (error) {
        fastify.log.error(error)
        reply.code(500).send({
          statusCode: 500,
          message: 'Failed to create customer',
          error: error.message
        })
      }
    }
  )

  // List customers
  fastify.get(
    '/',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Customers'],
        summary: 'List customers (paginated)',
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
      const page = Number(request.query.page || 1)
      const take = Number(request.query.take || 20)
      const skip = (page - 1) * take
      return svc.listCustomers(fastify.prisma, request.user.companyId, { skip, take })
    }
  )

  // Update customer
  fastify.put(
    '/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Customers'],
        summary: 'Update an existing customer',
        params: {
          type: 'object',
          properties: { id: { type: 'string', example: 'customer-id-uuid' } }
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', example: 'John Doe Updated' },
            email: { type: 'string', example: 'john.new@example.com' },
            phone: { type: 'string', example: '+91-9999999999' },
            gstin: { type: 'string', example: '22BBBBB1111B2Z6' }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const updated = await svc.updateCustomer(
          fastify.prisma,
          request.params.id,
          request.body,
          request.user.companyId
        )
        if (!updated) {
          return reply.code(404).send({
            statusCode: 404,
            message: 'Customer not found'
          })
        }
        reply.send({
          statusCode: 200,
          message: 'Customer updated successfully',
          data: updated
        })
      } catch (error) {
        fastify.log.error(error)
        reply.code(500).send({
          statusCode: 500,
          message: 'Failed to update customer',
          error: error.message
        })
      }
    }
  )

  // Delete customer
  fastify.delete(
    '/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Customers'],
        summary: 'Delete a customer',
        params: {
          type: 'object',
          properties: { id: { type: 'string', example: 'customer-id-uuid' } }
        }
      }
    },
    async (request, reply) => {
      try {
        const deleted = await svc.deleteCustomer(
          fastify.prisma,
          request.params.id,
          request.user.companyId
        )
        if (!deleted) {
          return reply.code(404).send({
            statusCode: 404,
            message: 'Customer not found'
          })
        }
        reply.send({
          statusCode: 200,
          message: 'Customer deleted successfully'
        })
      } catch (error) {
        fastify.log.error(error)
        reply.code(500).send({
          statusCode: 500,
          message: 'Failed to delete customer',
          error: error.message
        })
      }
    }
  )
}
