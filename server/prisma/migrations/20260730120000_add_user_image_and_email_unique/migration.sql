-- AlterTable
ALTER TABLE "user" ADD COLUMN     "image" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");
