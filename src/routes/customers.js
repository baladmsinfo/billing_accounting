'use strict'
const svc = require('../services/customerService')
module.exports = async function (fastify, opts) {
  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const data = Object.assign({}, request.body, { companyId: request.user.companyId })
    const c = await svc.createCustomer(fastify.prisma, data)
    reply.code(201).send(c)
  })
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const page = Number(request.query.page || 1)
    const take = Number(request.query.take || 20)
    const skip = (page - 1) * take
    return svc.listCustomers(fastify.prisma, request.user.companyId, { skip, take })
  })
}
