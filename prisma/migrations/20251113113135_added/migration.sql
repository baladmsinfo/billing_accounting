-- AlterEnum
ALTER TYPE "public"."InvoiceItemStatus" ADD VALUE 'RETURNED';

-- CreateTable
CREATE TABLE "public"."InvoiceItemTimeline" (
    "id" TEXT NOT NULL,
    "invoiceItemId" TEXT NOT NULL,
    "oldStatus" TEXT,
    "newStatus" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "userId" TEXT,

    CONSTRAINT "InvoiceItemTimeline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceItemTimeline_invoiceItemId_idx" ON "public"."InvoiceItemTimeline"("invoiceItemId");

-- AddForeignKey
ALTER TABLE "public"."InvoiceItemTimeline" ADD CONSTRAINT "InvoiceItemTimeline_invoiceItemId_fkey" FOREIGN KEY ("invoiceItemId") REFERENCES "public"."InvoiceItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
