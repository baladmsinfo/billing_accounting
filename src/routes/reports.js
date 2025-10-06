// routes/report.js
'use strict'

module.exports = async function (fastify) {
    fastify.get('/ledger/:accountId', {
        preHandler: [fastify.authenticate],
        schema: {
            tags: ['Reports'],
            summary: 'Get ledger report for an account',
            params: {
                type: 'object',
                required: ['accountId'],
                properties: {
                    accountId: { type: 'string' }
                }
            },
            querystring: {
                type: 'object',
                properties: {
                    startDate: { type: 'string', format: 'date' },
                    endDate: { type: 'string', format: 'date' }
                }
            }
        }
    }, async (req, reply) => {
        const { accountId } = req.params
        const { startDate, endDate } = req.query

        const entries = await fastify.prisma.journalEntry.findMany({
            where: {
                accountId,
                companyId: req.user.companyId,
                date: {
                    gte: startDate ? new Date(startDate) : undefined,
                    lte: endDate ? new Date(endDate) : undefined
                }
            },
            orderBy: { date: 'asc' }
        })

        let balance = 0
        const ledger = entries.map(e => {
            balance += e.debit - e.credit
            return {
                date: e.date,
                description: e.description,
                debit: e.debit,
                credit: e.credit,
                runningBalance: balance
            }
        })

        return { statusCode: '00', data: ledger }
    })

    fastify.get('/trial-balance', {
        preHandler: [fastify.authenticate],
        schema: {
            tags: ['Reports'],
            summary: 'Get trial balance report',
            querystring: {
                type: 'object',
                properties: {
                    startDate: { type: 'string', format: 'date' },
                    endDate: { type: 'string', format: 'date' }
                }
            }
        }
    }, async (req, reply) => {
        try {
            const { startDate, endDate } = req.query

            // Build date filter only if provided
            let dateFilter = {}
            if (startDate || endDate) {
                dateFilter = {
                    gte: startDate ? new Date(startDate) : undefined,
                    lte: endDate ? new Date(endDate) : undefined
                }
            }

            const grouped = await fastify.prisma.journalEntry.groupBy({
                by: ['accountId'],
                where: {
                    companyId: req.user.companyId,
                    ...(startDate || endDate ? { date: dateFilter } : {})
                },
                _sum: { debit: true, credit: true }
            })

            const result = await Promise.all(
                grouped.map(async t => {
                    const account = await fastify.prisma.account.findUnique({
                        where: { id: t.accountId }
                    })

                    return {
                        accountId: t.accountId,
                        accountName: account?.name || 'Unknown',
                        debit: t._sum.debit || 0,
                        credit: t._sum.credit || 0,
                        balance: (t._sum.debit || 0) - (t._sum.credit || 0)
                    }
                })
            )

            // 👉 Calculate totals
            const totalDebit = result.reduce((sum, r) => sum + r.debit, 0)
            const totalCredit = result.reduce((sum, r) => sum + r.credit, 0)

            const isBalanced = totalDebit === totalCredit

            return {
                statusCode: '00',
                data: result,
                totals: {
                    totalDebit,
                    totalCredit,
                    isBalanced
                }
            }
        } catch (err) {
            req.log.error(err)
            return reply.code(500).send({ statusCode: '99', message: 'Failed to fetch trial balance', error: err.message })
        }
    })
}
