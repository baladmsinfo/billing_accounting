'use strict'

/**
 * Resolve the branch a request acts on.
 *
 * Order: explicit `branchId` (must belong to the company) → the caller's own
 * branch (BRANCHADMIN tokens) → the company's MAIN branch → any branch.
 * Company-level ADMIN users have no branchId on their token, so without the
 * fallbacks Prisma receives `id: undefined/null` and throws.
 *
 * Returns `{ branch }` on success or `{ error, status }` when nothing matches.
 */
async function resolveBranch(prisma, { companyId, branchId, userBranchId }) {
  if (branchId) {
    const branch = await prisma.branch.findFirst({ where: { id: branchId, companyId } })
    if (!branch) {
      return { status: 404, error: `Branch with id "${branchId}" not found for this company` }
    }
    return { branch }
  }

  if (userBranchId) {
    const branch = await prisma.branch.findFirst({ where: { id: userBranchId, companyId } })
    if (branch) return { branch }
  }

  const branch =
    (await prisma.branch.findFirst({
      where: { companyId, OR: [{ main: true }, { type: 'MAIN' }] },
      orderBy: { createdAt: 'asc' },
    })) ||
    (await prisma.branch.findFirst({ where: { companyId }, orderBy: { createdAt: 'asc' } }))

  if (!branch) {
    return {
      status: 404,
      error: 'No branch found for this company. Please create a branch first or pass branchId in the request.',
    }
  }
  return { branch }
}

module.exports = resolveBranch
