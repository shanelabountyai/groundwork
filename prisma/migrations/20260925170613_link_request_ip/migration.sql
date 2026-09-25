-- AlterTable
ALTER TABLE "LoginToken" ADD COLUMN     "requestIp" TEXT;

-- AlterTable
ALTER TABLE "PortalToken" ADD COLUMN     "requestIp" TEXT;

-- CreateIndex
CREATE INDEX "LoginToken_requestIp_createdAt_idx" ON "LoginToken"("requestIp", "createdAt");

-- CreateIndex
CREATE INDEX "PortalToken_requestIp_createdAt_idx" ON "PortalToken"("requestIp", "createdAt");

-- SEC-04: portal phone sign-in matches on digits only (src/portal/session.ts `digits`).
-- Expression index, not in schema.prisma: Prisma cannot model it.
CREATE INDEX "Property_customerPhone_digits_idx" ON "Property" ((regexp_replace(regexp_replace("customerPhone", '\D', '', 'g'), '^1(\d{10})$', '\1')));
