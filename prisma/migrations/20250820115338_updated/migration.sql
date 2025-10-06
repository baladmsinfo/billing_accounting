-- CreateEnum
CREATE TYPE "public"."InvoiceItemStatus" AS ENUM ('ORDERED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "public"."InvoiceStatus" ADD VALUE 'PAYLATER';

-- AlterTable
ALTER TABLE "public"."InvoiceItem" ADD COLUMN     "status" "public"."InvoiceItemStatus" NOT NULL DEFAULT 'ORDERED';
