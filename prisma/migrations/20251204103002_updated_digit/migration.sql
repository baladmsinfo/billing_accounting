/*
  Warnings:

  - You are about to drop the column `decimal_digits` on the `Currency` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Currency" DROP COLUMN "decimal_digits",
ADD COLUMN     "decimalDigits" INTEGER;
