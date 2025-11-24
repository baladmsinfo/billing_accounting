/*
  Warnings:

  - A unique constraint covering the columns `[privateapiKey]` on the table `Company` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[publicapiKey]` on the table `Company` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."Company" ADD COLUMN     "privateapiKey" TEXT,
ADD COLUMN     "publicapiKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Company_privateapiKey_key" ON "public"."Company"("privateapiKey");

-- CreateIndex
CREATE UNIQUE INDEX "Company_publicapiKey_key" ON "public"."Company"("publicapiKey");
