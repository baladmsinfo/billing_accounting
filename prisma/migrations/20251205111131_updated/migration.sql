/*
  Warnings:

  - You are about to drop the column `address` on the `Branch` table. All the data in the column will be lost.
  - You are about to drop the `BranchItem` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `addressLine1` to the `Branch` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."BranchItem" DROP CONSTRAINT "BranchItem_branchId_fkey";

-- DropForeignKey
ALTER TABLE "public"."BranchItem" DROP CONSTRAINT "BranchItem_itemId_fkey";

-- AlterTable
ALTER TABLE "public"."Branch" DROP COLUMN "address",
ADD COLUMN     "addressLine1" TEXT NOT NULL,
ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "addressLine3" TEXT;

-- DropTable
DROP TABLE "public"."BranchItem";

-- CreateTable
CREATE TABLE "public"."_BranchToItem" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_BranchToItem_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_BranchToItem_B_index" ON "public"."_BranchToItem"("B");

-- AddForeignKey
ALTER TABLE "public"."_BranchToItem" ADD CONSTRAINT "_BranchToItem_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_BranchToItem" ADD CONSTRAINT "_BranchToItem_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
