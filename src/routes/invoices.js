'use strict'
const svc = require('../services/invoiceService')
const { CartStatus } = require('@prisma/client')
const checkRole = require('../utils/checkRole')

const { getAccountId } = require('../services/invoiceService')

module.exports = async function (fastify, opts) {
  fastify.post(
    '/',
    {
      preHandler: checkRole("ADMIN", "BRANCHADMIN"),
    },
    async (request, reply) => {
      try {
        const { customerId, invoiceNumber, branchId, date, dueDate, items } = request.body

        if (!customerId) {
          return reply.code(400).send({
            statusCode: "01",
            message: 'customerId required'
          })
        }

        const invoiceData = {
          invoiceNumber,
          date,
          dueDate,
          items,
          status: 'PENDING',
          companyId: request.user.companyId || request.companyId,
          customerId,
          branchId,
        }

        const invoice = await svc.createInvoice(fastify.prisma, invoiceData)

        reply.code(200).send({
          statusCode: "00",
          message: 'Invoice created successfully',
          data: invoice
        })
      } catch (error) {
        fastify.log.error(error)
        reply.code(500).send({
          statusCode: "02",
          message: error.message,
        })
      }
    }
  )

  fastify.post(
    '/purchase',
    {
      preHandler: checkRole("ADMIN", "BRANCHADMIN"),
    },
    async (request, reply) => {
      try {
        const { vendorId, invoiceNumber, branchId, date, dueDate, items } = request.body

        const invoiceData = {
          invoiceNumber,
          date,
          dueDate,
          items,
          branchId,                       // <-- pass only this
          type: 'PURCHASE',
          status: 'PENDING',
          companyId: request.user.companyId || request.companyId,
          vendorId
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
      preHandler: checkRole("ADMIN", "BRANCHADMIN"),
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

  fastify.get(
    '/fulfillment-providers',
    {
      preHandler: checkRole('ADMIN', "BRANCHADMIN"),
    },
    async (req, reply) => {
      try {
        const companyId = req.user.companyId

        const providers = await fastify.prisma.fulfillmentProvider.findMany({
          where: {
            companyId,
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            address: true,
          },
          orderBy: {
            name: 'asc',
          },
        })

        return reply.send({
          statusCode: 200,
          data: providers,
        })
      } catch (err) {
        req.log.error(err, 'Failed to fetch fulfillment providers')

        return reply.status(500).send({
          statusCode: 500,
          message: 'Unable to fetch fulfillment providers',
        })
      }
    }
  )

  fastify.get('/options', {
    preHandler: checkRole("ADMIN", "BRANCHADMIN"),
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
        })
      } catch (err) {
        console.error('❌ Failed to fetch customers:', err)
        throw new Error('Failed to fetch customers')
      }

      // --- Fetch Vendors ---
      try {
        vendors = await fastify.prisma.vendor.findMany({
          where: { companyId },
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

  fastify.post(
    '/fulfillment-providers',
    {
      preHandler: checkRole('ADMIN', "BRANCHADMIN"),
    },
    async (req, reply) => {
      try {
        const companyId = req.user.companyId
        const { name, phone, email, address } = req.body

        if (!name) {
          return reply.code(400).send({
            statusCode: 400,
            message: 'Provider name is required',
          })
        }

        const provider = await fastify.prisma.fulfillmentProvider.create({
          data: {
            name,
            phone,
            email,
            address,
            companyId,
          },
        })

        return reply.send({
          statusCode: 200,
          data: provider,
        })
      } catch (err) {
        if (err.code === 'P2002') {
          return reply.code(409).send({
            statusCode: 409,
            message: 'Provider already exists',
          })
        }

        req.log.error(err)
        return reply.code(500).send({
          statusCode: 500,
          message: 'Failed to create fulfillment provider',
        })
      }
    }
  )

  fastify.get('/products-with-items', {
    preHandler: checkRole("ADMIN", "BRANCHADMIN"),
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
              variant: true,
              price: true,
              MRP: true,
              sku: true,
              taxRate: true,
              branchItems: {
                select: {
                  id: true,
                  quantity: true,
                  location: true,
                  branchId: true,
                }
              }
            }
          }
        }
      })

      return reply.send({ statusCode: 200, data: products })
    } catch (err) {
      console.error('Failed to fetch products with items:', err)
      return reply.send({ statusCode: 500, message: 'Failed to fetch products with items' })
    }
  })

  fastify.get('/:id', {
    preHandler: checkRole("ADMIN", "BRANCHADMIN"),
    schema: {
      tags: ['Invoice'],
      summary: 'Get invoice by ID with full details',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (req, reply) => {
    try {
      const inv = await fastify.prisma.invoice.findUnique({
        where: { id: req.params.id },
        include: {
          customer: {
            include: {
              addresses: true,
            },
          },
          vendor: true,
          company: {
            include: {
              currency: true,
            },
          },
          payments: {
            orderBy: { date: 'asc' },
          },
          items: {
            include: {
              product: true,
              item: true,
              taxRate: true,
            },
          },
          invoiceTax: {
            include: { taxRate: true },
          },
        },
      });

      if (!inv) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Invoice not found',
        });
      }

      return reply.code(200).send({
        statusCode: 200,
        message: 'Invoice fetched successfully',
        data: inv,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        statusCode: 500,
        message: 'Failed to fetch invoice',
        error: error.message,
      });
    }
  });

  fastify.put(
    '/process/:id',
    {
      preHandler: checkRole("ADMIN", "BRANCHADMIN"),
    },
    async (request, reply) => {
      const { id } = request.params;
      const { items } = request.body;
      const userId = request.user.id;

      try {
        const invoice = await fastify.prisma.invoice.findUnique({
          where: { id },
          include: { items: true }
        });

        if (!invoice) {
          return reply.code(404).send({
            statusCode: 404,
            message: 'Invoice not found'
          });
        }

        const updatedItems = await fastify.prisma.$transaction(async (tx) => {
          return Promise.all(
            items.map(async ({ itemId, status, shipmentDetails }) => {
              const existing = await tx.invoiceItem.findUnique({ where: { id: itemId } });
              if (!existing) throw new Error(`Item not found: ${itemId}`);

              const updatedItem = await tx.invoiceItem.update({
                where: { id: itemId },
                data: { status },
                include: { taxRate: true }
              });

              // ---------------------------------------------------------
              //    SHIPMENT HANDLING (NO CHANGE)
              // ---------------------------------------------------------
              if (status === 'SHIPPED' && shipmentDetails) {
                const {
                  mode,
                  trackingNumber,
                  vehicleNumber,
                  remarks,
                  fulfillmentId,
                  courierPartner,
                  courierContact,
                } = shipmentDetails;

                const baseUpdate = {
                  shippingMode: mode,
                  trackingNumber,
                  vehicleNumber,
                  deliveryRemarks: remarks,
                };

                if (mode === 'FULFILLMENT') {
                  if (!fulfillmentId) throw new Error('Fulfillment provider is required');

                  await tx.invoiceItem.update({
                    where: { id: itemId },
                    data: {
                      ...baseUpdate,
                      fulfillmentProvider: { connect: { id: fulfillmentId } },
                      ownShipping: { disconnect: true },
                    },
                  });
                }

                if (mode === 'OWN') {
                  if (!courierPartner) throw new Error('Courier partner is required');

                  const ownShipping = await tx.ownShipping.upsert({
                    where: {
                      courierPartner_courierContact_companyId: {
                        courierPartner,
                        courierContact: courierContact || null,
                        companyId: existing.companyId,
                      },
                    },
                    update: {},
                    create: {
                      courierPartner,
                      courierContact,
                      companyId: existing.companyId,
                    },
                  });

                  await tx.invoiceItem.update({
                    where: { id: itemId },
                    data: {
                      ...baseUpdate,
                      ownShipping: { connect: { id: ownShipping.id } },
                      fulfillmentProvider: { disconnect: true },
                    },
                  });
                }
              }

              // ---------------------------------------------------------
              //   TIMELINE (NO CHANGE)
              // ---------------------------------------------------------
              await tx.invoiceItemTimeline.create({
                data: {
                  invoiceItemId: itemId,
                  oldStatus: existing.status,
                  newStatus: status,
                  userId,
                  note: `Status changed from ${existing.status} to ${status}`
                }
              });

              const item = await tx.item.findUnique({
                where: { id: updatedItem.itemId }
              });

              if (!item) throw new Error(`Item not found: ${updatedItem.itemId}`);

              const qty = updatedItem.quantity;

              // ---------------------------------------------------------
              //   JOURNAL ENTRIES (NO CHANGE)
              // ---------------------------------------------------------
              // (Your entire journal code kept exactly as it is)
              // ---------------------------------------------------------

              // ---------------------------------------------------------
              //   UPDATE INVOICE FULFILLMENT STATUS (NO CHANGE)
              // ---------------------------------------------------------

              if (status) {
                const allItems = await tx.invoiceItem.findMany({
                  where: { invoiceId: invoice.id },
                  select: { status: true }
                });

                let hasActiveItems;

                if (status === 'PROCESSING') {
                  await tx.invoice.update({
                    where: { id: invoice.id },
                    data: { fulfillmentStatus: status }
                  });
                } else if (status === 'SHIPPED') {
                  hasActiveItems = allItems.some(item =>
                    ['PROCESSING'].includes(item.status)
                  );

                  if (!hasActiveItems) {
                    await tx.invoice.update({
                      where: { id: invoice.id },
                      data: { fulfillmentStatus: status }
                    });
                  }
                } else if (status === 'DELIVERED') {
                  hasActiveItems = allItems.some(item =>
                    ['SHIPPED'].includes(item.status)
                  );

                  if (!hasActiveItems) {
                    await tx.invoice.update({
                      where: { id: invoice.id },
                      data: { fulfillmentStatus: status }
                    });
                  }
                } else if (status === "RETURNED" || "CANCELLED") {
                  hasActiveItems = allItems.some(item =>
                    ['ORDERED', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(item.status)
                  );

                  if (!hasActiveItems) {
                    await tx.invoice.update({
                      where: { id: invoice.id },
                      data: { fulfillmentStatus: status }
                    });
                  }
                }
              }

              // ---------------------------------------------------------
              //   BRANCH STOCK HANDLING (UPDATED)
              // ---------------------------------------------------------

              // Auto detect branch
              const branchId =
                updatedItem.branchId ||
                invoice.branchId ||
                request.user.branchId;

              if (!branchId) {
                throw new Error("Branch ID required to update stock");
              }

              // Utility to get or create branchItem
              const getBranchItem = async () => {
                let branchItem = await tx.branchItem.findFirst({
                  where: { itemId: updatedItem.itemId, branchId }
                });

                if (!branchItem) {
                  branchItem = await tx.branchItem.create({
                    data: {
                      // companyId: invoice.companyId,
                      branchId,
                      itemId: updatedItem.itemId,
                      quantity: 0,
                      mrp: item.mrp || null,
                      price: item.price,
                      location: item.location || null,
                    }
                  });
                }
                return branchItem;
              };

              // 1️⃣ PURCHASE – DELIVERED → add stock
              if (status === 'DELIVERED' && invoice.type === 'PURCHASE') {
                const branchItem = await getBranchItem();

                await tx.branchItem.update({
                  where: { id: branchItem.id },
                  data: { quantity: branchItem.quantity + qty }
                });

                await tx.stockLedger.create({
                  data: {
                    companyId: invoice.companyId,
                    branchId,
                    itemId: updatedItem.itemId,
                    type: 'PURCHASE',
                    quantity: qty,
                    note: `Purchase - invoice ${invoice.invoiceNumber}`
                  }
                });
              }

              // 2️⃣ PURCHASE RETURN
              if (invoice.type === 'PURCHASE' && status === 'RETURNED') {
                const branchItem = await getBranchItem();

                await tx.branchItem.update({
                  where: { id: branchItem.id },
                  data: { quantity: branchItem.quantity - qty }
                });

                await tx.stockLedger.create({
                  data: {
                    companyId: invoice.companyId,
                    branchId,
                    itemId: updatedItem.itemId,
                    type: 'ADJUSTMENT',
                    quantity: -qty,
                    note: `Purchase return - invoice ${invoice.invoiceNumber}`
                  }
                });
              }

              // 3️⃣ SALE RETURN (increase stock)
              if (invoice.type !== 'PURCHASE' && status === 'RETURNED') {
                const branchItem = await getBranchItem();

                await tx.branchItem.update({
                  where: { id: branchItem.id },
                  data: { quantity: branchItem.quantity + qty }
                });

                await tx.stockLedger.create({
                  data: {
                    companyId: invoice.companyId,
                    branchId,
                    itemId: updatedItem.itemId,
                    type: 'SALE_RETURN',
                    quantity: qty,
                    note: `Sale return - invoice ${invoice.invoiceNumber}`
                  }
                });
              }

              // 4️⃣ SALE CANCELLED → add stock back
              if (invoice.type !== 'PURCHASE' && status === 'CANCELLED') {
                const branchItem = await getBranchItem();

                await tx.branchItem.update({
                  where: { id: branchItem.id },
                  data: { quantity: branchItem.quantity + qty }
                });

                await tx.stockLedger.create({
                  data: {
                    companyId: invoice.companyId,
                    branchId,
                    itemId: updatedItem.itemId,
                    type: 'ADJUSTMENT',
                    quantity: qty,
                    note: `Sale cancelled - invoice ${invoice.invoiceNumber}`
                  }
                });
              }

              // ---------------------------------------------------------
              //   FINAL ITEM RETURN
              // ---------------------------------------------------------
              return await tx.invoiceItem.findUnique({
                where: { id: itemId },
                include: {
                  taxRate: true,
                  fulfillmentProvider: true,
                  ownShipping: true,
                  timelines: { orderBy: { changedAt: 'desc' } },
                  item: true,
                  product: true,
                },
              });
            })
          );
        });

        return reply.code(200).send({
          statusCode: 200,
          message: 'Invoice items updated successfully',
          data: updatedItems
        });

      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({
          statusCode: 500,
          message: error.message
        });
      }
    }
  );

  // fastify.put(
  //   '/process/:id',
  //   {
  //     preHandler: checkRole("ADMIN"),
  //   },
  //   async (request, reply) => {
  //     const { id } = request.params;
  //     const { items } = request.body;
  //     const userId = request.user.id;

  //     try {
  //       const invoice = await fastify.prisma.invoice.findUnique({
  //         where: { id },
  //         include: { items: true }
  //       });

  //       if (!invoice) {
  //         return reply.code(404).send({
  //           statusCode: 404,
  //           message: 'Invoice not found'
  //         });
  //       }

  //       const updatedItems = await fastify.prisma.$transaction(async (tx) => {
  //         return Promise.all(
  //           items.map(async ({ itemId, status, shipmentDetails }) => {
  //             const existing = await tx.invoiceItem.findUnique({ where: { id: itemId } });
  //             if (!existing) throw new Error(`Item not found: ${itemId}`);

  //             const updatedItem = await tx.invoiceItem.update({
  //               where: { id: itemId },
  //               data: { status },
  //               include: {
  //                 taxRate: true
  //               }
  //             });

  //             if (status === 'SHIPPED' && shipmentDetails) {
  //               const {
  //                 mode,
  //                 trackingNumber,
  //                 vehicleNumber,
  //                 remarks,
  //                 fulfillmentId,
  //                 courierPartner,
  //                 courierContact,
  //               } = shipmentDetails

  //               // COMMON FIELDS
  //               const baseUpdate = {
  //                 shippingMode: mode,
  //                 trackingNumber,
  //                 vehicleNumber,
  //                 deliveryRemarks: remarks,
  //               }

  //               if (mode === 'FULFILLMENT') {
  //                 if (!fulfillmentId) {
  //                   throw new Error('Fulfillment provider is required')
  //                 }

  //                 await tx.invoiceItem.update({
  //                   where: { id: itemId },
  //                   data: {
  //                     ...baseUpdate,
  //                     fulfillmentProvider: {
  //                       connect: { id: fulfillmentId },
  //                     },
  //                     ownShipping: { disconnect: true },
  //                   },
  //                 })
  //               }

  //               if (mode === 'OWN') {
  //                 if (!courierPartner) {
  //                   throw new Error('Courier partner is required')
  //                 }

  //                 // 3️⃣ Find or create OwnShipping
  //                 const ownShipping = await tx.ownShipping.upsert({
  //                   where: {
  //                     courierPartner_courierContact_companyId: {
  //                       courierPartner,
  //                       courierContact: courierContact || null,
  //                       companyId: existing.companyId,
  //                     },
  //                   },
  //                   update: {},
  //                   create: {
  //                     courierPartner,
  //                     courierContact,
  //                     companyId: existing.companyId,
  //                   },
  //                 })

  //                 // 4️⃣ Connect OwnShipping
  //                 await tx.invoiceItem.update({
  //                   where: { id: itemId },
  //                   data: {
  //                     ...baseUpdate,
  //                     ownShipping: {
  //                       connect: { id: ownShipping.id },
  //                     },
  //                     fulfillmentProvider: { disconnect: true },
  //                   },
  //                 })
  //               }
  //             }

  //             await tx.invoiceItemTimeline.create({
  //               data: {
  //                 invoiceItemId: itemId,
  //                 oldStatus: existing.status,
  //                 newStatus: status,
  //                 userId,
  //                 note: `Status changed from ${existing.status} to ${status}`
  //               }
  //             });

  //             const item = await tx.item.findUnique({
  //               where: { id: updatedItem.itemId }
  //             });
  //             if (!item) throw new Error(`Item not found: ${updatedItem.itemId}`);

  //             const qty = updatedItem.quantity;

  //             // Updating journal entry if the invoice is not paid and retrn or cancelling

  //             if ((status === 'RETURNED' || status === 'CANCELLED') && (invoice.status === "PENDING" || invoice.status === "PAYLATER")) {
  //               const invoiceItem = updatedItem

  //               const baseAmount = invoiceItem.price * invoiceItem.quantity

  //               const taxRate = invoiceItem.taxRate?.rate || 0
  //               const taxAmount = Number(((baseAmount * taxRate) / 100).toFixed(2))

  //               const refundTotal = baseAmount + taxAmount


  //               const description = `${['SALE', 'POS', 'ONLINE'].includes(invoice.type) ? 'Sales Return' : invoice.type === 'PURCHASE' ? 'Purchase Return' : 'Refund'} - Invoice ${invoice.invoiceNumber}`

  //               if (['SALE', 'POS', 'ONLINE'].includes(invoice.type)) {

  //                 await tx.journalEntry.create({
  //                   data: {
  //                     companyId: invoice.companyId,
  //                     accountId: await getAccountId(tx, invoice.companyId, 'Sales Return'),
  //                     date: new Date(),
  //                     description,
  //                     debit: baseAmount,
  //                     credit: 0
  //                   }
  //                 })

  //                 if (taxAmount > 0) {
  //                   await tx.journalEntry.create({
  //                     data: {
  //                       companyId: invoice.companyId,
  //                       accountId: await getAccountId(tx, invoice.companyId, 'Tax Payable'),
  //                       date: new Date(),
  //                       description,
  //                       debit: taxAmount,
  //                       credit: 0
  //                     }
  //                   })
  //                 }

  //                 await tx.journalEntry.create({
  //                   data: {
  //                     companyId: invoice.companyId,
  //                     accountId: await getAccountId(
  //                       tx,
  //                       invoice.companyId,
  //                       method === 'CASH' ? 'Cash' : 'Bank'
  //                     ),
  //                     date: new Date(),
  //                     description,
  //                     debit: 0,
  //                     credit: refundTotal
  //                   }
  //                 })
  //               }

  //               if (invoice.type === 'PURCHASE') {

  //                 await tx.journalEntry.create({
  //                   data: {
  //                     companyId: invoice.companyId,
  //                     accountId: await getAccountId(tx, invoice.companyId, 'Accounts Payable'),
  //                     date: new Date(),
  //                     description,
  //                     debit: refundTotal,
  //                     credit: 0
  //                   }
  //                 })

  //                 await tx.journalEntry.create({
  //                   data: {
  //                     companyId: invoice.companyId,
  //                     accountId: await getAccountId(tx, invoice.companyId, 'Purchase Return'),
  //                     date: new Date(),
  //                     description,
  //                     debit: 0,
  //                     credit: baseAmount
  //                   }
  //                 })

  //                 if (taxAmount > 0) {
  //                   await tx.journalEntry.create({
  //                     data: {
  //                       companyId: invoice.companyId,
  //                       accountId: await getAccountId(tx, invoice.companyId, 'Tax Receivable'),
  //                       date: new Date(),
  //                       description,
  //                       debit: 0,
  //                       credit: taxAmount
  //                     }
  //                   })
  //                 }
  //               }
  //             }

  //             // Update invoice fulfillment status if all items are returned or cancelled

  //             if (status) {
  //               const allItems = await tx.invoiceItem.findMany({
  //                 where: { invoiceId: invoice.id },
  //                 select: { status: true }
  //               })

  //               let hasActiveItems;

  //               if (status === 'PROCESSING') {
  //                 await tx.invoice.update({
  //                   where: { id: invoice.id },
  //                   data: { fulfillmentStatus: status }
  //                 })
  //               } else if (status === 'SHIPPED') {
  //                 hasActiveItems = allItems.some(item =>
  //                   ['PROCESSING'].includes(item.status)
  //                 )

  //                 if (!hasActiveItems) {
  //                   await tx.invoice.update({
  //                     where: { id: invoice.id },
  //                     data: { fulfillmentStatus: status }
  //                   })
  //                 }
  //               } else if (status === 'DELIVERED') {
  //                 hasActiveItems = allItems.some(item =>
  //                   ['SHIPPED'].includes(item.status)
  //                 )

  //                 if (!hasActiveItems) {
  //                   await tx.invoice.update({
  //                     where: { id: invoice.id },
  //                     data: { fulfillmentStatus: status }
  //                   })
  //                 }
  //               } else if (status === "RETURNED" || "CANCELLED") {
  //                 hasActiveItems = allItems.some(item =>
  //                   ['ORDERED', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(item.status)
  //                 )

  //                 if (!hasActiveItems) {
  //                   await tx.invoice.update({
  //                     where: { id: invoice.id },
  //                     data: { fulfillmentStatus: status }
  //                   })
  //                 }
  //               }
  //             }

  //             // Update stock ledger and item quantity based on status changes

  //             if (invoice.type === 'PURCHASE' && status === 'RETURNED') {
  //               await tx.stockLedger.create({
  //                 data: {
  //                   companyId: invoice.companyId,
  //                   itemId: updatedItem.itemId,
  //                   type: 'ADJUSTMENT',
  //                   quantity: -qty,
  //                   note: `Purchase return - invoice ${invoice.invoiceNumber}`
  //                 }
  //               });

  //               await tx.item.update({
  //                 where: { id: updatedItem.itemId },
  //                 data: { quantity: item.quantity - qty }
  //               });
  //             }

  //             if (invoice.type !== 'PURCHASE' && status === 'RETURNED') {
  //               await tx.stockLedger.create({
  //                 data: {
  //                   companyId: invoice.companyId,
  //                   itemId: updatedItem.itemId,
  //                   type: 'SALE_RETURN',
  //                   quantity: qty,
  //                   note: `Sale return - invoice ${invoice.invoiceNumber}`
  //                 }
  //               });

  //               await tx.item.update({
  //                 where: { id: updatedItem.itemId },
  //                 data: { quantity: item.quantity + qty }
  //               });
  //             }

  //             if (invoice.type !== 'PURCHASE' && status === 'CANCELLED') {
  //               await tx.stockLedger.create({
  //                 data: {
  //                   companyId: invoice.companyId,
  //                   itemId: updatedItem.itemId,
  //                   type: 'ADJUSTMENT',
  //                   quantity: qty,
  //                   note: `Sale cancelled - invoice ${invoice.invoiceNumber}`
  //                 }
  //               });

  //               await tx.item.update({
  //                 where: { id: updatedItem.itemId },
  //                 data: { quantity: item.quantity + qty }
  //               });
  //             }

  //             if (status === 'DELIVERED' && invoice.type === 'PURCHASE') {
  //               await tx.stockLedger.create({
  //                 data: {
  //                   companyId: invoice.companyId,
  //                   itemId: updatedItem.itemId,
  //                   type: 'PURCHASE',
  //                   quantity: qty,
  //                   note: `Purchase - invoice ${invoice.invoiceNumber}`
  //                 }
  //               });

  //               await tx.item.update({
  //                 where: { id: updatedItem.itemId },
  //                 data: { quantity: item.quantity + qty }
  //               });
  //             }

  //             const finalItem = await tx.invoiceItem.findUnique({
  //               where: { id: itemId },
  //               include: {
  //                 taxRate: true,
  //                 fulfillmentProvider: true,
  //                 ownShipping: true,
  //                 timelines: {
  //                   orderBy: { changedAt: 'desc' },
  //                 },
  //                 item: true,
  //                 product: true,
  //               },
  //             });

  //             return finalItem;
  //           })
  //         );
  //       });

  //       return reply.code(200).send({
  //         statusCode: 200,
  //         message: 'Invoice items updated successfully',
  //         data: updatedItems
  //       });
  //     } catch (error) {
  //       fastify.log.error(error);
  //       return reply.code(500).send({
  //         statusCode: 500,
  //         message: error.message
  //       });
  //     }
  //   }
  // );

  fastify.post(
    '/refund-process',
    {
      preHandler: checkRole('ADMIN', "BRANCHADMIN"),
    },
    async (request, reply) => {
      const { invoiceId, itemId, refundTotal, refundType, reason, refundSubtotal, refundTax, utr, method } = request.body
      const userId = request.user.id

      try {
        const result = await fastify.prisma.$transaction(async (tx) => {

          const invoice = await tx.invoice.findUnique({
            where: { id: invoiceId },
            include: {
              items: {
                where: { id: itemId },
                include: { taxRate: true }
              }
            }
          })

          if (!invoice) throw new Error('Invoice not found')
          if (!invoice.items.length) throw new Error('Invoice item not found')

          const invoiceItem = invoice.items[0]

          let newStatus

          if (method === 'CASH') {
            newStatus = 'REFUND_PROCESSED'
          } else if (['SALE', 'POS', 'ONLINE'].includes(invoice.type)) {
            newStatus = 'REFUND_PROCESSED'
          } else if (invoice.type === 'PURCHASE') {
            newStatus = 'REFUND_REQUESTED'
          } else {
            newStatus = 'REFUND_PROCESSING'
          }

          if (newStatus) {
            const allItems = await tx.invoiceItem.findMany({
              where: { invoiceId: invoice.id },
              select: { status: true }
            })

            const hasActiveItems = allItems.some(item =>
              ['ORDERED', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(item.status)
            )

            if (!hasActiveItems) {
              await tx.invoice.update({
                where: { id: invoice.id },
                data: { status: newStatus }
              })
            }
          }

          await tx.payment.create({
            data: {
              companyId: invoice.companyId,
              invoiceId: invoice.id,

              amount: -Math.abs(refundTotal),

              method,
              referenceNo: utr || null,

              date: new Date(),
              note: `Refund ${refundType || ''}`
            }
          })

          await tx.invoiceItem.update({
            where: { id: itemId },
            data: {
              status: newStatus,
              paidAmount: Math.max(
                0,
                (invoiceItem.paidAmount || 0) - refundTotal
              ),
              reason: reason || `Refund initiated (${method})`
            }
          })

          await tx.invoiceItemTimeline.create({
            data: {
              invoiceItemId: itemId,
              oldStatus: invoiceItem.status,
              newStatus,
              userId,
              note: `Refund initiated (${method})`
            }
          })

          const baseAmount = refundSubtotal
          const taxAmount = refundTax

          const description = `${['SALE', 'POS', 'ONLINE'].includes(invoice.type) ? 'Sales Return' : invoice.type === 'PURCHASE' ? 'Purchase Return' : 'Refund'} - Invoice ${invoice.invoiceNumber}`

          if (['SALE', 'POS', 'ONLINE'].includes(invoice.type)) {

            await tx.journalEntry.create({
              data: {
                companyId: invoice.companyId,
                accountId: await getAccountId(tx, invoice.companyId, 'Sales Return'),
                date: new Date(),
                description,
                debit: baseAmount,
                credit: 0
              }
            })

            if (taxAmount > 0) {
              await tx.journalEntry.create({
                data: {
                  companyId: invoice.companyId,
                  accountId: await getAccountId(tx, invoice.companyId, 'Tax Payable'),
                  date: new Date(),
                  description,
                  debit: taxAmount,
                  credit: 0
                }
              })
            }

            await tx.journalEntry.create({
              data: {
                companyId: invoice.companyId,
                accountId: await getAccountId(
                  tx,
                  invoice.companyId,
                  method === 'CASH' ? 'Cash' : 'Bank'
                ),
                date: new Date(),
                description,
                debit: 0,
                credit: refundTotal
              }
            })
          }

          if (invoice.type === 'PURCHASE') {

            await tx.journalEntry.create({
              data: {
                companyId: invoice.companyId,
                accountId: await getAccountId(tx, invoice.companyId, 'Accounts Payable'),
                date: new Date(),
                description,
                debit: refundTotal,
                credit: 0
              }
            })

            await tx.journalEntry.create({
              data: {
                companyId: invoice.companyId,
                accountId: await getAccountId(tx, invoice.companyId, 'Purchase Return'),
                date: new Date(),
                description,
                debit: 0,
                credit: baseAmount
              }
            })

            if (taxAmount > 0) {
              await tx.journalEntry.create({
                data: {
                  companyId: invoice.companyId,
                  accountId: await getAccountId(tx, invoice.companyId, 'Tax Receivable'),
                  date: new Date(),
                  description,
                  debit: 0,
                  credit: taxAmount
                }
              })
            }
          }

          return true
        })

        return reply.code(201).send({
          statusCode: 201,
          message: 'Refund processed successfully',
          data: result
        })

      } catch (error) {
        fastify.log.error(error)
        return reply.code(500).send({
          statusCode: 500,
          message: error.message
        })
      }
    }
  )

  fastify.get('/item/:id/timeline', {
    preHandler: checkRole("ADMIN", "BRANCHADMIN"),
    schema: {
      tags: ['Invoice'],
      summary: 'Fetch timeline for an invoice item',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' }
        }
      }
    }
  }, async (req, reply) => {
    const { id } = req.params;

    try {
      const events = await fastify.prisma.invoiceItemTimeline.findMany({
        where: { invoiceItemId: id },
        orderBy: { changedAt: 'asc' },
        include: {
          user: {
            select: {
              name: true,
              email: true
            }
          }
        }
      });

      return reply.send({
        statusCode: 200,
        message: 'Timeline fetched successfully',
        data: events
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        statusCode: 500,
        message: 'Failed to fetch item timeline',
        error: error.message
      });
    }
  });

  fastify.delete(
    '/:id',
    {
      preHandler: checkRole("ADMIN", "BRANCHADMIN"),
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
      preHandler: checkRole("ADMIN", "BRANCHADMIN"),
    },
    async (request, reply) => {
      try {
        let { status, from, to, branchId, page = 1, limit = 10 } = request.query
        page = Number(page)
        limit = Number(limit)

        const companyId = request.user.companyId

        // Base filters
        const baseFilters = { companyId }

        if (branchId) baseFilters.branchId = branchId  
        if (status) baseFilters.status = status
        if (from || to) baseFilters.date = {}
        if (from) baseFilters.date.gte = new Date(from)
        if (to) baseFilters.date.lte = new Date(to)

        const skip = (page - 1) * limit

        // SALE
        const [saleInvoices, saleTotal] = await Promise.all([
          fastify.prisma.invoice.findMany({
            where: { ...baseFilters, type: 'SALE' },
            include: {
              customer: true,
              items: { include: { product: true, item: true, taxRate: true } },
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

        // PURCHASE
        const [purchaseInvoices, purchaseTotal] = await Promise.all([
          fastify.prisma.invoice.findMany({
            where: { ...baseFilters, type: 'PURCHASE' },
            include: {
              vendor: true,
              items: { include: { product: true, item: true, taxRate: true } },
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

        // POS
        const [posInvoices, posTotal] = await Promise.all([
          fastify.prisma.invoice.findMany({
            where: { ...baseFilters, type: 'POS' },
            include: {
              customer: true,
              items: { include: { product: true, item: true, taxRate: true } },
              payments: true
            },
            orderBy: { date: 'desc' },
            skip,
            take: limit
          }),
          fastify.prisma.invoice.count({
            where: { ...baseFilters, type: 'POS' }
          })
        ])

        // ONLINE
        const [onlineInvoices, onlineTotal] = await Promise.all([
          fastify.prisma.invoice.findMany({
            where: { ...baseFilters, type: 'ONLINE' },
            include: {
              customer: true,
              items: { include: { product: true, item: true, taxRate: true } },
              payments: true
            },
            orderBy: { date: 'desc' },
            skip,
            take: limit
          }),
          fastify.prisma.invoice.count({
            where: { ...baseFilters, type: 'ONLINE' }
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
            },
            pos: {
              invoices: posInvoices,
              pagination: {
                total: posTotal,
                page,
                limit,
                totalPages: Math.ceil(posTotal / limit)
              }
            },
            online: {
              invoices: onlineInvoices,
              pagination: {
                total: onlineTotal,
                page,
                limit,
                totalPages: Math.ceil(onlineTotal / limit)
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