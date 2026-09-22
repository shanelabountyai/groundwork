-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "serviceTypeId" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- DropForeignKey
ALTER TABLE "Visit" DROP CONSTRAINT "Visit_agreementId_fkey";

-- AlterTable: add nullable, backfill from the agreement, then require.
ALTER TABLE "Visit" ADD COLUMN "jobId" TEXT,
ADD COLUMN "propertyId" TEXT,
ADD COLUMN "serviceTypeId" TEXT,
ALTER COLUMN "agreementId" DROP NOT NULL;

UPDATE "Visit" v SET "propertyId" = a."propertyId", "serviceTypeId" = a."serviceTypeId"
FROM "Agreement" a WHERE a."id" = v."agreementId";

ALTER TABLE "Visit" ALTER COLUMN "propertyId" SET NOT NULL,
ALTER COLUMN "serviceTypeId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Visit_propertyId_date_idx" ON "Visit"("propertyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Visit_jobId_occurrenceDate_key" ON "Visit"("jobId", "occurrenceDate");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "ServiceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "ServiceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A visit comes from exactly one origin: a recurring agreement or a one-off job.
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_one_origin" CHECK (num_nonnulls("agreementId", "jobId") = 1);
ALTER TABLE "Job" ADD CONSTRAINT "Job_price_nonnegative" CHECK ("priceCents" >= 0);

-- The visit's propertyId/serviceTypeId are a copy of its origin's. Refuse any
-- visit write that disagrees, and any origin edit that would make them disagree.
CREATE FUNCTION visit_matches_origin() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Agreement" a WHERE a."id" = NEW."agreementId"
      AND a."propertyId" = NEW."propertyId" AND a."serviceTypeId" = NEW."serviceTypeId"
    UNION ALL
    SELECT 1 FROM "Job" j WHERE j."id" = NEW."jobId"
      AND j."propertyId" = NEW."propertyId" AND j."serviceTypeId" = NEW."serviceTypeId"
  ) THEN
    RAISE EXCEPTION 'Visit % property/service type does not match its origin', NEW."id" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER "Visit_matches_origin"
  BEFORE INSERT OR UPDATE OF "agreementId", "jobId", "propertyId", "serviceTypeId" ON "Visit"
  FOR EACH ROW EXECUTE FUNCTION visit_matches_origin();

CREATE FUNCTION origin_fixed() RETURNS trigger AS $$
BEGIN
  IF NEW."propertyId" <> OLD."propertyId" OR NEW."serviceTypeId" <> OLD."serviceTypeId" THEN
    RAISE EXCEPTION '% property/service type cannot change once created', TG_TABLE_NAME USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER "Agreement_origin_fixed" BEFORE UPDATE OF "propertyId", "serviceTypeId" ON "Agreement"
  FOR EACH ROW EXECUTE FUNCTION origin_fixed();
CREATE TRIGGER "Job_origin_fixed" BEFORE UPDATE OF "propertyId", "serviceTypeId" ON "Job"
  FOR EACH ROW EXECUTE FUNCTION origin_fixed();
