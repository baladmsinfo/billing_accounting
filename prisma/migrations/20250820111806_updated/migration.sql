/*
  Warnings:

  - You are about to drop the column `paidAmount` on the `InvoiceItem` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Invoice" ADD COLUMN     "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."InvoiceItem" DROP COLUMN "paidAmount";
