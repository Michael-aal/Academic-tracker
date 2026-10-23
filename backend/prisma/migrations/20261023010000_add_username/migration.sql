ALTER TABLE "users" ADD COLUMN "username" VARCHAR(30);

UPDATE "users"
SET "username" =
  COALESCE(
    NULLIF(LEFT(regexp_replace(lower(split_part("email", '@', 1)), '[^a-z0-9_]', '', 'g'), 20), ''),
    'student'
  ) || '_' || substr(md5("id"), 1, 6);

ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
