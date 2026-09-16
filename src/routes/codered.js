// routes/codered.routes.js
'use strict'

module.exports = async function coderedRoutes(fastify) {
  const prisma = fastify.prisma

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /api/store/products
  // Query params:
  //   page          {number}  – page number (default 1)
  //   take          {number}  – items per page (default 12)
  //   search        {string}  – full-text search on name / description
  //   categoryId    {string}  – filter by parent category UUID
  //   subCategoryId {string}  – filter by sub-category UUID
  //   minPrice      {number}  – minimum item price (inclusive)
  //   maxPrice      {number}  – maximum item price (inclusive)
  // ─────────────────────────────────────────────────────────────────────────────
  
  fastify.get('/products', async (req, reply) => {
    try {
      const page = Math.max(1, Number(req.query.page  || 1))
      const take = Math.max(1, Number(req.query.take  || 12))
      const skip = (page - 1) * take

      const {
        search,
        categoryId,
        subCategoryId,
        minPrice,
        maxPrice,
      } = req.query

      // ── Build Prisma where clause ──────────────────────────────────────────
      const where = {
        companyId: req.companyId,

        // Category filters
        ...(categoryId    ? { categoryId }    : {}),
        ...(subCategoryId ? { subCategoryId } : {}),

        // Full-text search across name and description
        ...(search
          ? {
              OR: [
                { name:        { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),

        // Price range filter via related items
        ...(minPrice || maxPrice
          ? {
              items: {
                some: {
                  ...(minPrice ? { price: { gte: Number(minPrice) } } : {}),
                  ...(maxPrice ? { price: { lte: Number(maxPrice) } } : {}),
                },
              },
            }
          : {}),
      }

      // ── Run queries in parallel ────────────────────────────────────────────
      const [products, total] = await Promise.all([
        prisma.product.findMany({
          where,
          skip,
          take,
          orderBy: { createdAt: 'desc' },
          include: {
            category:    true,
            subCategory: true,
            items: {
              orderBy: { price: 'asc' },   // cheapest variant first
            },
            images: {
              take: 1,                     // only the first image for listing
            },
          },
        }),
        prisma.product.count({ where }),
      ])

      // Attach a convenience `image` field (first image URL) to each product
      const data = products.map((p) => ({
        ...p,
        image: p.images?.[0]?.url ?? null,
      }))

      return reply.code(200).send({
        statusCode: '00',
        message: 'Products fetched successfully',
        data,
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
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /api/store/products/:id
  // Returns a single product with full details (all variants, category, images)
  // ─────────────────────────────────────────────────────────────────────────────
  fastify.get('/products/:id', async (req, reply) => {
    try {
      const product = await prisma.product.findFirst({
        where: {
          id:        req.params.id,
          companyId: req.companyId,
        },
        include: {
          category:    true,
          subCategory: true,
          items: {
            include: { taxRate: true },
            orderBy: { price: 'asc' },
          },
          images: true,
        },
      })

      if (!product) {
        return reply.code(404).send({
          statusCode: '99',
          message: 'Product not found',
        })
      }

      return reply.code(200).send({
        statusCode: '00',
        message: 'Product fetched successfully',
        data: product,
      })
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({
        statusCode: '99',
        message: 'Failed to fetch product',
        error: error.message,
      })
    }
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /api/store/categories
  // Returns flat list of parent categories (parentId = null) with children.
  // Used by the frontend to populate the category filter dropdown.
  // ─────────────────────────────────────────────────────────────────────────────
  fastify.get('/categories', async (req, reply) => {
    try {
      const categories = await prisma.category.findMany({
        where: {
          companyId: req.companyId,
          parentId:  null,            // only top-level categories
        },
        orderBy: { name: 'asc' },
        include: {
          children: {
            orderBy: { name: 'asc' },
          },
          image: true,
        },
      })

      return reply.code(200).send({
        statusCode: '00',
        message: 'Categories fetched successfully',
        data: categories,
      })
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({
        statusCode: '99',
        message: 'Failed to fetch categories',
        error: error.message,
      })
    }
  })
}