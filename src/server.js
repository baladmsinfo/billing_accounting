'use strict'
require('dotenv').config()

const fastify = require('fastify')({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport: process.env.NODE_ENV === 'production'
      ? undefined
      : { target: 'pino-pretty' }
  },
  ajv: {
    customOptions: {
      strict: false,          // disable AJV strict mode
      keywords: ['example']   // allow "example" keyword
    }
  }
})

const rateLimit = require('@fastify/rate-limit')
fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute'
})

// Swagger
fastify.register(require('@fastify/swagger'), {
  openapi: {
    info: {
      title: 'My API Docs',
      description: 'API documentation for my Fastify project',
      version: '1.0.0'
    },
    servers: [{ url: 'http://localhost:8080', description: 'Local server' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    security: [{ bearerAuth: [] }] // apply globally
  }
})

fastify.register(require('@fastify/swagger-ui'), {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'none',
    deepLinking: false
  }
})

// Common plugins
fastify.register(require('@fastify/helmet'))
fastify.register(require('@fastify/cors'), {
  origin: true, 
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
})

// App plugins
fastify.register(require('./plugins/prisma'))
fastify.register(require('./plugins/auth'))

// Routes
fastify.register(require('./routes/users'), { prefix: '/api/users' })
fastify.register(require('./routes/account'), { prefix: '/api/account' })
// fastify.register(require('./routes/companies'), { prefix: '/api/companies' })
fastify.register(require('./routes/categories'), { prefix: '/api/categories' })
fastify.register(require('./routes/products'), { prefix: '/api/products' })
fastify.register(require('./routes/payment'), { prefix: '/api/payments' })
fastify.register(require('./routes/items'), { prefix: '/api/items' })
fastify.register(require('./routes/reports'), { prefix: '/api/reports' })
fastify.register(require('./routes/checkout'), { prefix: '/api/checkout' })
fastify.register(require('./routes/customers'), { prefix: '/api/customers' })
fastify.register(require('./routes/vendor'), { prefix: '/api/vendor' })
fastify.register(require('./routes/dashboard-reports'))
fastify.register(require('./routes/invoices'), { prefix: '/api/invoices' })
fastify.register(require('./routes/taxRates'), { prefix: '/api/tax-rates' })
fastify.register(require('./routes/stock'), { prefix: '/api/stock' })

// Global error handler
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