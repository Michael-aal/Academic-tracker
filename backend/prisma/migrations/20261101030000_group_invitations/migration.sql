CREATE TABLE "group_invitations" (
  "id" TEXT NOT NULL,
  "group_id" TEXT NOT NULL,
  "invited_user_id" TEXT NOT NULL,
  "invited_by_id" TEXT NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "group_invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "group_invitations_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "study_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "group_invitations_invited_user_id_fkey" FOREIGN KEY ("invited_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "group_invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "group_invitations_not_self" CHECK ("invited_user_id" <> "invited_by_id")
);
CREATE UNIQUE INDEX "group_invitations_group_id_invited_user_id_key" ON "group_invitations"("group_id","invited_user_id");
CREATE INDEX "group_invitations_invited_user_id_status_created_at_idx" ON "group_invitations"("invited_user_id","status","created_at");
