-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('pending', 'generating', 'ready', 'failed');

-- AlterTable
-- ADD COLUMN with a constant DEFAULT is catalog-only on PostgreSQL 11+, so this
-- is not a table rewrite and takes no long lock. It is also backward compatible
-- with the currently-deployed server: Prisma emits explicit column lists on
-- INSERT, so older code simply omits "status" and the default satisfies NOT NULL.
ALTER TABLE "WebsiteProject" ADD COLUMN     "status" "GenerationStatus" NOT NULL DEFAULT 'pending';

-- Backfill: a project that already holds a document is finished.
UPDATE "WebsiteProject" SET "status" = 'ready' WHERE "current_code" IS NOT NULL;

-- Backfill: every code-less row predates this column, so its fire-and-forget
-- job is long over — it either already ran its refund + [generation-failed]
-- catch, or died with an old process and is unrecoverable. Marking it 'failed'
-- here rather than leaving it to the boot sweep is deliberate: the sweep
-- refunds, and routing already-settled historical rows through it would pay
-- some of them a second time.
UPDATE "WebsiteProject" SET "status" = 'failed' WHERE "current_code" IS NULL;

-- CreateIndex
CREATE INDEX "WebsiteProject_status_idx" ON "WebsiteProject"("status");
