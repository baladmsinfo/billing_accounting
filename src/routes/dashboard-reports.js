// routes/dashboardReports.js
'use strict'

const { startOfMonth, startOfQuarter, startOfYear, endOfMonth, endOfQuarter, endOfYear } = require('date-fns')

module.exports = async function (fastify) {
    function getDateRange(period) {
        const now = new Date()
        switch (period) {
            case 'thisMonth':
                return { start: startOfMonth(now), end: endOfMonth(now) }
            case 'thisQuarter':
                return { start: startOfQuarter(now), end: endOfQuarter(now) }
            case 'thisYear':
                return { start: startOfYear(now), end: endOfYear(now) }
            case 'yearToDate':
            default:
                return { start: startOfYear(now), end: now }
        }
    }

    fastify.get('/reports/dashboard/cashflow', {
        preHandler: [fastify.authenticate],
        schema: {
            tags: ['Dashboard'],
            summary: 'Cashflow (Inflow vs Outflow, time-based)',
            querystring: {
                type: 'object',
                properties: {
                    period: {
                        type: 'string',
                        enum: ['thisYear', 'thisQuarter', 'thisMonth', 'yearToDate'],
                        default: 'thisYear',
                    },
                },
            },
        },
    }, async (req, reply) => {
        const { period } = req.query
        const { start, end } = getDateRange(period)
        const companyId = req.user.companyId

        const groupBy =
            period === 'thisMonth'
                ? 'day'
                : period === 'thisQuarter'
                    ? 'week'
                    : 'month'

        const payments = await fastify.prisma.payment.findMany({
            where: {
                companyId,
                date: { gte: start, lte: end },
            },
            include: {
                invoice: {
                    select: { type: true, date: true },
                },
            },
            orderBy: { date: 'asc' },
        })

        const grouped = {}
        for (const p of payments) {
            const d = new Date(p.date)
            let key

            if (groupBy === 'day') {
                key = d.toISOString().slice(0, 10) // YYYY-MM-DD
            } else if (groupBy === 'week') {
                const weekStart = new Date(d)
                weekStart.setDate(d.getDate() - d.getDay()) // week starting Sunday
                key = weekStart.toISOString().slice(0, 10)
            } else {
                key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
            }

            if (!grouped[key]) grouped[key] = { inflow: 0, outflow: 0 }

            if (p.invoice.type === 'SALE') grouped[key].inflow += p.amount
            if (p.invoice.type === 'PURCHASE') grouped[key].outflow += p.amount
        }

        // 3️⃣ Convert to timeline array
        const sortedKeys = Object.keys(grouped).sort(
            (a, b) => new Date(a) - new Date(b)
        )

        const result = sortedKeys.map(dateKey => ({
            date: dateKey,
            inflow: grouped[dateKey].inflow,
            outflow: grouped[dateKey].outflow,
        }))

        return reply.send({
            statusCode: '00',
            data: result,
        })
    })


    fastify.get('/reports/dashboard/sales', {
        preHandler: [fastify.authenticate],
        schema: {
            tags: ['Dashboard'],
            summary: 'Sales invoice paid/unpaid summary',
            querystring: {
                type: 'object',
                properties: {
                    period: { type: 'string', enum: ['thisYear', 'thisQuarter', 'thisMonth', 'yearToDate'], default: 'thisYear' }
                }
            }
        }
    }, async (req, reply) => {
        const { period } = req.query
        const { start, end } = getDateRange(period)
        const companyId = req.user.companyId

        const invoices = await fastify.prisma.invoice.findMany({
            where: {
                companyId,
                type: 'SALE',
                date: { gte: start, lte: end }
            },
            include: { payments: true }
        })

        let paid = 0, unpaid = 0
        for (const inv of invoices) {
            const totalPaid = inv.payments.reduce((s, p) => s + p.amount, 0)
            if (totalPaid >= inv.totalAmount) paid += inv.totalAmount
            else unpaid += inv.totalAmount - totalPaid
        }

        return { statusCode: '00', data: { period, paid, unpaid } }
    })

    fastify.get('/reports/dashboard/purchases', {
        preHandler: [fastify.authenticate],
        schema: {
            tags: ['Dashboard'],
            summary: 'Purchase invoice paid/unpaid summary',
            querystring: {
                type: 'object',
                properties: {
                    period: { type: 'string', enum: ['thisYear', 'thisQuarter', 'thisMonth', 'yearToDate'], default: 'thisYear' }
                }
            }
        }
    }, async (req, reply) => {
        const { period } = req.query
        const { start, end } = getDateRange(period)
        const companyId = req.user.companyId

        const invoices = await fastify.prisma.invoice.findMany({
            where: {
                companyId,
                type: 'PURCHASE',
                date: { gte: start, lte: end }
            },
            include: { payments: true }
        })

        let paid = 0, unpaid = 0
        for (const inv of invoices) {
            const totalPaid = inv.payments.reduce((s, p) => s + p.amount, 0)
            if (totalPaid >= inv.totalAmount) paid += inv.totalAmount
            else unpaid += inv.totalAmount - totalPaid
        }

        return { statusCode: '00', data: { period, paid, unpaid } }
    })
}