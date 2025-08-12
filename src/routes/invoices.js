'use strict'
const svc = require('../services/invoiceService')
module.exports = async function (fastify, opts) {
  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const data = Object.assign({}, request.body, { companyId: request.user.companyId })
    const inv = await svc.createInvoice(fastify.prisma, data)
    reply.code(201).send(inv)
  })

  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const inv = await fastify.prisma.invoice.findUnique({ where: { id: request.params.id }, include: { items: true } })
    if (!inv) return reply.code(404).send({ error: 'Not found' })
    return inv
  })
}
