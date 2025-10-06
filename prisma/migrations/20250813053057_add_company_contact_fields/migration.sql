/*
  Warnings:

  - Added the required column `addressLine1` to the `Company` table without a default value. This is not possible if the table is not empty.
  - Added the required column `city` to the `Company` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyType` to the `Company` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pincode` to the `Company` table without a default value. This is not possible if the table is not empty.
  - Added the required column `primaryEmail` to the `Company` table without a default value. This is not possible if the table is not empty.
  - Added the required column `primaryPhoneNo` to the `Company` table without a default value. This is not possible if the table is not empty.
  - Added the required column `state` to the `Company` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Company" ADD COLUMN     "addressLine1" TEXT NOT NULL,
ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "addressLine3" TEXT,
ADD COLUMN     "city" TEXT NOT NULL,
ADD COLUMN     "companyType" TEXT NOT NULL,
ADD COLUMN     "pincode" INTEGER NOT NULL,
ADD COLUMN     "primaryEmail" TEXT NOT NULL,
ADD COLUMN     "primaryPhoneNo" TEXT NOT NULL,
ADD COLUMN     "secondaryEmail" TEXT,
ADD COLUMN     "secondaryPhoneNo" TEXT,
ADD COLUMN     "state" TEXT NOT NULL;
