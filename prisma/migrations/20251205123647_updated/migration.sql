/*
  Warnings:

  - You are about to drop the `_BranchToUser` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."_BranchToUser" DROP CONSTRAINT "_BranchToUser_A_fkey";

-- DropForeignKey
ALTER TABLE "public"."_BranchToUser" DROP CONSTRAINT "_BranchToUser_B_fkey";

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "branchId" TEXT;

-- DropTable
DROP TABLE "public"."_BranchToUser";

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
