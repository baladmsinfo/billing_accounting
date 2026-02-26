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
        { preHandler: checkRole("ADMIN", "BRANCHADMIN") },
        async (request, reply) => {
            try {
                const {
                    category,
                    date,
                    amount,
                    note,
                    taxRateId,
                    branchId,
                    imageId,
                    imageUrl
                } = request.body

                const companyId = request.user.companyId || request.companyId

                let branch = null;

                if (branchId) {
                    branch = await fastify.prisma.branch.findFirst({
                        where: { id: branchId, companyId }
                    });

                } else {
                    branch = await fastify.prisma.branch.findFirst({
                        where: { companyId, type: "MAIN" }
                    });
                }

                console.log("Branch", branch);


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
                    const invoice = await fastify.prisma.$transaction(async (tx) => {

                        const inv = await tx.invoice.create({
                            data: {
                                companyId,
                                branchId: branch.id,
                                date: new Date(date),
                                dueDate: new Date(date),
                                type: 'EXPENSE',
                                status: 'PAID',
                                totalAmount: amount,
                                taxAmount: 0,
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

                        return inv
                    })

                    return reply.send({
                        statusCode: '00',
                        message: 'Expense added successfully (without tax)',
                        data: invoice
                    })
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
                            branchId: branch.id,
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
        preHandler: checkRole("ADMIN", "BRANCHADMIN"),
    }, async (request, reply) => {
        try {
            const companyId = request.user.companyId;
            const { period = "thisYear", branchId } = request.query;

            const { from, to } = getDateRange(period);

            // Fetch all EXPENSE accounts (to map category names)
            const expenseAccounts = await fastify.prisma.account.findMany({
                where: { companyId, type: 'EXPENSE' }
            });

            // Fetch all expense invoices filtered by branch and period
            const invoices = await fastify.prisma.invoice.findMany({
                where: {
                    companyId,
                    type: "EXPENSE",
                    date: { gte: from, lte: to },
                    ...(branchId ? { branchId } : {})  // branch filter only if provided
                },
                select: {
                    totalAmount: true,
                    invoiceNumber: true,
                    date: true,
                    // Get category from the account relation (by name match)
                    expenseImages: false
                }
            });

            // Build chart categories from expense accounts
            const categories = expenseAccounts.map(a => a.name.toLowerCase());

            // Prepare grouped totals
            const grouped = [];

            for (const acc of expenseAccounts) {
                // Match invoices that contain this account category
                // Category name is stored in "category" input used during creation
                const total = (await fastify.prisma.journalEntry.aggregate({
                    where: {
                        companyId,
                        accountId: acc.id,
                        debit: { gt: 0 },
                        date: { gte: from, lte: to },
                    },
                    _sum: { debit: true }
                }))._sum.debit || 0;

                grouped.push({
                    category: acc.name,
                    total
                });
            }

            const grandTotal = grouped.reduce((s, x) => s + x.total, 0);

            return reply.send({
                statusCode: "00",
                message: `Expense chart for ${period}`,
                data: { items: grouped, total: grandTotal }
            });

        } catch (err) {
            console.error(err);
            return reply.code(500).send({
                statusCode: "99",
                message: err.message
            });
        }
    });

    fastify.get(
        '/',
        {
            preHandler: checkRole('ADMIN', "BRANCHADMIN"),
        },
        async (request, reply) => {
            try {
                const { page = 1, take = 10, category, fromDate, toDate, branchId } = request.query
                const skip = (page - 1) * Number(take)
                const companyId = request.user.companyId

                // Base expense invoice filter
                const invoiceWhere = {
                    companyId,
                    type: 'EXPENSE',
                    ...(branchId ? { branchId } : {}),   
                    ...(fromDate && { date: { gte: new Date(fromDate) } }),
                    ...(toDate && { date: { lte: new Date(toDate) } })
                }

                const invoices = await fastify.prisma.invoice.findMany({
                    where: invoiceWhere,
                    skip,
                    take: Number(take),
                    orderBy: { date: 'desc' },
                    include: {
                        expenseImages: {
                            include: { image: true }
                        }
                    }
                })

                const invoiceIds = invoices.map(i => i.id)

                // Fetch only journal entries related to these invoices
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

                // Link journal entry → invoice
                const journalByInvoice = {}
                journals.forEach(j => {
                    const matchedInvoice = invoices.find(inv =>
                        j.description?.includes(inv.invoiceNumber)
                    )
                    if (matchedInvoice) {
                        journalByInvoice[matchedInvoice.id] = j
                    }
                })

                // Shape response
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
            preHandler: checkRole("ADMIN", "BRANCHADMIN"),
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
            preHandler: checkRole("ADMIN", "BRANCHADMIN"),
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
            preHandler: checkRole("ADMIN", "BRANCHADMIN"),
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
