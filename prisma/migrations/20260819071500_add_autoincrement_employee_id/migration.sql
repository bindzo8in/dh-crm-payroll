-- AlterTable
CREATE SEQUENCE IF NOT EXISTS user_employeeid_seq;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "employeeId" INTEGER NOT NULL DEFAULT nextval('user_employeeid_seq');
ALTER SEQUENCE user_employeeid_seq OWNED BY "user"."employeeId";

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "user_employeeId_key" ON "user"("employeeId");
