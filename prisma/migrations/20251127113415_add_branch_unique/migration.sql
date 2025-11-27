/*
  Warnings:

  - A unique constraint covering the columns `[name,companyId]` on the table `Branch` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Branch_name_companyId_key" ON "public"."Branch"("name", "companyId");
