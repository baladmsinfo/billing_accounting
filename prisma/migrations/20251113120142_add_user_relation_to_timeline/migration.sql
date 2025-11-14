-- AddForeignKey
ALTER TABLE "public"."InvoiceItemTimeline" ADD CONSTRAINT "InvoiceItemTimeline_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
