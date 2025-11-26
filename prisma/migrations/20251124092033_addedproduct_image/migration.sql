/*
  Warnings:

  - You are about to drop the column `productID` on the `images` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."images" DROP CONSTRAINT "images_productID_fkey";

-- AlterTable
ALTER TABLE "public"."images" DROP COLUMN "productID",
ADD COLUMN     "productId" TEXT;

-- AddForeignKey
ALTER TABLE "public"."images" ADD CONSTRAINT "images_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
