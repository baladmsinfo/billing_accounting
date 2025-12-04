/*
  Warnings:

  - A unique constraint covering the columns `[tenant]` on the table `Company` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Company_tenant_key" ON "public"."Company"("tenant");
