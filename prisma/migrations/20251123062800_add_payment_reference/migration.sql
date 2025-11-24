/*
  Warnings:

  - A unique constraint covering the columns `[gatewayPaymentId]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."Payment" ADD COLUMN     "gatewayPaymentId" TEXT,
ADD COLUMN     "rawResponse" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_gatewayPaymentId_key" ON "public"."Payment"("gatewayPaymentId");
