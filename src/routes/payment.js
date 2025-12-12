'use strict'
const { createPayment, recordPurchasePayment } = require('../services/paymentServices')
const { sendEmailPaymentLink, sendSmsPaymentLink, sendWhatsappPaymentLink } = require('../services/emailServices')
const checkRole = require('../utils/checkRole')

module.exports = async function (fastify, opts) {

  // Create Payment
  fastify.post(
    "/",
    {
      preHandler: checkRole("ADMIN"),
    },
    async (req, reply) => {
      try {
        const { invoiceId, amount, method, referenceNo, date, items, note } = req.body

        const paymentData = {
          companyId: req.user.companyId,
          invoiceId,
          amount,
          method,
          referenceNo,
          date,
          items,
          note
        }

        const payment = await createPayment(fastify.prisma, paymentData)

        return reply.code(201).send({
          statusCode: 201,
          message: 'Payment created successfully',
          data: payment
        })
      } catch (err) {
        fastify.log.error(err)
        return reply.code(500).send({
          statusCode: 500,
          message: 'Failed to create payment',
          error: err.message
        })
      }
    }
  )

  fastify.post(
    '/purchase',
    {
      preHandler: checkRole("ADMIN"),
    },
    async (req, reply) => {
      try {
        const { invoiceId, amount, method, referenceNo, date, items, note } = req.body

        const paymentData = {
          companyId: req.user.companyId,
          invoiceId,
          amount,
          method,
          referenceNo,
          date,
          items,
          note
        }

        const payment = await recordPurchasePayment(fastify.prisma, paymentData)

        return reply.code(201).send({
          statusCode: 201,
          message: 'Payment recorded successfully',
          data: payment
        })
      } catch (err) {
        fastify.log.error(err)
        return reply.code(500).send({
          statusCode: 500,
          message: 'Failed to create payment',
          error: err.message
        })
      }
    }
  )

  // Send Payment Link (Email / SMS / WhatsApp)
  fastify.post(
    '/send-payment-link',
    {
      preHandler: checkRole("ADMIN"),
    },
    async (req, reply) => {
      try {
        const { invoiceId, type, items, amount, methods } = req.body;

        const companyId = req.companyId;

        if (!invoiceId || !methods || methods.length === 0) {
          return reply.code(400).send({
            statusCode: 400,
            message: "invoiceId and methods[] are required"
          });
        }

        const invoice = await fastify.prisma.invoice.findUnique({
          where: { id: invoiceId },
          include: {
            company: true,
            customer: true,
          }
        });

        console.log("Payload -", invoiceId, type, items, amount, methods, companyId);

        const raw = JSON.stringify({ invoiceId, type, items, amount, methods, companyId });

        const token = Buffer.from(raw).toString("base64url");

        const paymentLink = `${process.env.BACKEND_URL}/api/payments/bill?token=${token}`;

        console.log("Encoded Token:", token);

        const payload = {
          to: invoice.customer?.email,
          items,
          amount,
          paymentLink
        };

        if (methods.includes("email")) await sendEmailPaymentLink(payload);
        if (methods.includes("sms")) await sendSmsPaymentLink(payload);
        if (methods.includes("whatsapp")) await sendWhatsappPaymentLink(payload);

        return reply.code(200).send({
          statusCode: 200,
          message: "Payment link sent successfully",
          data: {
            sentVia: methods,
            paymentLink
          }
        });
      } catch (err) {
        fastify.log.error(err);
        return reply.code(500).send({
          statusCode: 500,
          message: "Failed to send payment link",
          error: err.message
        });
      }
    }
  );

  fastify.get("/bill", async (req, reply) => {
    try {
      const { token } = req.query;

      if (!token) {
        return reply.code(400).send({ error: "Token missing" });
      }

      // Decode base64 token
      const json = Buffer.from(token, "base64url").toString("utf8");
      const decoded = JSON.parse(json);

      console.log("Decoded Token →", decoded);

      const { invoiceId, type, items, amount, methods, companyId } = decoded;

      const invoice = await fastify.prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          company: true,
          customer: {
            include: {
              addresses: true
            }
          },
          items: {
            include: {
              product: true,
              item: true,
              taxRate: true
            }
          }
        }
      });

      if (!invoice) {
        return reply.code(404).send({ error: "Invoice not found" });
      }

      const defaultAddress = invoice.customer?.addresses?.find(a => a.isDefault)
        || invoice.customer?.addresses?.[0]
        || null;

      const const_data = {
        invoiceId,
        token,
        company: {
          name: invoice.company.name,
          address:
            `${invoice.company.addressLine1}, ${invoice.company.city}, ${invoice.company.state} - ${invoice.company.pincode}`,
          phone: invoice.company.primaryPhoneNo,
          email: invoice.company.primaryEmail,
        },

        customer: invoice.customer
          ? {
            name: invoice.customer.name,
            email: invoice.customer.email || "",
            phone: invoice.customer.phone || "",
            address: defaultAddress
              ? `${defaultAddress.addressLine1}, ${defaultAddress.city}`
              : "",
          }
          : {
            name: "Walk-in Customer",
            email: "",
            phone: "",
            address: "",
          },

        invoiceItems: items.map((record) => ({
          id: record.itemId,
          title: record.name,
          price: record.balance,
          selected: true,
          disabled: record.balance <= 0
        })),

        amount,
        methods,
        type
      };

      console.log("Final const_data →", const_data);

      return reply.view("fees.ejs", {
        title: "Fee Collection",
        data: const_data
      });

    } catch (err) {
      console.error("Bill page error:", err);

      return reply.code(400).send({
        error: "Invalid token",
        details: err.message
      });
    }
  });

  // Get Payments (all or by invoiceId)
  fastify.get(
    '/',
    {
      preHandler: checkRole("ADMIN"),
      schema: {
        tags: ['Payments'],
        summary: 'List all payments or filter by invoiceId',
        querystring: {
          type: 'object',
          properties: {
            invoiceId: { type: 'string', example: 'inv_12345' }
          }
        }
      }
    },
    async (req, reply) => {
      try {
        const { invoiceId } = req.query
        const where = { companyId: req.user.companyId }
        if (invoiceId) where.invoiceId = invoiceId

        const payments = await fastify.prisma.payment.findMany({
          where,
          orderBy: { date: 'desc' }
        })

        return reply.code(200).send({
          statusCode: 200,
          message: 'Payments fetched successfully',
          data: payments
        })
      } catch (err) {
        fastify.log.error(err)
        return reply.code(500).send({
          statusCode: 500,
          message: 'Failed to fetch payments',
          error: err.message
        })
      }
    }
  )

  // Get single payment by ID
  fastify.get(
    '/:id',
    {
      preHandler: checkRole("ADMIN"),
      schema: {
        tags: ['Payments'],
        summary: 'Get payment by ID',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', example: 'pay_12345' }
          }
        },
      }
    },
    async (req, reply) => {
      try {
        const { id } = req.params

        const payment = await fastify.prisma.payment.findUnique({
          where: { id },
          include: {
            invoice: {
              select: { id: true, invoiceNumber: true, status: true, totalAmount: true }
            }
          }
        })

        if (!payment) {
          return reply.code(404).send({
            statusCode: 404,
            message: 'Payment not found'
          })
        }

        return reply.code(200).send({
          statusCode: 200,
          message: 'Payment fetched successfully',
          data: payment
        })
      } catch (err) {
        fastify.log.error(err)
        return reply.code(500).send({
          statusCode: 500,
          message: 'Failed to fetch payment',
          error: err.message
        })
      }
    }
  )

  // Delete Payment
  fastify.delete(
    '/:id',
    {
      preHandler: checkRole("ADMIN"),
      schema: {
        tags: ['Payments'],
        summary: 'Delete payment',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', example: 'pay_12345' }
          }
        },
      }
    },
    async (req, reply) => {
      try {
        const { id } = req.params

        const payment = await fastify.prisma.payment.findUnique({ where: { id } })
        if (!payment) {
          return reply.code(404).send({
            statusCode: 404,
            message: 'Payment not found'
          })
        }

        await fastify.prisma.$transaction(async (tx) => {
          await tx.payment.delete({ where: { id } })
          await svc.updateInvoiceStatus(tx, payment.invoiceId)
        })

        return reply.code(200).send({
          statusCode: 200,
          message: 'Payment deleted successfully'
        })
      } catch (err) {
        fastify.log.error(err)
        return reply.code(500).send({
          statusCode: 500,
          message: 'Failed to delete payment',
          error: err.message
        })
      }
    }
  )
}