'use strict'
const svc = require('../services/taxRateService')
module.exports = async function (fastify, opts) {
  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const data = Object.assign({}, request.body, { companyId: request.user.companyId })
    const r = await svc.createTaxRate(fastify.prisma, data)
    reply.code(201).send(r)
  })
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    return svc.listTaxRates(fastify.prisma, request.user.companyId)
  })
}
