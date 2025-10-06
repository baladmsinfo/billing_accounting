/*
  Warnings:

  - You are about to drop the column `paidAmount` on the `Invoice` table. All the data in the column will be lost.
  - You are about to drop the column `paidAmount` on the `InvoiceItem` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Invoice" DROP COLUMN "paidAmount";

-- AlterTable
ALTER TABLE "public"."InvoiceItem" DROP COLUMN "paidAmount";
