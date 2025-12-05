-- AlterTable
ALTER TABLE "public"."Item" ADD COLUMN     "variant" TEXT,
ALTER COLUMN "sku" DROP NOT NULL;
