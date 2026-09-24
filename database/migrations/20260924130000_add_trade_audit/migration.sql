-- CreateTable
CREATE TABLE "trade_audit" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "changedFields" JSONB NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedBy" TEXT NOT NULL,

    CONSTRAINT "trade_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trade_audit_tradeId_changedAt_idx" ON "trade_audit"("tradeId", "changedAt");

-- AddForeignKey
ALTER TABLE "trade_audit" ADD CONSTRAINT "trade_audit_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "trades"("id") ON DELETE CASCADE ON UPDATE CASCADE;
