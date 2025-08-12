'use strict'
require('dotenv').config()
const fastify = require('fastify')({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' }
  }
})

// register common plugins
fastify.register(require('@fastify/helmet'))
fastify.register(require('@fastify/cors'), { origin: true })
fastify.register(require('fastify-rate-limit'), { max: 1000, timeWindow: '1 minute' })

// app plugins
fastify.register(require('./plugins/prisma'))
fastify.register(require('./plugins/auth'))

// routes
fastify.register(require('./routes/users'), { prefix: '/api/users' })
fastify.register(require('./routes/companies'), { prefix: '/api/companies' })
fastify.register(require('./routes/products'), { prefix: '/api/products' })
fastify.register(require('./routes/items'), { prefix: '/api/items' })
fastify.register(require('./routes/customers'), { prefix: '/api/customers' })
fastify.register(require('./routes/invoices'), { prefix: '/api/invoices' })
fastify.register(require('./routes/taxRates'), { prefix: '/api/tax-rates' })
fastify.register(require('./routes/stock'), { prefix: '/api/stock' })

// global error handler
fastify.setErrorHandler((error, request, reply) => {
  request.log.error(error)
  if (error.validation) {
    return reply.status(400).send({ error: 'Validation error', details: error.validation })
  }
  const status = error.statusCode || 500
  reply.status(status).send({ error: error.message || 'Internal Server Error' })
})

const start = async () => {
  try {
    const port = process.env.PORT || 8080
    await fastify.listen({ port, host: '0.0.0.0' })
    fastify.log.info(`Server listening on ${port}`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}
start()
