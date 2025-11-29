/*
  Warnings:

  - You are about to drop the `_ItemTaxRates` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."_ItemTaxRates" DROP CONSTRAINT "_ItemTaxRates_A_fkey";

-- DropForeignKey
ALTER TABLE "public"."_ItemTaxRates" DROP CONSTRAINT "_ItemTaxRates_B_fkey";

-- AlterTable
ALTER TABLE "public"."Item" ADD COLUMN     "taxRateId" TEXT;

-- DropTable
DROP TABLE "public"."_ItemTaxRates";

-- AddForeignKey
ALTER TABLE "public"."Item" ADD CONSTRAINT "Item_taxRateId_fkey" FOREIGN KEY ("taxRateId") REFERENCES "public"."TaxRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
