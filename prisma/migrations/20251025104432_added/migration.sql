/*
  Warnings:

  - Made the column `currencyId` on table `Company` required. This step will fail if there are existing NULL values in that column.
  - Made the column `country` on table `Currency` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "public"."Company" DROP CONSTRAINT "Company_currencyId_fkey";

-- AlterTable
ALTER TABLE "public"."Company" ALTER COLUMN "currencyId" SET NOT NULL;

-- AlterTable
ALTER TABLE "public"."Currency" ALTER COLUMN "country" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."Company" ADD CONSTRAINT "Company_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "public"."Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
