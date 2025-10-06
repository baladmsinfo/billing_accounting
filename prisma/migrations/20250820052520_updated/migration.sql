/*
  Warnings:

  - A unique constraint covering the columns `[gstin]` on the table `Vendor` will be added. If there are existing duplicate values, this will fail.
  - Made the column `gstin` on table `Vendor` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "public"."Vendor" ADD COLUMN     "address" TEXT,
ALTER COLUMN "gstin" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_gstin_key" ON "public"."Vendor"("gstin");
