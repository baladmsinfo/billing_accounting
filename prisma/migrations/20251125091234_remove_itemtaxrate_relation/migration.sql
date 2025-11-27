-- DropIndex
DROP INDEX "public"."Item_sku_companyId_key";

-- CreateTable
CREATE TABLE "public"."_ItemTaxRates" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ItemTaxRates_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_ItemTaxRates_B_index" ON "public"."_ItemTaxRates"("B");

-- AddForeignKey
ALTER TABLE "public"."_ItemTaxRates" ADD CONSTRAINT "_ItemTaxRates_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_ItemTaxRates" ADD CONSTRAINT "_ItemTaxRates_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."TaxRate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
