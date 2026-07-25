-- Super-admin IP allowlist + login audit
CREATE TABLE IF NOT EXISTS "AdminIpAllowlist" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminIpAllowlist_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdminIpAllowlist_adminId_ip_key" ON "AdminIpAllowlist"("adminId", "ip");
CREATE INDEX IF NOT EXISTS "AdminIpAllowlist_adminId_idx" ON "AdminIpAllowlist"("adminId");

ALTER TABLE "AdminIpAllowlist"
  DROP CONSTRAINT IF EXISTS "AdminIpAllowlist_adminId_fkey";
ALTER TABLE "AdminIpAllowlist"
  ADD CONSTRAINT "AdminIpAllowlist_adminId_fkey"
  FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "LoginAudit" (
    "id" TEXT NOT NULL,
    "adminEmail" TEXT NOT NULL,
    "adminId" TEXT,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT,
    "success" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoginAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LoginAudit_adminEmail_createdAt_idx" ON "LoginAudit"("adminEmail", "createdAt");
CREATE INDEX IF NOT EXISTS "LoginAudit_createdAt_idx" ON "LoginAudit"("createdAt");

ALTER TABLE "LoginAudit"
  DROP CONSTRAINT IF EXISTS "LoginAudit_adminId_fkey";
ALTER TABLE "LoginAudit"
  ADD CONSTRAINT "LoginAudit_adminId_fkey"
  FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
