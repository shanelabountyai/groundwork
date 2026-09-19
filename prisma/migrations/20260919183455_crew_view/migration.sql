-- CreateEnum
CREATE TYPE "SkipReason" AS ENUM ('locked_gate', 'dog_loose', 'customer_request', 'weather', 'other');

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "afterPhoto" TEXT,
ADD COLUMN     "beforePhoto" TEXT,
ADD COLUMN     "finishedAt" TIMESTAMP(3),
ADD COLUMN     "note" TEXT,
ADD COLUMN     "skipReason" "SkipReason",
ADD COLUMN     "startedAt" TIMESTAMP(3);

-- A skip always carries a reason, and only a skip does.
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_skip_reason" CHECK (("status" = 'skipped') = ("skipReason" IS NOT NULL));
-- Outcome timestamps follow status: started once en route, finished once closed.
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_started" CHECK (("status" = 'pending') = ("startedAt" IS NULL) OR "status" = 'skipped');
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_finished" CHECK (("status" IN ('completed', 'skipped')) = ("finishedAt" IS NOT NULL));
