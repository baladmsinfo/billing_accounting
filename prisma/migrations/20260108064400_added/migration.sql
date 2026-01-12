/*
  Warnings:

  - The values [CANCELLED,RETURNED] on the enum `InvoiceStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "public"."FulfillmentStatus" AS ENUM ('ORDERED', 'PROCESSING', 'DELIVERED', 'RETURNED', 'CANCELLED');

-- AlterEnum
BEGIN;
CREATE TYPE "public"."InvoiceStatus_new" AS ENUM ('PENDING', 'PARTIAL', 'PAYLATER', 'PAID', 'REFUND_PROCESSING', 'REFUND_REQUESTED', 'REFUND_PROCESSED');
ALTER TABLE "public"."Invoice" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "public"."Invoice" ALTER COLUMN "status" TYPE "public"."InvoiceStatus_new" USING ("status"::text::"public"."InvoiceStatus_new");
ALTER TYPE "public"."InvoiceStatus" RENAME TO "InvoiceStatus_old";
ALTER TYPE "public"."InvoiceStatus_new" RENAME TO "InvoiceStatus";
DROP TYPE "public"."InvoiceStatus_old";
ALTER TABLE "public"."Invoice" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterTable
ALTER TABLE "public"."Invoice" ADD COLUMN     "fulfillmentStatus" "public"."FulfillmentStatus" NOT NULL DEFAULT 'ORDERED';
