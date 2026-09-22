-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'sent', 'paid', 'payment_failed', 'refunded', 'void');

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_visitId_fkey";

-- AlterTable
ALTER TABLE "Notification" ALTER COLUMN "visitId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "invoiceId" TEXT;

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'draft',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "paidNote" TEXT,
    "stripeCheckoutSessionId" TEXT,
    "checkoutUrl" TEXT,
    "checkoutExpiresAt" TIMESTAMP(3),
    "stripePaymentIntentId" TEXT,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_stripeCheckoutSessionId_key" ON "Invoice"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_stripePaymentIntentId_key" ON "Invoice"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "Invoice_propertyId_status_idx" ON "Invoice"("propertyId", "status");

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_amount_nonnegative" CHECK ("amountCents" >= 0);
-- Each status carries the timestamp that put it there.
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_status_stamped" CHECK (
  ("status" = 'draft') OR
  ("status" = 'sent' AND "sentAt" IS NOT NULL) OR
  ("status" = 'paid' AND "paidAt" IS NOT NULL) OR
  ("status" = 'payment_failed' AND "failedAt" IS NOT NULL) OR
  ("status" = 'refunded' AND "refundedAt" IS NOT NULL) OR
  ("status" = 'void' AND "voidedAt" IS NOT NULL)
);
