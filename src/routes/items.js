'use strict'
const svc = require('../services/itemService')
module.exports = async function (fastify, opts) {
  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = Object.assign({}, request.body, { companyId: request.user.companyId })
    const item = await svc.createItem(fastify.prisma, body)
    reply.code(201).send(item)
  })

  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const page = Number(request.query.page || 1)
    const take = Number(request.query.take || 20)
    const skip = (page - 1) * take
    return svc.listItems(fastify.prisma, request.user.companyId, { skip, take })
  })
}
