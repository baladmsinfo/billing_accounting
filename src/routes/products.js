'use strict'
const productSvc = require('../services/productService')
const checkRole = require('../utils/checkRole')

module.exports = async function (fastify, opts) {
  // Create product
  fastify.post(
    '/',
    {
      preHandler: checkRole("ADMIN"),
    },
    async (request, reply) => {
      try {
        const data = { ...request.body, companyId: request.user.companyId }

        const company = await fastify.prisma.company.findUnique({
          where: { id: data.companyId },
          select: { trial: true },
        });

        if (company.trial) {
          const totalProducts = await fastify.prisma.product.count({
            where: { companyId: data.companyId },
          });

          if (totalProducts >= 10) {
            return reply.code(201).send({
              statusCode: "05",
              message: "Trial limit reached. You can only add 10 products. Please Subscribe a plan to add more products.",
            });
          }
        }

        const productData = {
          name: data.name,
          sku: data.sku,
          description: data.description,
          companyId: data.companyId,
          imageUrl: data.imageUrl,
        }

        if (data.categoryId) productData.categoryId = data.categoryId
        if (data.subCategoryId) productData.subCategoryId = data.subCategoryId

        const product = await fastify.prisma.product.create({
          data: productData
        })

        if (data.imageId) {
          await fastify.prisma.images.update({
            where: { id: data.imageId },
            data: { productId: product.id }
          })
        }

        if (Array.isArray(data.imageIds) && data.imageIds.length > 0) {
          await fastify.prisma.images.updateMany({
            where: { id: { in: data.imageIds } },
            data: { productId: product.id }
          })
        }

        if (Array.isArray(data.items) && data.items.length > 0) {
          for (const item of data.items) {
            const createdItem = await fastify.prisma.item.create({
              data: {
                ...item,
                productId: product.id,
                companyId: data.companyId
              }
            })

            if (item.quantity && item.quantity > 0) {
              await fastify.prisma.stockLedger.create({
                data: {
                  itemId: createdItem.id,
                  companyId: data.companyId,
                  type: 'PURCHASE',
                  quantity: item.quantity,
                  note: 'Initial stock on product creation'
                }
              })
            }
          }
        }

        const productWithRelations = await fastify.prisma.product.findUnique({
          where: { id: product.id },
          include: {
            items: true,
            images: true
          }
        })

        return reply.code(201).send({
          statusCode: '00',
          message: 'Product created successfully',
          data: productWithRelations
        })

      } catch (error) {
        fastify.log.error(error)
        return reply.code(500).send({
          statusCode: '99',
          message: 'Failed to create product',
          error: error.message
        })
      }
    }
  )

  // List products
  fastify.get(
    '/',
    {
      preHandler: checkRole("ADMIN"),
      schema: {
        tags: ['Product'],
        description: 'List products with pagination',
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', example: 1 },
            take: { type: 'integer', example: 20 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const page = Number(request.query.page || 1)
        const take = Number(request.query.take || 20)
        const skip = (page - 1) * take

        // fetch products (with items)
        const [products, total] = await Promise.all([
          productSvc.listProducts(fastify.prisma, request.user.companyId, { skip, take }),
          fastify.prisma.product.count({
            where: { companyId: request.user.companyId },
          }),
        ])

        return reply.code(200).send({
          statusCode: '00',
          message: 'Products fetched successfully',
          data: products,
          pagination: { page, take, total },
        })
      } catch (error) {
        fastify.log.error(error)
        return reply.code(500).send({
          statusCode: '99',
          message: 'Failed to fetch products',
          error: error.message,
        })
      }
    }
  )

  // Get category and sub-category

  fastify.get(
    '/category/subcategory',
    {
      preHandler: checkRole("ADMIN"),
      schema: {
        tags: ['Category'],
        description: 'Fetch all categories and subcategories for the current company'
      }
    },
    async (request, reply) => {
      try {
        const companyId = request.user.companyId

        const categories = await fastify.prisma.category.findMany({
          where: { companyId, parentId: null },
          include: {
            children: true // Subcategories
          },
          orderBy: { name: 'asc' }
        })

        return reply.code(200).send({
          statusCode: '00',
          message: 'Categories fetched successfully',
          data: categories
        })
      } catch (error) {
        fastify.log.error(error)
        return reply.code(500).send({
          statusCode: '99',
          message: 'Failed to fetch categories',
          error: error.message
        })
      }
    }
  )

  // Get product by ID
  fastify.get(
    '/:id',
    {
      preHandler: checkRole("ADMIN"),
      schema: {
        tags: ['Product'],
        description: 'Get product by ID including items',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', example: 'clxyz12345' }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { id } = request.params
        const product = await fastify.prisma.product.findUnique({
          where: { id },
          include: { items: true }
        })

        if (!product) {
          return reply.code(404).send({
            statusCode: '01',
            message: 'Product not found'
          })
        }

        return reply.code(200).send({
          statusCode: '00',
          message: 'Product fetched successfully',
          data: product
        })
      } catch (error) {
        fastify.log.error(error)
        return reply.code(500).send({
          statusCode: '99',
          message: 'Failed to fetch product',
          error: error.message
        })
      }
    }
  )

  // Update product

  fastify.put(
    '/:id',
    {
      preHandler: checkRole("ADMIN"),
      schema: {
        tags: ['Product'],
        description: 'Update product and items (add/update items and stock)',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', example: 'clxyz12345' }
          }
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', example: 'Updated Laptop' },
            sku: { type: 'string', example: 'LAP-001' },
            description: { type: 'string', example: 'Updated description' },
            categoryId: { type: 'string', example: null },
            subCategoryId: { type: 'string', example: null },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', example: 'itm12345' }, // optional for new items
                  sku: { type: 'string', example: 'LAP-001-RED' },
                  price: { type: 'number', example: 77000 },
                  quantity: { type: 'integer', example: 60 },
                  location: { type: 'string', example: 'Warehouse A' }
                }
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { id } = request.params
        const { items, ...productData } = request.body
        const companyId = request.user.companyId

        // Check if product exists
        const product = await fastify.prisma.product.findUnique({
          where: { id },
          include: { items: true }
        })

        if (!product) {
          return reply.code(404).send({
            statusCode: '01',
            message: 'Product not found'
          })
        }

        // Update product fields
        if (productData.categoryId !== undefined) product.categoryId = productData.categoryId
        if (productData.subCategoryId !== undefined) product.subCategoryId = productData.subCategoryId

        await fastify.prisma.product.update({
          where: { id },
          data: productData
        })

        // Update existing items and add new ones
        if (Array.isArray(items)) {
          for (const item of items) {
            if (item.id) {
              // Existing item: update
              const existingItem = product.items.find(i => i.id === item.id)
              if (existingItem) {
                const quantityDiff = item.quantity - existingItem.quantity

                await fastify.prisma.item.update({
                  where: { id: item.id },
                  data: {
                    sku: item.sku,
                    price: item.price,
                    quantity: item.quantity,
                    location: item.location
                  }
                })

                if (quantityDiff !== 0) {
                  await fastify.prisma.stockLedger.create({
                    data: {
                      companyId,
                      itemId: existingItem.id,
                      type: quantityDiff > 0 ? 'PURCHASE' : 'ADJUSTMENT',
                      quantity: Math.abs(quantityDiff),
                      note: 'Stock updated via product update'
                    }
                  })
                }
              }
            } else {
              // New item: create
              const newItem = await fastify.prisma.item.create({
                data: {
                  ...item,
                  productId: product.id,
                  companyId
                }
              })

              if (item.quantity && item.quantity > 0) {
                await fastify.prisma.stockLedger.create({
                  data: {
                    itemId: newItem.id,
                    companyId,
                    type: 'PURCHASE',
                    quantity: item.quantity,
                    note: 'Initial stock for new item'
                  }
                })
              }
            }
          }
        }

        const updatedProduct = await fastify.prisma.product.findUnique({
          where: { id },
          include: { items: true }
        })

        return reply.code(200).send({
          statusCode: '00',
          message: 'Product & items updated successfully',
          data: updatedProduct
        })
      } catch (error) {
        fastify.log.error(error)
        return reply.code(500).send({
          statusCode: '99',
          message: 'Failed to update product',
          error: error.message
        })
      }
    }
  )

  fastify.post(
    '/:productId/items',
    {
      preHandler: checkRole("ADMIN"),
    },
    async (request, reply) => {
      try {
        const { productId } = request.params
        const { sku, price, taxrate, quantity, location } = request.body
        const companyId = request.user.companyId

        const product = await fastify.prisma.product.findFirst({
          where: { id: productId, companyId }
        })

        if (!product) {
          return reply.code(404).send({
            statusCode: '01',
            message: 'Product not found'
          })
        }

        let tax = null

        if (taxrate) {
          tax = await fastify.prisma.taxRate.findFirst({
            where: {
              id: taxrate,
              companyId
            }
          })

          if (!tax) {
            return reply.code(400).send({
              statusCode: '01',
              message: `Invalid taxrateId: ${taxrate}`
            })
          }
        }

        const itemData = {
          sku,
          price,
          quantity,
          location,
          companyId,
          productId
        }

        if (taxrate && tax) {
          itemData.taxRates = {
            connect: { id: taxrate }
          }
        }

        const newItem = await fastify.prisma.item.create({ data: itemData })

        if (quantity > 0) {
          await fastify.prisma.stockLedger.create({
            data: {
              itemId: newItem.id,
              companyId,
              type: 'PURCHASE',
              quantity,
              note: 'New item added to product'
            }
          })
        }

        const updatedProduct = await fastify.prisma.product.findUnique({
          where: { id: productId },
          include: { items: true }
        })

        return reply.code(201).send({
          statusCode: '00',
          message: 'Item added successfully',
          data: updatedProduct
        })

      } catch (error) {
        fastify.log.error(error)
        return reply.code(500).send({
          statusCode: '99',
          message: 'Failed to add item',
          error: error.message
        })
      }
    }
  )


  fastify.put(
    '/item/:itemId/price',
    {
      preHandler: checkRole("ADMIN"),
    },
    async (request, reply) => {
      try {
        const { itemId } = request.params
        const { price, MRP } = request.body
        const companyId = request.user.companyId

        const existing = await fastify.prisma.item.findFirst({
          where: { id: itemId, companyId }
        })

        if (!existing) {
          return reply.code(404).send({
            statusCode: '01',
            message: 'Item not found'
          })
        }

        const updated = await fastify.prisma.item.update({
          where: { id: itemId },
          data: {
            price,
            MRP,
          }
        })

        return reply.code(200).send({
          statusCode: '00',
          message: 'Item price updated successfully',
          data: updated
        })
      } catch (error) {
        fastify.log.error(error)
        return reply.code(500).send({
          statusCode: '99',
          message: 'Failed to update item price',
          error: error.message
        })
      }
    }
  )

  // Delete product
  fastify.delete(
    '/:id',
    {
      preHandler: checkRole("ADMIN"),
      schema: {
        tags: ['Product'],
        description: 'Delete a product by ID',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', example: 'clxyz12345' }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { id } = request.params

        const product = await fastify.prisma.product.findUnique({ where: { id } })
        if (!product) {
          return reply.code(404).send({
            statusCode: '01',
            message: 'Product not found'
          })
        }

        await fastify.prisma.product.delete({ where: { id } })

        return reply.code(200).send({
          statusCode: '00',
          message: 'Product deleted successfully'
        })
      } catch (error) {
        fastify.log.error(error)
        return reply.code(500).send({
          statusCode: '99',
          message: 'Failed to delete product',
          error: error.message
        })
      }
    }
  )
}