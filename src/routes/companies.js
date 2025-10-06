'use strict'
const svc = require('../services/companyService')

module.exports = async function (fastify, opts) {
  fastify.post(
    '/',
    {
      preHandler: [fastify.authenticate, fastify.authorize(['ADMIN', 'SUPERADMIN'])],
      schema: {
        tags: ['Company'],
        summary: 'Create a new company',
        body: {
          type: 'object',
          required: [
            'name',
            'gstNumber',
            'primaryEmail',
            'primaryPhoneNo',
            'city',
            'state',
            'pincode',
            'companyType'
          ],
          properties: {
            name: { type: 'string', example: 'Example Corp' },
            gstNumber: { type: 'string', example: '22AAAAA0000A1Z5' },
            primaryEmail: { type: 'string', format: 'email', example: 'contact@example.com' },
            secondaryEmail: { type: 'string', format: 'email', example: 'support@example.com' },
            primaryPhoneNo: { type: 'string', example: '9876543210' },
            secondaryPhoneNo: { type: 'string', example: '0123456789' },
            addressLine1: { type: 'string', example: '123 Business Street' },
            addressLine2: { type: 'string', example: 'Suite 45' },
            addressLine3: { type: 'string', example: 'Tech Park' },
            city: { type: 'string', example: 'Chennai' },
            state: { type: 'string', example: 'Tamil Nadu' },
            pincode: { type: 'integer', example: 600001 },
            companyType: { type: 'string', example: 'Private Limited' }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const ownerId = request.user.id;

        const companyData = { ...request.body, owner: { connect: { id: ownerId } } };

        const company = await svc.createCompany(fastify.prisma, companyData);

        reply.code(201).send({
          statusCode: 201,
          message: 'Company created successfully',
          data: company
        });
      } catch (error) {
        fastify.log.error(error);

        reply.code(500).send({
          statusCode: 500,
          message: 'Failed to create company',
          error: error.message
        });
      }
    }
  );

  fastify.post(
    '/select-company',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Company'],
        summary: 'Select company for user session',
        body: {
          type: 'object',
          required: ['companyId'],
          properties: {
            companyId: { type: 'integer', example: 1 }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { companyId } = request.body

        if (!companyId) {
          return reply.code(400).send({ statusCode: 400, message: 'companyId is required' })
        }

        const user = await fastify.prisma.user.findUnique({
          where: { id: request.user.id },
          include: { companies: true }
        })

        const newToken = fastify.jwt.sign({
          id: user.id,
          role: user.role,
          companyId
        })

        return reply.code(200).send({
          statusCode: 200,
          message: 'Company selected successfully',
          token: newToken
        })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: 500, message: 'Internal server error' })
      }
    }
  )

  fastify.get(
    '/',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Company'],
        summary: 'List companies',
      }
    },
    async (request, reply) => {
      try {
        const companies = await svc.listCompanies(fastify.prisma, {
          skip: 0,
          take: 50
        });

        return reply.send({
          statusCode: '00',
          data: companies
        });
      } catch (err) {
        request.log.error(err);
        return reply.status(500).send({
          statusCode: '99',
          error: 'Failed to fetch companies'
        });
      }
    }
  );
}