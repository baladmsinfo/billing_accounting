-- CreateEnum
CREATE TYPE "public"."ShippingMode" AS ENUM ('OWN', 'FULFILLMENT');

-- AlterTable
ALTER TABLE "public"."InvoiceItem" ADD COLUMN     "deliveryRemarks" TEXT,
ADD COLUMN     "fulfillmentProviderId" TEXT,
ADD COLUMN     "shippingMode" "public"."ShippingMode",
ADD COLUMN     "trackingNumber" TEXT,
ADD COLUMN     "vehicleNumber" TEXT;

-- CreateTable
CREATE TABLE "public"."FulfillmentProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "companyId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FulfillmentProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OwnShipping" (
    "id" TEXT NOT NULL,
    "invoiceItemId" TEXT NOT NULL,
    "courierPartner" TEXT NOT NULL,
    "courierContact" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnShipping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FulfillmentProvider_name_companyId_key" ON "public"."FulfillmentProvider"("name", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "OwnShipping_invoiceItemId_key" ON "public"."OwnShipping"("invoiceItemId");

-- AddForeignKey
ALTER TABLE "public"."FulfillmentProvider" ADD CONSTRAINT "FulfillmentProvider_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InvoiceItem" ADD CONSTRAINT "InvoiceItem_fulfillmentProviderId_fkey" FOREIGN KEY ("fulfillmentProviderId") REFERENCES "public"."FulfillmentProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OwnShipping" ADD CONSTRAINT "OwnShipping_invoiceItemId_fkey" FOREIGN KEY ("invoiceItemId") REFERENCES "public"."InvoiceItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
