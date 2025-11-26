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


fastify.register(require("./plugins/env"));

fastify.ready((err) => {
  if (err) throw err;
  console.log("Config loaded:", fastify.config);
});


fastify.after(async () => {

  const multipart = require("@fastify/multipart");

    fastify.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024, // 5 MB
    },
  });


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

  const uploadToSpacesPlugin = require("./plugins/uploadToSpaces");
  fastify.register(uploadToSpacesPlugin);

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

  fastify.addHook("preHandler", async (req, reply) => {
    let publicPaths;
    if (fastify.config.ENV === "development") {
      publicPaths = [
        "/api/users/login",
        "/api/users/send-otp",
        "/api/users/verify-otp",
        "/api/users/register",
      ];
    } else {
      publicPaths = [
        "/api/users/login",
        "/api/users/send-otp",
        "/api/users/forgotpassword",
        "/api/users/setpassword",
        "/api/users/verify-otp",
        "/api/users/register",
        "/images",
      ];
    }

    if (publicPaths.some((path) => req.raw.url.startsWith(path))) {
      return;
    }

    try {
      const apiKey = req.headers["x-api-key"];
      const bearer = req.headers["authorization"]?.split(" ")[1];

      if (apiKey) {
        const company = await fastify.prisma.company.findUnique({
          where: { privateapiKey: apiKey },
          include: {
            users: true,
            currency: true,
          },
        });

        req.log.info(`Accessed ${req.raw.url} using API Key`);

        if (!company) {
          return reply.code(403).send({ error: "Invalid API Key" });
        }

        req.company = company;
        req.companyId = company.id;
        req.role = "ADMIN";
        req.user = null;

        return; 
      }

      if (bearer) {
        try {
          // ✅ JWT logic (User/Admin)
          const decoded = fastify.jwt.verify(bearer);
          console.log(decoded);
          req.user = decoded;
          req.role = decoded.role;

          if (req.role === "ADMIN") {
            req.companyId = decoded.companyId;
          }

          req.log.info(
            `Accessed ${req.raw.url} by ${req.headers["token"] || "MID- " + req.merchantId
            }`
          );

          return;
        } catch (err) {
          return reply.code(401).send({ error: "Invalid token" });
        }
      }
      return reply.code(401).send({
        statusCode: "05",
        message: "Missing Authorization or API Key",
      });
    } catch (err) {
      return reply
        .code(401)
        .send({ statusCode: "05", message: "Unauthorized" });
    }
  });

  // Routes
  fastify.register(require('./routes/users'), { prefix: '/api/users' })
  fastify.register(require('./routes/account'), { prefix: '/api/account' })
  fastify.register(require('./routes/expense'), { prefix: '/api/expenses' })
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
  fastify.register(require('./routes/store'), { prefix: '/api/store' })
  fastify.register(require("./routes/upload"));



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
      const port = fastify.config.PORT || 8081
      const host = fastify.config.host || "0.0.0.0"
      await fastify.listen({ port, host: host })
      fastify.log.info(`Server listening on http://${host}:${port}`)
    } catch (err) {
      fastify.log.error(err)
      process.exit(1)
    }
  }
  start()
})