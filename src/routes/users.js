'use strict'
const userService = require('../services/userService')
const { enqueueUserRegistrationEmail } = require("../services/emailServices");
const { comparePassword } = require('../utils/hash')
const { generateApiKey } = require('../utils/keyGenerator')
const { generateShortTenant, getShortName } = require('../utils/tenant')
const bcrypt = require('bcrypt');
const checkRole = require('../utils/checkRole')
const { create_license } = require('../services/licenses')

module.exports = async function (fastify, opts) {

  function generateRandomPassword(length = 10) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$&!";
    let password = "";
    for (let i = 0; i < length; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  fastify.post("/register", async (request, reply) => {
    try {
      const {
        password,
        company: companyData
      } = request.body;

      const { primaryEmail, primaryPhoneNo } = companyData;

      const existingEmail = await fastify.prisma.user.findMany({
        where: { email: { in: [primaryEmail] } }
      });

      if (existingEmail.length > 0) {
        return reply.send({ statusCode: "02", message: "Email already registered" });
      }

      // const existingMobile = await fastify.prisma.user.findMany({
      //   where: { email: { in: [primaryPhoneNo] } }
      // });

      // if (existingMobile.length > 0) {
      //   return reply.send({ statusCode: "02", message: "Mobile already registered" });
      // }

      const currency = await fastify.prisma.currency.findUnique({
        where: { id: companyData.currencyId }
      });

      if (!currency) {
        return reply.send({ statusCode: "01", message: "Invalid currencyId" });
      }

      const company = await fastify.prisma.company.create({
        data: {
          name: companyData.name,
          gstNumber: companyData.gstNumber || null,
          primaryEmail,
          primaryPhoneNo,
          addressLine1: companyData.addressLine1,
          addressLine2: companyData.addressLine2,
          addressLine3: companyData.addressLine3,
          city: companyData.city,
          state: companyData.state,
          pincode: Number(companyData.pincode),
          companyType: companyData.companyType,
          currencyId: companyData.currencyId,
          shortname: await generateShortTenant(companyData.name),
          tenant: companyData.tenant,
          publicapiKey: generateApiKey(),
          privateapiKey: generateApiKey()
        }
      });

      const branch = await fastify.prisma.branch.create({
        data: {
          name: `${company.name} Main Branch`,
          companyId: company.id,
          type: "MAIN",
          main: true,
          addressLine1: company.addressLine1,
          addressLine2: company.addressLine2,
          addressLine3: company.addressLine3,
          city: company.city,
          state: company.state,
          pincode: company.pincode
        }
      });

      const defaultAccounts = [
        { name: 'Cash', type: 'ASSET', code: '1000' },
        { name: 'Bank', type: 'ASSET', code: '1010' },
        { name: 'Accounts Receivable', type: 'ASSET', code: '1100' },
        { name: 'Inventory', type: 'ASSET', code: '1200' },
        { name: 'Tax Receivable', type: 'ASSET', code: '1300' },
        { name: 'Accounts Payable', type: 'LIABILITY', code: '2000' },
        { name: 'Tax Payable', type: 'LIABILITY', code: '2100' },
        { name: 'Owner Equity', type: 'EQUITY', code: '3000' },
        { name: 'Sales Revenue', type: 'INCOME', code: '4000' },
        { name: 'Purchases', type: 'EXPENSE', code: '5000' },
        { name: 'Rent Expense', type: 'EXPENSE', code: '5001' },
        { name: 'Salaries Expense', type: 'EXPENSE', code: '5100' },
        { name: 'Utilities Expense', type: 'EXPENSE', code: '5200' },
      ];
      await fastify.prisma.account.createMany({
        data: defaultAccounts.map(a => ({ ...a, companyId: company.id }))
      });

      // generate password for branch admin
      const branchPassword = generateRandomPassword();

      const hashedBranchPassword = await bcrypt.hash(branchPassword, 10);

      const hashedPassword = await bcrypt.hash(password, 10);

      const adminUser = await fastify.prisma.user.create({
        data: {
          email: primaryEmail,
          password: hashedPassword,
          name: `${company.name} Admin`,
          role: "ADMIN",
          companyId: company.id,
          branchId: null
        }
      });

      const storeUser = await fastify.prisma.user.create({
        data: {
          email: secondaryEmail,
          password: hashedBranchPassword,
          name: `${company.name} Store Admin`,
          role: "BRANCHADMIN",
          companyId: company.id,
          branchId: branch.id,
        }
      });

      await enqueueUserRegistrationEmail({
        to: primaryEmail,
        name: company.name,
        role: "ADMIN",
        email: primaryEmail,
        mobile_no: primaryPhoneNo,
        password: password,
      });

      // await create_license(fastify.prisma, {
      //   companyID: company.id,
      //   plan: '001',
      //   expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
      // })

      await enqueueUserRegistrationEmail({
        to: secondaryEmail,
        name: branch.name,
        role: "BRANCHADMIN",
        email: secondaryEmail,
        mobile_no: secondaryPhoneNo,
        password: branchPassword,
      });

      return reply.send({
        statusCode: "00",
        message: "Company, branch & users created successfully",
        data: {
          company,
          branch,
          adminUser,
        }
      });

    } catch (err) {
      request.log.error(err);
      return reply.send({
        statusCode: "99",
        message: "Internal server error",
        error: err.message
      });
    }
  });

  // Old Register

  //   fastify.post("/register", async (request, reply) => {
  //   try {
  //     const {
  //       password,
  //       company: companyData
  //     } = request.body;

  //     const { primaryEmail, secondaryEmail, primaryPhoneNo, secondaryPhoneNo } = companyData;

  //     const existingUsers = await fastify.prisma.user.findMany({
  //       where: { email: { in: [primaryEmail, secondaryEmail] } }
  //     });

  //     if (existingUsers.length > 0) {
  //       return reply.send({ statusCode: "02", message: "One or both emails already registered" });
  //     }

  //     const currency = await fastify.prisma.currency.findUnique({
  //       where: { id: companyData.currencyId }
  //     });

  //     if (!currency) {
  //       return reply.send({ statusCode: "01", message: "Invalid currencyId" });
  //     }

  //     const company = await fastify.prisma.company.create({
  //       data: {
  //         name: companyData.name,
  //         gstNumber: companyData.gstNumber || null,
  //         primaryEmail,
  //         secondaryEmail,
  //         primaryPhoneNo,
  //         secondaryPhoneNo,
  //         addressLine1: companyData.addressLine1,
  //         addressLine2: companyData.addressLine2,
  //         addressLine3: companyData.addressLine3,
  //         city: companyData.city,
  //         state: companyData.state,
  //         pincode: Number(companyData.pincode),
  //         companyType: companyData.companyType,
  //         currencyId: companyData.currencyId,
  //         shortname: await generateShortTenant(companyData.name),
  //         tenant: await getShortName(companyData.name),
  //         publicapiKey: generateApiKey(),
  //         privateapiKey: generateApiKey()
  //       }
  //     });

  //     const branch = await fastify.prisma.branch.create({
  //       data: {
  //         name: `${company.name} Main Branch`,
  //         companyId: company.id,
  //         addressLine1: company.addressLine1,
  //         addressLine2: company.addressLine2,
  //         addressLine3: company.addressLine3,
  //         city: company.city,
  //         state: company.state,
  //         pincode: company.pincode
  //       }
  //     });

  //     const defaultAccounts = [
  //       { name: 'Cash', type: 'ASSET', code: '1000' },
  //       { name: 'Bank', type: 'ASSET', code: '1010' },
  //       { name: 'Accounts Receivable', type: 'ASSET', code: '1100' },
  //       { name: 'Inventory', type: 'ASSET', code: '1200' },
  //       { name: 'Tax Receivable', type: 'ASSET', code: '1300' },
  //       { name: 'Accounts Payable', type: 'LIABILITY', code: '2000' },
  //       { name: 'Tax Payable', type: 'LIABILITY', code: '2100' },
  //       { name: 'Owner Equity', type: 'EQUITY', code: '3000' },
  //       { name: 'Sales Revenue', type: 'INCOME', code: '4000' },
  //       { name: 'Purchases', type: 'EXPENSE', code: '5000' },
  //       { name: 'Rent Expense', type: 'EXPENSE', code: '5001' },
  //       { name: 'Salaries Expense', type: 'EXPENSE', code: '5100' },
  //       { name: 'Utilities Expense', type: 'EXPENSE', code: '5200' },
  //     ];
  //     await fastify.prisma.account.createMany({
  //       data: defaultAccounts.map(a => ({ ...a, companyId: company.id }))
  //     });

  //     // generate password for branch admin
  //     const branchPassword = generateRandomPassword();

  //     const hashedBranchPassword = await bcrypt.hash(branchPassword, 10);

  //     const hashedPassword = await bcrypt.hash(password, 10);

  //     const adminUser = await fastify.prisma.user.create({
  //       data: {
  //         email: primaryEmail,
  //         password: hashedPassword,
  //         name: `${company.name} Admin`,
  //         role: "ADMIN",
  //         companyId: company.id,
  //         branchId: null
  //       }
  //     });

  //     const storeUser = await fastify.prisma.user.create({
  //       data: {
  //         email: secondaryEmail,
  //         password: hashedBranchPassword,
  //         name: `${company.name} Store Admin`,
  //         role: "BRANCHADMIN",
  //         companyId: company.id,
  //         branchId: branch.id,
  //       }
  //     });

  //     await enqueueUserRegistrationEmail({
  //       to: primaryEmail,
  //       name: company.name,
  //       role: "ADMIN",
  //       email: primaryEmail,
  //       mobile_no: primaryPhoneNo,
  //       password: password,
  //     });

  //     // await enqueueUserRegistrationEmail({
  //     //   to: secondaryEmail,
  //     //   name: branch.name,
  //     //   role: "BRANCHADMIN",
  //     //   email: secondaryEmail,
  //     //   mobile_no: secondaryPhoneNo,
  //     //   password: branchPassword,
  //     // });

  //     return reply.send({
  //       statusCode: "00",
  //       message: "Company, branch & users created successfully",
  //       data: {
  //         company,
  //         branch,
  //         adminUser,
  //         storeUser
  //       }
  //     });

  //   } catch (err) {
  //     request.log.error(err);
  //     return reply.send({
  //       statusCode: "99",
  //       message: "Internal server error",
  //       error: err.message
  //     });
  //   }
  // });


  fastify.get("/check-tenant", async (request, reply) => {
    const { tenant } = request.query

    if (!tenant || tenant.length < 3) {
      return reply.send({ available: false })
    }

    const existing = await fastify.prisma.company.findUnique({
      where: { tenant }
    })

    return reply.send({
      available: !existing
    })
  })

  // Login
  fastify.post('/login', {
    schema: {
      tags: ['Auth'],
      summary: 'Login user and get JWT token',
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { email, password } = request.body
      const user = await userService.findByEmail(fastify.prisma, email)
      if (!user) return reply.code(401).send({ statusCode: 401, message: 'Invalid credentials' })

      const ok = await comparePassword(password, user.password)
      if (!ok) return reply.code(401).send({ statusCode: 401, message: 'Invalid credentials' })

      const token = fastify.jwt.sign({
        id: user.id,
        role: user.role,
        companyId: user.companyId,
        branchId: user.branchId || null,
      })

      return reply.code(200).send({
        statusCode: 200,
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          companyId: user.companyId,
          company: user.company,
          branchId: user.branchId || null,
        },
      })
    } catch (err) {
      return reply.code(500).send({ statusCode: 500, message: err.message })
    }
  })

  fastify.get('/currencies', {
    schema: {
      tags: ['Auth'],
      summary: 'Fetch currency options for registration page'
    }
  }, async (request, reply) => {
    try {
      const currencies = await fastify.prisma.currency.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          code: true,
          name: true,
          symbol: true,
          country: true,
        },
      });

      return reply.code(200).send({
        statusCode: 200,
        message: "Currencies fetched successfully",
        data: currencies
      });

    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({
        statusCode: 500,
        message: "Internal server error",
        error: err.message
      });
    }
  });

  // List Users
  fastify.get('/', {
    preHandler: checkRole("ADMIN"),
    schema: {
      tags: ['Auth'],
      summary: 'Get all users',
    }
  }, async (request, reply) => {
    try {
      const users = await userService.listUsers(fastify.prisma, request.user.id, { skip: 0, take: 100 })
      users.forEach(u => { u.password = undefined })

      return reply.code(200).send({
        statusCode: 200,
        message: 'Users fetched successfully',
        data: users
      })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({
        statusCode: 500,
        message: 'Internal server error',
        error: err.message
      })
    }
  })

  // Get current user
  fastify.get('/me', {
    preHandler: checkRole("ADMIN", "BRANCHADMIN"),
    schema: {
      tags: ['Auth'],
      summary: 'Get currently authenticated user',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    try {
      const user = await fastify.prisma.user.findUnique({
        where: { id: request.user.id },
        include: {
          company: {
            include: { currency: true }
          }
        },
      })

      if (!user) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'User not found',
        })
      }

      user.password = undefined

      return reply.code(200).send({
        statusCode: 200,
        message: 'User fetched successfully',
        user,
      })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({
        statusCode: 500,
        message: 'Internal server error',
        error: err.message,
      })
    }
  })

  // ⚠️ DANGER: Deletes EVERYTHING (no auth). Use only in dev!
  fastify.delete('/delete-all-users', async (request, reply) => {
    try {
      await fastify.prisma.$transaction(async (tx) => {
        // 1) Child-most tables (no FK refs outward)
        await tx.stockLedger.deleteMany({});
        await tx.invoiceItem.deleteMany({});
        await tx.invoiceTax.deleteMany({});
        await tx.payment.deleteMany({});
        await tx.cartItem.deleteMany({});

        // 2) Invoices & carts (depend on company + customer/vendor)
        await tx.invoice.deleteMany({});
        await tx.cart.deleteMany({});
        await tx.journalEntry.deleteMany({});

        // 3) Break self-references (FK loops)
        await tx.account.updateMany({ data: { parentId: null } });
        await tx.category.updateMany({ data: { parentId: null } });

        // 4) Inventory/product trees
        await tx.item.deleteMany({});
        await tx.product.deleteMany({});
        await tx.category.deleteMany({});

        // 5) Company-attached masters
        await tx.taxRate.deleteMany({});
        await tx.customer.deleteMany({});
        await tx.vendor.deleteMany({});
        await tx.branch.deleteMany({});
        await tx.account.deleteMany({});

        // 6) Companies and finally users
        await tx.company.deleteMany({});
        await tx.user.deleteMany({});
      });

      return reply.code(200).send({
        statusCode: '00',
        message: 'All users and related company data deleted successfully'
      });
    } catch (err) {
      request.log.error(err);

      return reply.code(500).send({
        statusCode: '99',
        message: 'Internal server error while deleting users',
        error: err.message
      });
    }
  });
}