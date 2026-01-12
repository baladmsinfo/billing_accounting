'use strict'
const checkRole = require('../utils/checkRole')
const { getAccountId } = require('../services/invoiceService')

module.exports = async function (fastify, opts) {

    const getDateRange = (period) => {
        const now = new Date()
        let from, to = new Date()

        if (period === "thisMonth") {
            from = new Date(now.getFullYear(), now.getMonth(), 1)
        }
        else if (period === "thisQuarter") {
            const q = Math.floor(now.getMonth() / 3)
            from = new Date(now.getFullYear(), q * 3, 1)
        }
        else if (period === "yearToDate") {
            from = new Date(now.getFullYear(), 0, 1)
        }
        else { // thisYear
            from = new Date(now.getFullYear(), 0, 1)
        }

        return { from, to }
    }

    fastify.post(
        '/',
        { preHandler: checkRole("ADMIN") },
        async (request, reply) => {
            try {
                const {
                    category,
                    date,
                    amount,
                    note,
                    taxRateId,
                    imageId,
                    imageUrl
                } = request.body

                const companyId = request.user.companyId

                const expenseAccount = await fastify.prisma.account.findFirst({
                    where: { companyId, type: 'EXPENSE', name: { contains: category, mode: 'insensitive' } }
                })

                const cashAccount = await fastify.prisma.account.findFirst({
                    where: { companyId, type: 'ASSET', name: { contains: 'Cash', mode: 'insensitive' } }
                })

                if (!expenseAccount || !cashAccount) {
                    return reply.code(400).send({ statusCode: '01', message: 'Required accounts not found' })
                }

                if (!taxRateId) {
                    await fastify.prisma.$transaction(async (tx) => {
                        await tx.journalEntry.create({
                            data: {
                                companyId,
                                date: new Date(date),
                                description: note ?? `${category} Expense`,
                                debit: amount,
                                credit: 0,
                                accountId: expenseAccount.id
                            }
                        })

                        await tx.journalEntry.create({
                            data: {
                                companyId,
                                date: new Date(date),
                                description: note ?? `${category} Expense Payment`,
                                debit: 0,
                                credit: amount,
                                accountId: cashAccount.id
                            }
                        })
                    })

                    return reply.send({ statusCode: '00', message: 'Expense added successfully' })
                }

                const invoice = await fastify.prisma.$transaction(async (tx) => {
                    const tax = await tx.taxRate.findUnique({ where: { id: taxRateId } })
                    if (!tax) throw new Error('Tax rate not found')

                    const taxAmount = (amount * tax.rate) / 100
                    const total = amount + taxAmount

                    // 1️⃣ Create invoice (type → EXPENSE)
                    const inv = await tx.invoice.create({
                        data: {
                            companyId,
                            date: new Date(date),
                            dueDate: new Date(date),
                            type: 'EXPENSE',
                            status: 'PAID',
                            totalAmount: total,
                            taxAmount,
                            invoiceNumber: `EXP-${Date.now()}`,
                        },
                    })

                    if (imageId && imageUrl) {
                        await tx.expenseImage.create({
                            data: {
                                invoiceId: inv.id,
                                imageId,
                                imageUrl,
                            }
                        })
                    }

                    // 2️⃣ Create invoice tax
                    await tx.invoiceTax.create({
                        data: {
                            invoiceId: inv.id,
                            companyId,
                            taxRateId,
                            invoiceType: 'EXPENSE',
                            amount: taxAmount,
                        },
                    })

                    // 3️⃣ Journal entries
                    const description = note ?? `Expense Invoice ${inv.invoiceNumber}`
                    const taxPayableAccountId = await getAccountId(tx, companyId, 'Tax Payable')

                    // Expense (Debit)
                    await tx.journalEntry.create({
                        data: {
                            companyId,
                            date: new Date(date),
                            description,
                            debit: amount,
                            credit: 0,
                            accountId: expenseAccount.id,
                        },
                    })

                    // Tax Payable (Debit)
                    await tx.journalEntry.create({
                        data: {
                            companyId,
                            date: new Date(date),
                            description,
                            debit: taxAmount,
                            credit: 0,
                            accountId: taxPayableAccountId,
                        },
                    })

                    // Cash/Bank (Credit)
                    await tx.journalEntry.create({
                        data: {
                            companyId,
                            date: new Date(date),
                            description,
                            debit: 0,
                            credit: total,
                            accountId: cashAccount.id,
                        },
                    })

                    return inv
                })

                return reply.send({
                    statusCode: '00',
                    message: 'Expense added with tax invoice successfully',
                    data: invoice
                })

            } catch (err) {
                fastify.log.error(err)
                return reply.code(500).send({
                    statusCode: '99',
                    message: 'Failed to create expense',
                    error: err.message
                })
            }
        }
    )

    fastify.get('/chart', {
        preHandler: checkRole("ADMIN"),
        schema: {
            tags: ['Expense'],
            summary: 'Get expense summary for chart with period',
            querystring: {
                type: 'object',
                properties: {
                    period: { type: 'string' }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const companyId = request.user.companyId;
            const { period = "thisYear" } = request.query;

            const { from, to } = getDateRange(period);

            const expenseAccounts = await fastify.prisma.account.findMany({
                where: { companyId, type: 'EXPENSE' }
            });

            const accountIds = expenseAccounts.map(a => a.id);

            const grouped = await fastify.prisma.journalEntry.groupBy({
                by: ['accountId'],
                where: {
                    companyId,
                    accountId: { in: accountIds },
                    debit: { gt: 0 },
                    date: {
                        gte: from,
                        lte: to
                    }
                },
                _sum: { debit: true }
            })

            const chartData = grouped.map(g => ({
                category: expenseAccounts.find(a => a.id === g.accountId)?.name || "Unknown",
                total: g._sum.debit || 0
            }))

            const grandTotal = chartData.reduce((sum, x) => sum + x.total, 0)

            return reply.send({
                statusCode: "00",
                message: "Expense chart filtered by period",
                data: { items: chartData, total: grandTotal }
            })
        } catch (err) {
            console.error(err)
            reply.code(500).send({ statusCode: "99", message: err.message })
        }
    })

    fastify.get(
        '/',
        {
            preHandler: checkRole('ADMIN'),
            schema: {
                tags: ['Expense'],
                summary: 'Get expenses (invoice-based, category-aware)',
                querystring: {
                    type: 'object',
                    properties: {
                        page: { type: 'number', default: 1 },
                        take: { type: 'number', default: 10 },
                        category: { type: 'string', nullable: true },
                        fromDate: { type: 'string', format: 'date', nullable: true },
                        toDate: { type: 'string', format: 'date', nullable: true }
                    }
                }
            }
        },
        async (request, reply) => {
            try {
                const { page = 1, take = 10, category, fromDate, toDate } = request.query
                const skip = (page - 1) * take
                const companyId = request.user.companyId

                // 1️⃣ Get EXPENSE invoices
                const invoiceWhere = {
                    companyId,
                    type: 'EXPENSE',
                    ...(fromDate && { date: { gte: new Date(fromDate) } }),
                    ...(toDate && { date: { lte: new Date(toDate) } })
                }

                const invoices = await fastify.prisma.invoice.findMany({
                    where: invoiceWhere,
                    skip,
                    take,
                    orderBy: { date: 'desc' },
                    include: {
                        expenseImages: {
                            include: { image: true }
                        }
                    }
                })

                const invoiceIds = invoices.map(i => i.id)

                // 2️⃣ Fetch related EXPENSE journal entries
                const journals = await fastify.prisma.journalEntry.findMany({
                    where: {
                        companyId,
                        debit: { gt: 0 },
                        account: {
                            type: 'EXPENSE',
                            ...(category && {
                                name: { contains: category, mode: 'insensitive' }
                            })
                        }
                    },
                    include: { account: true }
                })

                // 3️⃣ Map invoiceNumber → journal entry
                const journalByInvoice = {}
                journals.forEach(j => {
                    const match = invoices.find(inv =>
                        j.description?.includes(inv.invoiceNumber)
                    )
                    if (match) {
                        journalByInvoice[match.id] = j
                    }
                })

                // 4️⃣ Shape response (UI-friendly)
                const data = invoices
                    .filter(inv => !category || journalByInvoice[inv.id])
                    .map(inv => {
                        const journal = journalByInvoice[inv.id]
                        return {
                            id: inv.id,
                            category: journal?.account?.name ?? 'Expense',
                            date: inv.date,
                            amount: inv.totalAmount,
                            description:
                                journal?.description ?? `Expense Invoice ${inv.invoiceNumber}`,
                            images: inv.expenseImages.map(e => ({
                                id: e.image.id,
                                url: e.image.url
                            }))
                        }
                    })

                return reply.send({
                    statusCode: '00',
                    message: 'Expenses fetched successfully',
                    data,
                    total: data.length
                })
            } catch (err) {
                fastify.log.error(err)
                return reply.code(500).send({
                    statusCode: '99',
                    message: 'Failed to fetch expenses',
                    error: err.message
                })
            }
        }
    )

    fastify.get(
        '/options',
        {
            preHandler: checkRole("ADMIN"),
            schema: {
                tags: ['Expense'],
                summary: 'Get all expense account options (excluding Purchases)',
                response: {
                    200: {
                        type: 'object',
                        properties: {
                            statusCode: { type: 'string', example: '00' },
                            message: { type: 'string' },
                            data: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        id: { type: 'string' },
                                        name: { type: 'string' }
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
                const companyId = request.user.companyId

                const options = await fastify.prisma.account.findMany({
                    where: {
                        companyId,
                        type: 'EXPENSE',
                        NOT: {
                            name: {
                                equals: 'Purchases',
                                mode: 'insensitive'
                            }
                        }
                    },
                    select: {
                        id: true,
                        name: true
                    },
                    orderBy: {
                        name: 'asc'
                    }
                })

                return reply.code(200).send({
                    statusCode: '00',
                    message: 'Expense options fetched successfully',
                    data: options
                })
            } catch (err) {
                fastify.log.error(err)
                return reply.code(500).send({
                    statusCode: '99',
                    message: 'Failed to fetch expense options',
                    error: err.message
                })
            }
        }
    )

    fastify.put(
        '/:id',
        {
            preHandler: checkRole("ADMIN"),
            schema: {
                tags: ['Expense'],
                summary: 'Update an expense',
                params: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' }
                    }
                },
                body: {
                    type: 'object',
                    properties: {
                        category: { type: 'string' },
                        date: { type: 'string', format: 'date' },
                        amount: { type: 'number' },
                        note: { type: 'string' }
                    }
                }
            }
        },

        async (request, reply) => {
            try {
                const { id } = request.params
                const { category, date, amount, note } = request.body
                const companyId = request.user.companyId

                const existing = await fastify.prisma.journalEntry.findFirst({
                    where: { id, companyId },
                    include: { account: true }
                })

                if (!existing || existing.account.type !== 'EXPENSE') {
                    return reply.code(404).send({
                        statusCode: '01',
                        message: 'Expense not found'
                    })
                }

                // Update expense entry only (debit)
                const updated = await fastify.prisma.journalEntry.update({
                    where: { id },
                    data: {
                        date: date ? new Date(date) : existing.date,
                        debit: amount ?? existing.debit,
                        description: note ?? existing.description
                    }
                })

                return reply.code(200).send({
                    statusCode: '00',
                    message: 'Expense updated successfully',
                    data: updated
                })
            } catch (err) {
                fastify.log.error(err)
                return reply.code(500).send({
                    statusCode: '99',
                    message: 'Failed to update expense',
                    error: err.message
                })
            }
        }
    )

    fastify.delete(
        '/:id',
        {
            preHandler: checkRole("ADMIN"),
            schema: {
                tags: ['Expense'],
                summary: 'Delete an expense',
                params: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' }
                    }
                }
            }
        },

        async (request, reply) => {
            try {
                const { id } = request.params
                const companyId = request.user.companyId

                const existing = await fastify.prisma.journalEntry.findFirst({
                    where: { id, companyId }
                })

                if (!existing) {
                    return reply.code(404).send({
                        statusCode: '01',
                        message: 'Expense not found'
                    })
                }

                await fastify.prisma.journalEntry.delete({ where: { id } })

                return reply.code(200).send({
                    statusCode: '00',
                    message: 'Expense deleted successfully'
                })
            } catch (err) {
                fastify.log.error(err)
                return reply.code(500).send({
                    statusCode: '99',
                    message: 'Failed to delete expense',
                    error: err.message
                })
            }
        }
    )
}
