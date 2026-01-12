/*
  Warnings:

  - You are about to drop the column `invoiceItemId` on the `OwnShipping` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[courierPartner,courierContact,companyId]` on the table `OwnShipping` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `companyId` to the `OwnShipping` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."OwnShipping" DROP CONSTRAINT "OwnShipping_invoiceItemId_fkey";

-- DropIndex
DROP INDEX "public"."OwnShipping_invoiceItemId_key";

-- AlterTable
ALTER TABLE "public"."InvoiceItem" ADD COLUMN     "ownShippingId" TEXT;

-- AlterTable
ALTER TABLE "public"."OwnShipping" DROP COLUMN "invoiceItemId",
ADD COLUMN     "companyId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "OwnShipping_courierPartner_courierContact_companyId_key" ON "public"."OwnShipping"("courierPartner", "courierContact", "companyId");

-- AddForeignKey
ALTER TABLE "public"."InvoiceItem" ADD CONSTRAINT "InvoiceItem_ownShippingId_fkey" FOREIGN KEY ("ownShippingId") REFERENCES "public"."OwnShipping"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OwnShipping" ADD CONSTRAINT "OwnShipping_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
