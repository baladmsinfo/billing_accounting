-- CreateEnum
CREATE TYPE "public"."ProductType" AS ENUM ('POS', 'BILLING');

-- AlterTable
ALTER TABLE "public"."Company" ADD COLUMN     "productType" "public"."ProductType" NOT NULL DEFAULT 'BILLING';
