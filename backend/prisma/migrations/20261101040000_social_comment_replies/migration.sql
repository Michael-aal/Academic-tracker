ALTER TABLE "community_comments" ADD COLUMN "parent_id" TEXT;
CREATE INDEX "community_comments_parent_id_created_at_idx" ON "community_comments"("parent_id", "created_at");