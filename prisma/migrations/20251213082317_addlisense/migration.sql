/*
  Warnings:

  - A unique constraint covering the columns `[companyId]` on the table `License` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "License_companyId_key" ON "public"."License"("companyId");

-- AddForeignKey
ALTER TABLE "public"."License" ADD CONSTRAINT "License_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
