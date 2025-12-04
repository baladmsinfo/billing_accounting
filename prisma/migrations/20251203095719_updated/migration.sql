-- AlterEnum
ALTER TYPE "public"."InvoiceType" ADD VALUE 'EXPENSE';

-- AlterTable
ALTER TABLE "public"."Cart" ALTER COLUMN "status" SET DEFAULT 'PENDING';
