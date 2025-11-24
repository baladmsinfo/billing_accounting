
module.exports = async function (fastify) {
    fastify.post("/payment/callback", async (req, reply) => {
        const prisma = fastify.prisma;

        const {
            paymentId,
            invoiceId,
            status,       // "SUCCESS", "FAILED", "PENDING"
            amount,
            gateway,
            rawResponse
        } = req.body;

        // -----------------------------------------
        // 1️⃣ Prevent Double Processing (Idempotency)
        // -----------------------------------------
        const existing = await prisma.payment.findFirst({
            where: { gatewayPaymentId: paymentId }
        });

        if (existing) {
            return reply.send({
                message: "Payment already processed",
                paymentId: existing.id,
                invoiceId: existing.invoiceId
            });
        }

        // -----------------------------------------
        // 2️⃣ Fetch Invoice
        // -----------------------------------------
        const invoice = await prisma.invoice.findUnique({
            where: { id: invoiceId },
            include: { items: true }
        });

        if (!invoice) {
            return reply.code(404).send({ error: "Invoice not found" });
        }

        // -----------------------------------------
        // 3️⃣ Create Payment Record
        // -----------------------------------------
        const payment = await prisma.payment.create({
            data: {
                invoiceId,
                amount,
                method: gateway,
                status,
                gatewayPaymentId: paymentId,
                rawResponse: JSON.stringify(rawResponse || {})
            }
        });

        // -----------------------------------------
        // 4️⃣ If Payment Failed → Mark Invoice Failed
        // -----------------------------------------
        if (status === "FAILED") {
            await prisma.invoice.update({
                where: { id: invoiceId },
                data: { status: "FAILED" }
            });

            return reply.send({
                message: "Payment failed",
                invoiceId,
                paymentId
            });
        }

        // -----------------------------------------
        // 5️⃣ Payment Success → Mark Invoice as PAID
        // -----------------------------------------
        if (status === "SUCCESS") {
            await prisma.invoice.update({
                where: { id: invoiceId },
                data: { status: "PAID", paidAt: new Date() }
            });

            // -------------------------------------------------
            // 6️⃣ Stock Update (Only if stock not already updated)
            // -------------------------------------------------
            for (const item of invoice.items) {
                const ledgerExists = await prisma.stockLedger.findFirst({
                    where: {
                        reference: invoice.id,
                        itemId: item.itemId,
                        type: "SALE"
                    }
                });

                if (!ledgerExists) {
                    // reduce stock
                    await prisma.item.update({
                        where: { id: item.itemId },
                        data: { stock: { decrement: item.quantity } }
                    });

                    // stock ledger entry
                    await prisma.stockLedger.create({
                        data: {
                            companyId: invoice.companyId,
                            branchId: invoice.branchId,
                            itemId: item.itemId,
                            type: "SALE",
                            quantity: item.quantity,
                            reference: invoice.id
                        }
                    });
                }
            }

            return reply.send({
                message: "Payment successful and invoice updated",
                invoiceId,
                paymentId
            });
        }

        // PENDING
        return reply.send({
            message: "Payment pending",
            invoiceId,
            paymentId
        });
    });

}