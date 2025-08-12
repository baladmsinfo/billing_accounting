'use strict'
const svc = require('../services/stockService')
module.exports = async function (fastify, opts) {
  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = request.body
    // ensure companyId is present for ledger
    body.companyId = request.user.companyId
    const rec = await svc.recordStock(fastify.prisma, body)
    reply.code(201).send(rec)
  })
}
