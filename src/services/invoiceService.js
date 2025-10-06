const { Prisma } = require('@prisma/client')
const { Decimal } = Prisma

// async function createInvoice(prisma, data) {
//   return prisma.$transaction(async (tx) => {
//     let totalAmount = new Decimal(0)
//     let taxAmount = new Decimal(0)

//     for (const it of data.items) {
//       const lineTotal = new Decimal(it.quantity).times(new Decimal(it.price))
//       totalAmount = totalAmount.plus(lineTotal)

//       if (it.taxRateId) {
//         const tax = await tx.taxRate.findUnique({ where: { id: it.taxRateId } })
//         if (tax) {
//           const rate = new Decimal(tax.rate).dividedBy(100)
//           const taxLine = lineTotal.times(rate)
//           taxAmount = taxAmount.plus(taxLine)
//         }
//       }
//     }

//     const invoice = await tx.invoice.create({
//       data: {
//         invoiceNumber: data.invoiceNumber || `INV-${Date.now()}`,
//         companyId: data.companyId,
//         customerId: data.customerId,
//         date: data.date,
//         dueDate: data.dueDate,
//         status: 'PENDING',
//         totalAmount: parseFloat(totalAmount.toFixed(2)),
//         taxAmount: parseFloat(taxAmount.toFixed(2))
//       }
//     })

//     for (const it of data.items) {
//       const lineTotal = new Decimal(it.quantity).times(new Decimal(it.price))

//       await tx.invoiceItem.create({
//         data: {
//           invoiceId: invoice.id,
//           itemId: it.itemId,
//           productId: it.productId,
//           quantity: it.quantity,
//           price: it.price,
//           taxRateId: it.taxRateId || null,
//           total: parseFloat(lineTotal.toFixed(2))
//         }
//       })

//       const item = await tx.item.findUnique({ where: { id: it.itemId } })
//       if (!item) throw new Error(`Item not found: ${it.itemId}`)
//       if (item.quantity < it.quantity) throw new Error(`Insufficient stock for item ${it.itemId}`)

//       await tx.stockLedger.create({
//         data: {
//           companyId: data.companyId,
//           itemId: it.itemId,
//           type: 'SALE',
//           quantity: it.quantity,
//           note: `Sale - invoice ${invoice.invoiceNumber}`
//         }
//       })

//       await tx.item.update({
//         where: { id: it.itemId },
//         data: { quantity: item.quantity - it.quantity }
//       })
//     }

//     // Create Journal Entries

//     const description = `Invoice ${invoice.invoiceNumber}`

//     await tx.journalEntry.create({
//       data: {
//         companyId: data.companyId,
//         accountId: await getAccountId(tx, data.companyId, 'Accounts Receivable'),
//         date: data.date,
//         description,
//         debit: parseFloat(totalAmount.plus(taxAmount).toFixed(2)),
//         credit: 0
//       }
//     })

//     await tx.journalEntry.create({
//       data: {
//         companyId: data.companyId,
//         accountId: await getAccountId(tx, data.companyId, 'Sales Revenue'),
//         date: data.date,
//         description,
//         debit: 0,
//         credit: parseFloat(totalAmount.toFixed(2))
//       }
//     })

//     if (taxAmount.gt(0)) {
//       await tx.journalEntry.create({
//         data: {
//           companyId: data.companyId,
//           accountId: await getAccountId(tx, data.companyId, 'GST Payable'),
//           date: data.date,
//           description,
//           debit: 0,
//           credit: parseFloat(taxAmount.toFixed(2))
//         }
//       })
//     }

//     return invoice
//   })
// }

async function createInvoice(prisma, data) {
  return prisma.$transaction(async (tx) => {
    let totalAmount = new Decimal(0)
    let totalTax = new Decimal(0)

    // Create invoice first
    const invoice = await tx.invoice.create({
      data: {
        invoiceNumber: data.invoiceNumber || `INV-${Date.now()}`,
        companyId: data.companyId,
        customerId: data.customerId,
        date: data.date,
        dueDate: data.dueDate,
        type: data.type || 'SALE',
        status: 'PENDING',
        totalAmount: 0,
        taxAmount: 0
      }
    })

    // Process each item
    for (const it of data.items) {
      const lineTotal = new Decimal(it.quantity).times(new Decimal(it.price))
      totalAmount = totalAmount.plus(lineTotal)

      let taxAmountForItem = new Decimal(0)
      if (it.taxRateId) {
        const tax = await tx.taxRate.findUnique({ where: { id: it.taxRateId } })
        if (tax) {
          const rate = new Decimal(tax.rate).dividedBy(100)
          taxAmountForItem = lineTotal.times(rate)
          totalTax = totalTax.plus(taxAmountForItem)

          // Track tax in InvoiceTax table
          await tx.invoiceTax.create({
            data: {
              invoiceId: invoice.id,
              taxRateId: tax.id,
              companyId: data.companyId,
              invoiceType: data.type || 'SALE',
              amount: parseFloat(taxAmountForItem.toFixed(2))
            }
          })
        }
      }

      // Create invoice item
      await tx.invoiceItem.create({
        data: {
          invoiceId: invoice.id,
          itemId: it.itemId,
          productId: it.productId,
          quantity: it.quantity,
          price: it.price,
          taxRateId: it.taxRateId || null,
          total: parseFloat(lineTotal.toFixed(2))
        }
      })

      // Update stock
      const item = await tx.item.findUnique({ where: { id: it.itemId } })
      if (!item) throw new Error(`Item not found: ${it.itemId}`)
      if (item.quantity < it.quantity) throw new Error(`Insufficient stock for item ${it.itemId}`)

      await tx.stockLedger.create({
        data: {
          companyId: data.companyId,
          itemId: it.itemId,
          type: 'SALE',
          quantity: it.quantity,
          note: `Sale - invoice ${invoice.invoiceNumber}`
        }
      })

      await tx.item.update({
        where: { id: it.itemId },
        data: { quantity: item.quantity - it.quantity }
      })
    }

    // Update invoice totals
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        taxAmount: parseFloat(totalTax.toFixed(2))
      }
    })

    // Create Journal Entries
    const description = `Invoice ${invoice.invoiceNumber}`

    // Accounts Receivable (Debit)
    await tx.journalEntry.create({
      data: {
        companyId: data.companyId,
        accountId: await getAccountId(tx, data.companyId, 'Accounts Receivable'),
        date: data.date,
        description,
        debit: parseFloat(totalAmount.plus(totalTax).toFixed(2)),
        credit: 0
      }
    })

    // Sales Revenue (Credit)
    await tx.journalEntry.create({
      data: {
        companyId: data.companyId,
        accountId: await getAccountId(tx, data.companyId, 'Sales Revenue'),
        date: data.date,
        description,
        debit: 0,
        credit: parseFloat(totalAmount.toFixed(2))
      }
    })

    // Tax Liability (Credit)
    if (totalTax.gt(0)) {
      await tx.journalEntry.create({
        data: {
          companyId: data.companyId,
          accountId: await getAccountId(tx, data.companyId, 'Tax Payable'),
          date: data.date,
          description,
          debit: 0,
          credit: parseFloat(totalTax.toFixed(2))
        }
      })
    }

    return await tx.invoice.findUnique({
      where: { id: invoice.id },
      include: { items: true, payments: true }
    })
  })
}

async function createPurchaseInvoice(prisma, data) {
  return prisma.$transaction(async (tx) => {
    let totalAmount = new Decimal(0)
    let totalTax = new Decimal(0)

    // Create invoice
    const invoice = await tx.invoice.create({
      data: {
        invoiceNumber: data.invoiceNumber || `PINV-${Date.now()}`,
        companyId: data.companyId,
        vendorId: data.vendorId,
        date: data.date,
        dueDate: data.dueDate,
        type: 'PURCHASE',
        status: 'PENDING',
        totalAmount: 0,
        taxAmount: 0
      }
    })

    for (const it of data.items) {
      const lineTotal = new Decimal(it.quantity).times(new Decimal(it.price))
      totalAmount = totalAmount.plus(lineTotal)

      let taxAmountForItem = new Decimal(0)
      if (it.taxRateId) {
        const tax = await tx.taxRate.findUnique({ where: { id: it.taxRateId } })
        if (tax) {
          const rate = new Decimal(tax.rate).dividedBy(100)
          taxAmountForItem = lineTotal.times(rate)
          totalTax = totalTax.plus(taxAmountForItem)

          await tx.invoiceTax.create({
            data: {
              invoiceId: invoice.id,
              taxRateId: tax.id,
              companyId: data.companyId,
              invoiceType: 'PURCHASE',
              amount: parseFloat(taxAmountForItem.toFixed(2))
            }
          })
        }
      }

      let itemId = it.itemId
      let productId = it.productId

      if (!itemId && productId) {
        const product = await tx.product.findUnique({ where: { id: productId } })
        if (!product) throw new Error(`Product not found: ${productId}`)

        const newItem = await tx.item.create({
          data: {
            companyId: data.companyId,
            productId: product.id,
            location: it.location,
            sku: it.sku,
            quantity: 0,
            price: it.price
          }
        })
        itemId = newItem.id

      } else if (!itemId && !productId) {
        if (!it.productData) throw new Error('productData is required when productId is missing')

        const newProduct = await tx.product.create({
          data: {
            companyId: data.companyId,
            name: it.productData.name,
            sku: it.productData.sku,
            description: it.productData.description,
            categoryId: it.categoryId || null,
            subCategoryId: it.subCategoryId || null
          }
        })
        productId = newProduct.id

        const newItem = await tx.item.create({
          data: {
            companyId: data.companyId,
            productId: newProduct.id,
            location: it.location,
            sku: it.sku || it.productData.sku,
            quantity: 0,
            price: it.price
          }
        })
        itemId = newItem.id
      }

      // Create invoice item
      await tx.invoiceItem.create({
        data: {
          invoiceId: invoice.id,
          itemId,
          productId,
          quantity: it.quantity,
          price: it.price,
          taxRateId: it.taxRateId || null,
          total: parseFloat(lineTotal.toFixed(2))
        }
      })

      // Update stock

      // const item = await tx.item.findUnique({ where: { id: itemId } })
      // if (!item) throw new Error(`Item not found: ${itemId}`)

      // await tx.stockLedger.create({
      //   data: {
      //     companyId: data.companyId,
      //     itemId,
      //     type: 'PURCHASE',
      //     quantity: it.quantity,
      //     note: `Purchase - invoice ${invoice.invoiceNumber}`
      //   }
      // })

      // await tx.item.update({
      //   where: { id: itemId },
      //   data: { quantity: item.quantity + it.quantity }
      // })
    }

    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        taxAmount: parseFloat(totalTax.toFixed(2))
      }
    })

    const description = `Purchase Invoice ${invoice.invoiceNumber}`

    // Purchases (Debit)
    await tx.journalEntry.create({
      data: {
        companyId: data.companyId,
        accountId: await getAccountId(tx, data.companyId, 'Purchases'),
        date: data.date,
        description,
        debit: parseFloat(totalAmount.toFixed(2)),
        credit: 0
      }
    })

    // Tax Receivable (Debit)
    if (totalTax.gt(0)) {
      await tx.journalEntry.create({
        data: {
          companyId: data.companyId,
          accountId: await getAccountId(tx, data.companyId, 'Tax Receivable'),
          date: data.date,
          description,
          debit: parseFloat(totalTax.toFixed(2)),
          credit: 0
        }
      })
    }

    // Accounts Payable (Credit)
    await tx.journalEntry.create({
      data: {
        companyId: data.companyId,
        accountId: await getAccountId(tx, data.companyId, 'Accounts Payable'),
        date: data.date,
        description,
        debit: 0,
        credit: parseFloat(totalAmount.plus(totalTax).toFixed(2))
      }
    })

    return await tx.invoice.findUnique({
      where: { id: invoice.id },
      include: { items: true }
    })
  })
}

async function getAccountId(tx, companyId, accountName) {
  const acc = await tx.account.findFirst({
    where: { companyId, name: accountName }
  })
  if (!acc) throw new Error(`Account not found: ${accountName}`)
  return acc.id
}

module.exports = { createInvoice, createPurchaseInvoice, getAccountId }
