-- DropForeignKey
ALTER TABLE "public"."Cart" DROP CONSTRAINT "Cart_customerId_fkey";

-- AlterTable
ALTER TABLE "public"."Cart" ALTER COLUMN "customerId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."Cart" ADD CONSTRAINT "Cart_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
