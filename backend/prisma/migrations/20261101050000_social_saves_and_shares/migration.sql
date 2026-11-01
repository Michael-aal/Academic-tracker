ALTER TABLE "community_posts" ADD COLUMN "shared_post_id" TEXT;

CREATE TABLE "community_saved_posts" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "post_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "community_saved_posts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "community_saved_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "community_saved_posts_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "community_saved_posts_user_id_post_id_key" ON "community_saved_posts"("user_id", "post_id");
CREATE INDEX "community_saved_posts_user_id_created_at_idx" ON "community_saved_posts"("user_id", "created_at");
CREATE INDEX "community_posts_shared_post_id_idx" ON "community_posts"("shared_post_id");