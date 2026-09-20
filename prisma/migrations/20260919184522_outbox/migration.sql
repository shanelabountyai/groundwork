-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('sms', 'email');

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "to" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_sentAt_idx" ON "Notification"("sentAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
