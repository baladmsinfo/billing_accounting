'use strict'
const userService = require('../services/userService')
const { comparePassword } = require('../utils/hash')
module.exports = async function (fastify, opts) {
  fastify.post('/register', async (request, reply) => {
    const body = request.body
    if (!body.email || !body.password || !body.name || !body.companyId) return reply.code(400).send({ error: 'Missing required' })
    const user = await userService.createUser(fastify.prisma, body)
    user.password = undefined
    reply.code(201).send(user)
  })

  fastify.post('/login', async (request, reply) => {
    const { email, password } = request.body
    const user = await userService.findByEmail(fastify.prisma, email)
    if (!user) return reply.code(401).send({ error: 'Invalid credentials' })
    const ok = await comparePassword(password, user.password)
    if (!ok) return reply.code(401).send({ error: 'Invalid credentials' })
    const token = fastify.jwt.sign({ id: user.id, role: user.role, companyId: user.companyId })
    reply.send({ token })
  })

  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const users = await userService.listUsers(fastify.prisma, request.user.companyId, { skip: 0, take: 100 })
    users.forEach(u => { u.password = undefined })
    return users
  })
}
