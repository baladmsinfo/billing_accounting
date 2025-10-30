'use strict'
const userService = require('../services/userService')
const { comparePassword } = require('../utils/hash')
const bcrypt = require('bcrypt');

module.exports = async function (fastify, opts) {

  fastify.post('/register', {
    schema: {
      tags: ['Auth'],
      summary: 'Register a new user',
      body: {
        type: 'object',
        required: ['email', 'password', 'name', 'role'],
        properties: {
          email: { type: 'string', format: 'email', example: 'admin@example.com' },
          password: { type: 'string', example: 'Admin@123' },
          name: { type: 'string', example: 'Admin User' },
          role: { type: 'string', enum: ['ADMIN', 'USER'], example: 'ADMIN' },
          companyId: { type: 'string', nullable: true, example: null },
          company: {
            type: 'object',
            required: ['name', 'primaryPhoneNo', 'companyType', 'currencyId'],
            properties: {
              name: { type: 'string', example: 'My First Company' },
              primaryPhoneNo: { type: 'string', example: '9876543210' },
              companyType: { type: 'string', example: 'Private Limited' },
              primaryEmail: { type: 'string', example: 'company@example.com' },
              city: { type: 'string', example: 'City Name' },
              state: { type: 'string', example: 'State Name' },
              pincode: { type: 'integer', example: 123456 },
              addressLine1: { type: 'string', example: 'Address Line 1' },
              currencyId: { type: 'string', example: 'uuid-of-INR' }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const {
        email,
        password,
        name,
        role,
        companyId = null,
        company: companyData
      } = request.body;

      if (!email || !password || !name) {
        return reply.code(400).send({
          statusCode: 400,
          message: 'Missing required fields'
        });
      }

      const existingUser = await fastify.prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        return reply.code(400).send({
          statusCode: 400,
          message: 'Email already registered'
        });
      }

      let company;

      if (companyId && companyId.trim() !== '') {
        company = await fastify.prisma.company.findUnique({ where: { id: companyId } });

        if (!company) {
          return reply.code(400).send({
            statusCode: 400,
            message: 'Company not found'
          });
        }
      } else {
        if (!companyData || !companyData.currencyId) {
          return reply.code(400).send({
            statusCode: 400,
            message: 'Company data with currencyId is required when companyId is not provided'
          });
        }

        const currency = await fastify.prisma.currency.findUnique({
          where: { id: companyData.currencyId }
        });
        if (!currency) {
          return reply.code(400).send({
            statusCode: 400,
            message: 'Invalid currencyId provided'
          });
        }

        company = await fastify.prisma.company.create({
          data: {
            name: companyData.name,
            primaryPhoneNo: companyData.primaryPhoneNo,
            companyType: companyData.companyType,
            primaryEmail: companyData.primaryEmail || email,
            city: companyData.city || '',
            state: companyData.state || '',
            pincode: companyData.pincode || 0,
            addressLine1: companyData.addressLine1 || '',
            currencyId: companyData.currencyId
          }
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await fastify.prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          role,
          companyId: company.id
        },
        include: { company: true }
      });

      return reply.code(200).send({
        statusCode: 200,
        message: 'User registered successfully',
        data: user
      });

    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({
        statusCode: 500,
        message: 'Internal server error',
        error: err.message
      });
    }
  });

  // Old Register

  // fastify.post('/register', {
  //   schema: {
  //     tags: ['Auth'],
  //     summary: 'Register a new user',
  //     body: {
  //       type: 'object',
  //       required: ['email', 'password', 'name', 'role', 'company'],
  //       properties: {
  //         email: { type: 'string', format: 'email', example: 'admin@example.com' },
  //         password: { type: 'string', example: 'Admin@123' },
  //         name: { type: 'string', example: 'Admin User' },
  //         role: { type: 'string', enum: ['ADMIN', 'USER'], example: 'ADMIN' },
  //         company: {
  //           type: 'object',
  //           required: ['name', 'primaryPhoneNo', 'companyType'],
  //           properties: {
  //             name: { type: 'string', example: 'My First Company' },
  //             primaryPhoneNo: { type: 'string', example: '9876543210' },
  //             companyType: { type: 'string', example: 'Private Limited' }
  //           }
  //         }
  //       },
  //       example: {
  //         email: 'admin@example.com',
  //         password: 'Admin@123',
  //         name: 'Admin User',
  //         role: 'ADMIN',
  //         company: {
  //           name: 'My First Company',
  //           primaryPhoneNo: '9876543210',
  //           companyType: 'Private Limited'
  //         }
  //       }
  //     }
  //   }
  // }, async (request, reply) => {
  //   try {
  //     const body = request.body

  //     if (!body.email || !body.password || !body.name || !body.company) {
  //       return reply.code(400).send({
  //         statusCode: 400,
  //         message: 'Missing required fields'
  //       })
  //     }

  //     const user = await userService.createUser(fastify.prisma, body)

  //     return reply.code(200).send({
  //       statusCode: 200,
  //       message: 'User registered successfully',
  //       data: user
  //     })
  //   } catch (err) {
  //     request.log.error(err)
  //     return reply.code(500).send({
  //       statusCode: 500,
  //       message: 'Internal server error',
  //       error: err.message
  //     })
  //   }
  // })

  // Login
  fastify.post('/login', {
    schema: {
      tags: ['Auth'],
      summary: 'Login user and get JWT token',
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { email, password } = request.body
      const user = await userService.findByEmail(fastify.prisma, email)
      if (!user) return reply.code(401).send({ statusCode: 401, message: 'Invalid credentials' })

      const ok = await comparePassword(password, user.password)
      if (!ok) return reply.code(401).send({ statusCode: 401, message: 'Invalid credentials' })

      const token = fastify.jwt.sign({
        id: user.id,
        role: user.role,
        companyId: user.companyId,
      })

      return reply.code(200).send({
        statusCode: 200,
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          companyId: user.companyId,
        },
      })
    } catch (err) {
      return reply.code(500).send({ statusCode: 500, message: err.message })
    }
  })

  // List Users
  fastify.get('/', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['Auth'],
      summary: 'Get all users',
    }
  }, async (request, reply) => {
    try {
      const users = await userService.listUsers(fastify.prisma, request.user.id, { skip: 0, take: 100 })
      users.forEach(u => { u.password = undefined })

      return reply.code(200).send({
        statusCode: 200,
        message: 'Users fetched successfully',
        data: users
      })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({
        statusCode: 500,
        message: 'Internal server error',
        error: err.message
      })
    }
  })

  // Get current user
  fastify.get('/me', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['Auth'],
      summary: 'Get currently authenticated user',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            statusCode: { type: 'number', example: 200 },
            message: { type: 'string', example: 'User fetched successfully' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                email: { type: 'string' },
                role: { type: 'string' },
                companyId: { type: 'string' },
                company: {
                  type: 'object',
                  nullable: true,
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    primaryPhoneNo: { type: 'string' },
                    companyType: { type: 'string' },
                    primaryEmail: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const user = await fastify.prisma.user.findUnique({
        where: { id: request.user.id },
        include: {
          company: true,
        },
      })

      if (!user) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'User not found',
        })
      }

      user.password = undefined

      return reply.code(200).send({
        statusCode: 200,
        message: 'User fetched successfully',
        user,
      })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({
        statusCode: 500,
        message: 'Internal server error',
        error: err.message,
      })
    }
  })

  // ⚠️ DANGER: Deletes EVERYTHING (no auth). Use only in dev!
  fastify.delete('/delete-all-users', async (request, reply) => {
    try {
      await fastify.prisma.$transaction(async (tx) => {
        // 1) Child-most tables (no FK refs outward)
        await tx.stockLedger.deleteMany({});
        await tx.invoiceItem.deleteMany({});
        await tx.invoiceTax.deleteMany({});
        await tx.payment.deleteMany({});
        await tx.cartItem.deleteMany({});

        // 2) Invoices & carts (depend on company + customer/vendor)
        await tx.invoice.deleteMany({});
        await tx.cart.deleteMany({});
        await tx.journalEntry.deleteMany({});

        // 3) Break self-references (FK loops)
        await tx.account.updateMany({ data: { parentId: null } });
        await tx.category.updateMany({ data: { parentId: null } });

        // 4) Inventory/product trees
        await tx.item.deleteMany({});
        await tx.product.deleteMany({});
        await tx.category.deleteMany({});

        // 5) Company-attached masters
        await tx.taxRate.deleteMany({});
        await tx.customer.deleteMany({});
        await tx.vendor.deleteMany({});
        await tx.branch.deleteMany({});
        await tx.account.deleteMany({});

        // 6) Companies and finally users
        await tx.company.deleteMany({});
        await tx.user.deleteMany({});
      });

      return reply.code(200).send({
        statusCode: '00',
        message: 'All users and related company data deleted successfully'
      });
    } catch (err) {
      request.log.error(err);

      return reply.code(500).send({
        statusCode: '99',
        message: 'Internal server error while deleting users',
        error: err.message
      });
    }
  });
}