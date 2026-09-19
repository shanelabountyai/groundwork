-- CreateEnum
CREATE TYPE "Frequency" AS ENUM ('weekly', 'biweekly', 'every_4_weeks', 'one_time');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('pending', 'en_route', 'completed', 'skipped');

-- CreateTable
CREATE TABLE "Crew" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "homeLat" DOUBLE PRECISION NOT NULL,
    "homeLng" DOUBLE PRECISION NOT NULL,
    "maxStops" INTEGER NOT NULL,
    "maxMinutes" INTEGER NOT NULL,

    CONSTRAINT "Crew_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL,

    CONSTRAINT "ServiceType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accessNotes" TEXT NOT NULL DEFAULT '',
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerEmail" TEXT,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agreement" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "serviceTypeId" TEXT NOT NULL,
    "crewId" TEXT NOT NULL,
    "frequency" "Frequency" NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "occurrenceDate" DATE NOT NULL,
    "date" DATE NOT NULL,
    "crewId" TEXT NOT NULL,
    "status" "VisitStatus" NOT NULL DEFAULT 'pending',
    "detached" BOOLEAN NOT NULL DEFAULT false,
    "priceCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Crew_name_key" ON "Crew"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceType_name_key" ON "ServiceType"("name");

-- CreateIndex
CREATE INDEX "Visit_crewId_date_idx" ON "Visit"("crewId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Visit_agreementId_occurrenceDate_key" ON "Visit"("agreementId", "occurrenceDate");

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "ServiceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "Crew"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "Crew"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Coordinates are (lat, lng). Range checks turn the classic silent swap into
-- a loud insert failure: a Tulsa point swapped puts latitude at -95.
ALTER TABLE "Property" ADD CONSTRAINT "Property_lat_range" CHECK ("lat" BETWEEN -90 AND 90);
ALTER TABLE "Property" ADD CONSTRAINT "Property_lng_range" CHECK ("lng" BETWEEN -180 AND 180);
ALTER TABLE "Crew" ADD CONSTRAINT "Crew_homeLat_range" CHECK ("homeLat" BETWEEN -90 AND 90);
ALTER TABLE "Crew" ADD CONSTRAINT "Crew_homeLng_range" CHECK ("homeLng" BETWEEN -180 AND 180);

-- Money is integer cents and never negative.
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_priceCents_nonneg" CHECK ("priceCents" >= 0);
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_priceCents_nonneg" CHECK ("priceCents" >= 0);

-- A visit that has not moved sits on its own slot. Only a detached one may differ.
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_attached_on_slot" CHECK ("detached" OR "date" = "occurrenceDate");
