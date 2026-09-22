-- Prisma's schema language has no CHECK constraint syntax; ARCH.md §4 calls
-- for these as DB-level checks in addition to the app-level Zod validation.
ALTER TABLE "trades" ADD CONSTRAINT "trades_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "trades" ADD CONSTRAINT "trades_price_positive" CHECK ("price" > 0);
