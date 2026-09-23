-- CreateEnum
CREATE TYPE "RescheduleStatus" AS ENUM ('pending', 'approved', 'declined');

-- CreateTable
CREATE TABLE "RescheduleRequest" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "requestedDate" DATE NOT NULL,
    "status" "RescheduleStatus" NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "RescheduleRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RescheduleRequest_status_idx" ON "RescheduleRequest"("status");

-- AddForeignKey
ALTER TABLE "RescheduleRequest" ADD CONSTRAINT "RescheduleRequest_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
