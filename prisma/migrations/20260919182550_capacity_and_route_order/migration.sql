-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "routePosition" INTEGER;

-- CreateTable
CREATE TABLE "CapacityOverride" (
    "id" TEXT NOT NULL,
    "crewId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "visitId" TEXT NOT NULL,
    "stops" INTEGER NOT NULL,
    "minutes" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "by" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CapacityOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CapacityOverride_crewId_date_idx" ON "CapacityOverride"("crewId", "date");

-- AddForeignKey
ALTER TABLE "CapacityOverride" ADD CONSTRAINT "CapacityOverride_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "Crew"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
