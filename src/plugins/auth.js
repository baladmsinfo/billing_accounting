'use strict'
const fp = require('fastify-plugin')

async function authPlugin(fastify, opts) {
  fastify.register(require('@fastify/jwt'), { secret: process.env.JWT_SECRET || 'please-change-me' })

  fastify.decorate('authenticate', async function (request, reply) {
    try {
      await request.jwtVerify()
    } catch (err) {
      reply.code(401).send({ error: 'Unauthorized' })
    }
  })

  // role based helper
  fastify.decorate('authorize', (roles = []) => async (request, reply) => {
    if (!request.user || (roles.length && !roles.includes(request.user.role))) {
      return reply.code(403).send({ error: 'Forbidden' })
    }
  })
}
module.exports = fp(authPlugin)
