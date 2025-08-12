'use strict'
const svc = require('../services/companyService')
module.exports = async function (fastify, opts) {
  fastify.post('/', { preHandler: [fastify.authenticate, fastify.authorize(['ADMIN','SUPERADMIN'])] }, async (request, reply) => {
    const c = await svc.createCompany(fastify.prisma, request.body)
    reply.code(201).send(c)
  })
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    return svc.listCompanies(fastify.prisma, { skip: 0, take: 50 })
  })
}
