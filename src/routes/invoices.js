'use strict'
const svc = require('../services/invoiceService')
const { CartStatus } = require('@prisma/client')

module.exports = async function (fastify, opts) {
  fastify.post(
    '/',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Invoice'],
        summary: 'Create a new invoice',
        body: {
          type: 'object',
          required: ['customerId', 'date', 'dueDate', 'items'],
          properties: {
            customerId: {
              type: 'string',
              format: 'uuid',
              example: '94a13b76-f6fd-451d-b363-032cc75a08cc'
            },
            invoiceNumber: { type: ['string', 'null'], example: 'INV-1001' },
            date: { type: 'string', format: 'date-time', example: '2025-08-12T00:00:00Z' },
            dueDate: { type: 'string', format: 'date-time', example: '2025-08-22T00:00:00Z' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                required: ['itemId', 'productId', 'quantity', 'price'],
                properties: {
                  itemId: {
                    type: 'string',
                    format: 'uuid',
                    example: '4fbdd51a-0a71-40d5-86c2-5fbbaf9f6d73'
                  },
                  productId: {
                    type: 'string',
                    format: 'uuid',
                    example: '5cd93d96-d943-49f6-b0cd-ff737d361d90'
                  },
                  quantity: { type: 'integer', example: 2 },
                  price: { type: 'number', example: 75000 },
                  taxRateId: {
                    type: ['string', 'null'],
                    format: 'uuid',
                    example: '04f4af96-b1d2-4ef9-9a38-5e2b4196e8a4'
                  }
                }
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { customerId, invoiceNumber, date, dueDate, items } = request.body

        if (!customerId) {
          return reply.code(400).send({
            statusCode: 400,
            message: 'customerId required'
          })
        }

        const invoiceData = {
          invoiceNumber,
          date,
          dueDate,
          items,
          status: 'PENDING',
          companyId: request.user.companyId,
          customerId,
          company: { connect: { id: request.user.companyId } },
          customer: { connect: { id: customerId } }
        }

        const invoice = await svc.createInvoice(fastify.prisma, invoiceData)

        reply.code(201).send({
          statusCode: 201,
          message: 'Invoice created successfully',
          data: invoice
        })
      } catch (error) {
        fastify.log.error(error)
        reply.code(500).send({
          statusCode: 500,
          message: 'Failed to create invoice',
          error: error.message
        })
      }
    }
  )


  fastify.post(
    '/purchase',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Invoice'],
        summary: 'Create a new purchase invoice',
        body: {
          type: 'object',
          required: ['vendorId', 'date', 'dueDate', 'items'],
          properties: {
            vendorId: {
              type: 'string',
              format: 'uuid',
              example: 'f2c23987-7d6e-4e31-95f4-34a15c9098e2'
            },
            invoiceNumber: { type: ['string', 'null'], example: 'PINV-1001' },
            date: { type: 'string', format: 'date-time', example: '2025-08-12T00:00:00Z' },
            dueDate: { type: 'string', format: 'date-time', example: '2025-08-22T00:00:00Z' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                required: ['quantity', 'price'],
                properties: {
                  itemId: { type: ['string', 'null'] },
                  productId: { type: ['string', 'null'] },
                  productData: { type: 'object' },
                  categoryId: { type: ['string', 'null'] },
                  subCategoryId: { type: ['string', 'null'] },
                  quantity: { type: 'integer', example: 10 },
                  sku: { type: 'string', example: 'LAP-001-Blue' },
                  location: { type: 'string', example: 'Warehouse A' },
                  price: { type: 'number', example: 500 },
                  taxRateId: { type: ['string', 'null'] }
                }
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { vendorId, invoiceNumber, date, dueDate, items } = request.body

        const invoiceData = {
          invoiceNumber,
          date,
          dueDate,
          items,
          type: 'PURCHASE',
          status: 'PENDING',
          companyId: request.user.companyId,
          vendorId,
          company: { connect: { id: request.user.companyId } },
          vendor: { connect: { id: vendorId } }
        }

        const invoice = await svc.createPurchaseInvoice(fastify.prisma, invoiceData)

        reply.code(201).send({
          statusCode: 201,
          message: 'Purchase invoice created successfully',
          data: invoice
        })
      } catch (error) {
        fastify.log.error(error)
        reply.code(500).send({
          statusCode: 500,
          message: 'Failed to create purchase invoice',
          error: error.message
        })
      }
    }
  )

  // routes/cart.js
  fastify.post(
    '/:customerId/cart/checkout',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Cart'],
        summary: 'Checkout customer active cart and create an invoice',
        params: {
          type: 'object',
          required: ['customerId'],
          properties: {
            customerId: { type: 'string', example: 'customer-id-uuid' }
          }
        },
        body: {
          type: 'object',
          required: ['invoiceNumber', 'date', 'dueDate'],
          properties: {
            invoiceNumber: { type: 'string', example: 'INV-1005' },
            date: { type: 'string', format: 'date-time', example: '2025-08-21T00:00:00Z' },
            dueDate: { type: 'string', format: 'date-time', example: '2025-08-31T00:00:00Z' }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { customerId } = request.params
        const { invoiceNumber, date, dueDate } = request.body
        const companyId = request.user.companyId

        const cart = await fastify.prisma.cart.findFirst({
          where: { customerId, companyId, status: 'ACTIVE' },
          include: { items: true }
        })

        if (!cart || cart.items.length === 0) {
          return reply.code(400).send({
            statusCode: 400,
            message: 'No active cart or cart is empty'
          })
        }

        const invoiceItems = cart.items.map(ci => ({
          itemId: ci.itemId,
          productId: ci.productId,
          quantity: ci.quantity,
          price: ci.price,
          taxRateId: ci.taxRateId || null
        }))

        const invoiceData = {
          invoiceNumber,
          date,
          dueDate,
          companyId,
          customerId,
          items: invoiceItems
        }

        const invoice = await svc.createInvoice(fastify.prisma, invoiceData)

        await fastify.prisma.cart.update({
          where: { id: cart.id },
          data: { status: CartStatus.CHECKEDOUT }
        })

        reply.code(201).send({
          statusCode: 201,
          message: 'Cart checked out and invoice created successfully',
          data: invoice
        })
      } catch (error) {
        fastify.log.error(error)
        reply.code(500).send({
          statusCode: 500,
          message: 'Failed to checkout cart',
          error: error.message
        })
      }
    }
  )
  fastify.get('/options', {
    preHandler: [fastify.authenticate]
  }, async (req, reply) => {
    console.log("CompantId : ", req.user);

    const companyId = req.user.companyId

    if (!companyId) {
      return reply.code(400).send({
        statusCode: 400,
        message: 'Missing companyId in user context',
      })
    }

    try {
      let customers = []
      let vendors = []
      let products = []
      let taxRates = []

      // --- Fetch Customers ---
      try {
        customers = await fastify.prisma.customer.findMany({
          where: { companyId },
          select: { id: true, name: true, email: true },
        })
      } catch (err) {
        console.error('❌ Failed to fetch customers:', err)
        throw new Error('Failed to fetch customers')
      }

      // --- Fetch Vendors ---
      try {
        vendors = await fastify.prisma.vendor.findMany({
          where: { companyId },
          select: { id: true, name: true, email: true },
        })
      } catch (err) {
        console.error('❌ Failed to fetch vendors:', err)
        throw new Error('Failed to fetch vendors')
      }

      // --- Fetch Products ---
      try {
        products = await fastify.prisma.product.findMany({
          where: { companyId },
          select: { id: true, name: true, sku: true },
        })
      } catch (err) {
        console.error('❌ Failed to fetch products:', err)
        throw new Error('Failed to fetch products')
      }

      // --- Fetch Tax Rates ---
      try {
        taxRates = await fastify.prisma.taxRate.findMany({
          where: { companyId },
          select: { id: true, name: true, rate: true },
        })
      } catch (err) {
        console.error('❌ Failed to fetch tax rates:', err)
        throw new Error('Failed to fetch tax rates')
      }

      // --- Response ---
      return reply.send({
        statusCode: 200,
        data: { customers, vendors, products, taxRates },
      })
    } catch (err) {
      console.error('🔥 Error in /options route:', err.message)
      return reply.code(500).send({
        statusCode: 500,
        message: err.message || 'Failed to fetch options',
      })
    }
  })

  fastify.get('/products-with-items', {
    preHandler: [fastify.authenticate]
  }, async (req, reply) => {
    try {
      const companyId = req.user.companyId

      const products = await fastify.prisma.product.findMany({
        where: { companyId },
        select: {
          id: true,
          name: true,
          sku: true,
          description: true,
          items: {
            select: {
              id: true,
              sku: true,
              price: true,
              quantity: true,
              location: true,
            },
          },
        },
      })

      return reply.send({ statusCode: 200, data: products })
    } catch (err) {
      console.error('Failed to fetch products with items:', err)
      return reply.send({ statusCode: 500, message: 'Failed to fetch products with items' })
    }
  })

  fastify.get(
    '/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Invoice'],
        summary: 'Get invoice by ID',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid', example: 'a1b2c3d4-5678-90ab-cdef-1234567890ab' }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const inv = await fastify.prisma.invoice.findUnique({
          where: { id: request.params.id },
          include: {
            customer: true,
            vendor: true,
            payments: true,
            items: {
              include: { product: true, item: true, taxRate: true }
            }
          }
        })

        if (!inv) {
          return reply.code(404).send({
            statusCode: 404,
            message: 'Invoice not found'
          })
        }

        return reply.code(200).send({
          statusCode: 200,
          message: 'Invoice fetched successfully',
          data: inv
        })
      } catch (error) {
        fastify.log.error(error)
        return reply.code(500).send({
          statusCode: 500,
          message: 'Failed to fetch invoice',
          error: error.message
        })
      }
    }
  )

  fastify.put(
    '/process/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Invoice'],
        summary: 'Update invoice item statuses only',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' }
          }
        },
        body: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                required: ['itemId', 'status'],
                properties: {
                  itemId: { type: 'string', format: 'uuid' },
                  status: { type: 'string', enum: ['ORDERED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'] }
                }
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      const { id } = request.params
      const { items } = request.body

      try {
        const invoice = await fastify.prisma.invoice.findUnique({
          where: { id },
          include: { items: true }
        })

        if (!invoice) {
          return reply.code(404).send({
            statusCode: 404,
            message: 'Invoice not found'
          })
        }

        const updatedItems = await fastify.prisma.$transaction(async (tx) => {
          return Promise.all(
            items.map(async ({ itemId, status }) => {
              const updatedItem = await tx.invoiceItem.update({
                where: { id: itemId },
                data: { status }
              })

              // ✅ If DELIVERED & invoice type = PURCHASE → increase stock
              if (status === 'DELIVERED' && invoice.type === 'PURCHASE') {
                const item = await tx.item.findUnique({ where: { id: updatedItem.itemId } })
                if (!item) throw new Error(`Item not found: ${updatedItem.itemId}`)

                await tx.stockLedger.create({
                  data: {
                    companyId: invoice.companyId,
                    itemId: updatedItem.itemId,
                    type: 'PURCHASE',
                    quantity: updatedItem.quantity,
                    note: `Purchase - invoice ${invoice.invoiceNumber}`
                  }
                })

                await tx.item.update({
                  where: { id: updatedItem.itemId },
                  data: { quantity: item.quantity + updatedItem.quantity }
                })
              }

              return updatedItem
            })
          )
        })

        return reply.code(200).send({
          statusCode: 200,
          message: 'Invoice items updated successfully',
          data: updatedItems
        })
      } catch (error) {
        fastify.log.error(error)
        return reply.code(500).send({
          statusCode: 500,
          message: 'Failed to update invoice items',
          error: error.message
        })
      }
    }
  )

  fastify.delete(
    '/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Invoice'],
        summary: 'Delete invoice by ID',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid', example: 'a1b2c3d4-5678-90ab-cdef-1234567890ab' }
          }
        }
      }
    },
    async (request, reply) => {
      const { id } = request.params

      try {
        const invoice = await fastify.prisma.invoice.findUnique({
          where: { id },
          include: { items: true }
        })

        if (!invoice) {
          return reply.code(404).send({
            statusCode: 404,
            message: 'Invoice not found'
          })
        }

        await fastify.prisma.$transaction(async (tx) => {
          for (const it of invoice.items) {
            const item = await tx.item.findUnique({ where: { id: it.itemId } })
            if (item) {
              await tx.item.update({
                where: { id: it.itemId },
                data: { quantity: item.quantity + it.quantity }
              })

              await tx.stockLedger.create({
                data: {
                  companyId: invoice.companyId,
                  itemId: it.itemId,
                  type: 'SALE_RETURN',
                  quantity: it.quantity,
                  note: `Invoice ${invoice.invoiceNumber} deleted`
                }
              })
            }

            await tx.invoiceItem.delete({ where: { id: it.id } })
          }

          await tx.invoice.delete({ where: { id } })
        })

        return reply.code(200).send({
          statusCode: 200,
          message: 'Invoice deleted successfully'
        })
      } catch (error) {
        fastify.log.error(error)
        return reply.code(500).send({
          statusCode: 500,
          message: 'Failed to delete invoice',
          error: error.message
        })
      }
    }
  )

  fastify.get(
    '/',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Invoice'],
        summary: 'Get company invoices separated by type with optional date and status filters, with pagination',
        querystring: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['PENDING', 'PARTIAL', 'PAYLATER', 'PAID', 'CANCELLED'],
              nullable: true
            },
            from: { type: 'string', format: 'date-time', nullable: true },
            to: { type: 'string', format: 'date-time', nullable: true },
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { status, from, to, page = 1, limit = 10 } = request.query
        const companyId = request.user.companyId

        // Base filters
        const baseFilters = { companyId }
        if (status) baseFilters.status = status
        if (from || to) baseFilters.date = {}
        if (from) baseFilters.date.gte = new Date(from)
        if (to) baseFilters.date.lte = new Date(to)

        const skip = (page - 1) * limit

        // SALE invoices
        const [saleInvoices, saleTotal] = await Promise.all([
          fastify.prisma.invoice.findMany({
            where: { ...baseFilters, type: 'SALE' },
            include: {
              customer: true,
              items: { include: { product: true, taxRate: true } },
              payments: true
            },
            orderBy: { date: 'desc' },
            skip,
            take: limit
          }),
          fastify.prisma.invoice.count({
            where: { ...baseFilters, type: 'SALE' }
          })
        ])

        // PURCHASE invoices
        const [purchaseInvoices, purchaseTotal] = await Promise.all([
          fastify.prisma.invoice.findMany({
            where: { ...baseFilters, type: 'PURCHASE' },
            include: {
              vendor: true,
              items: { include: { product: true, taxRate: true } },
              payments: true
            },
            orderBy: { date: 'desc' },
            skip,
            take: limit
          }),
          fastify.prisma.invoice.count({
            where: { ...baseFilters, type: 'PURCHASE' }
          })
        ])

        reply.code(200).send({
          statusCode: 200,
          message: 'Invoices fetched successfully',
          data: {
            sale: {
              invoices: saleInvoices,
              pagination: {
                total: saleTotal,
                page,
                limit,
                totalPages: Math.ceil(saleTotal / limit)
              }
            },
            purchase: {
              invoices: purchaseInvoices,
              pagination: {
                total: purchaseTotal,
                page,
                limit,
                totalPages: Math.ceil(purchaseTotal / limit)
              }
            }
          }
        })
      } catch (error) {
        fastify.log.error(error)
        reply.code(500).send({
          statusCode: 500,
          message: 'Failed to fetch invoices',
          error: error.message
        })
      }
    }
  )
}