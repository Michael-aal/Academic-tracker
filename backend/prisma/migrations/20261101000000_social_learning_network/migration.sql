-- Social learning network. Academic records remain in their existing tables.
CREATE TABLE "community_profiles" (
  "id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "username" VARCHAR(30) NOT NULL,
  "bio" VARCHAR(280), "best_subject" VARCHAR(100), "interests" JSONB,
  "avatar_url" VARCHAR(500), "cover_url" VARCHAR(500),
  "visibility" VARCHAR(16) NOT NULL DEFAULT 'PUBLIC',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "community_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "community_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "community_profiles_user_id_key" ON "community_profiles"("user_id");
CREATE UNIQUE INDEX "community_profiles_username_key" ON "community_profiles"("username");
CREATE INDEX "community_profiles_best_subject_idx" ON "community_profiles"("best_subject");

CREATE TABLE "community_posts" (
  "id" TEXT NOT NULL, "author_id" TEXT NOT NULL, "body" VARCHAR(5000) NOT NULL,
  "media_url" VARCHAR(1000), "video_url" VARCHAR(1000), "subject" VARCHAR(100),
  "visibility" VARCHAR(16) NOT NULL DEFAULT 'PUBLIC',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "community_posts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "community_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "community_posts_created_at_idx" ON "community_posts"("created_at");
CREATE INDEX "community_posts_author_id_created_at_idx" ON "community_posts"("author_id","created_at");
CREATE INDEX "community_posts_subject_created_at_idx" ON "community_posts"("subject","created_at");

CREATE TABLE "community_reactions" (
  "id" TEXT NOT NULL, "post_id" TEXT NOT NULL, "user_id" TEXT NOT NULL,
  "reaction" VARCHAR(16) NOT NULL DEFAULT 'LIKE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "community_reactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "community_reactions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "community_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "community_reactions_post_id_user_id_key" ON "community_reactions"("post_id","user_id");
CREATE INDEX "community_reactions_user_id_created_at_idx" ON "community_reactions"("user_id","created_at");

CREATE TABLE "community_comments" (
  "id" TEXT NOT NULL, "post_id" TEXT NOT NULL, "user_id" TEXT NOT NULL,
  "body" VARCHAR(2000) NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "community_comments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "community_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "community_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "community_comments_post_id_created_at_idx" ON "community_comments"("post_id","created_at");

CREATE TABLE "community_follows" (
  "id" TEXT NOT NULL, "follower_id" TEXT NOT NULL, "following_id" TEXT NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "community_follows_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "community_follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "community_follows_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "community_follows_not_self" CHECK ("follower_id" <> "following_id")
);
CREATE UNIQUE INDEX "community_follows_follower_id_following_id_key" ON "community_follows"("follower_id","following_id");
CREATE INDEX "community_follows_following_id_status_idx" ON "community_follows"("following_id","status");

CREATE TABLE "study_groups" (
  "id" TEXT NOT NULL, "owner_id" TEXT NOT NULL, "title" VARCHAR(100) NOT NULL,
  "description" VARCHAR(1000) NOT NULL, "subject" VARCHAR(100),
  "education_track" VARCHAR(20), "visibility" VARCHAR(16) NOT NULL DEFAULT 'PUBLIC',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "study_groups_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "study_groups_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "study_groups_education_track_subject_created_at_idx" ON "study_groups"("education_track","subject","created_at");

CREATE TABLE "group_memberships" (
  "id" TEXT NOT NULL, "group_id" TEXT NOT NULL, "user_id" TEXT NOT NULL,
  "role" VARCHAR(16) NOT NULL DEFAULT 'MEMBER', "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "group_memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "group_memberships_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "study_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "group_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "group_memberships_group_id_user_id_key" ON "group_memberships"("group_id","user_id");
CREATE INDEX "group_memberships_user_id_status_idx" ON "group_memberships"("user_id","status");

CREATE TABLE "community_stories" (
  "id" TEXT NOT NULL, "author_id" TEXT NOT NULL, "caption" VARCHAR(500),
  "media_url" VARCHAR(1000) NOT NULL, "media_type" VARCHAR(16) NOT NULL DEFAULT 'IMAGE',
  "expires_at" TIMESTAMP(3) NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "community_stories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "community_stories_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "community_stories_expires_at_created_at_idx" ON "community_stories"("expires_at","created_at");
CREATE INDEX "community_stories_author_id_created_at_idx" ON "community_stories"("author_id","created_at");

CREATE TABLE "video_engagements" (
  "id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "video_id" VARCHAR(120) NOT NULL,
  "provider" VARCHAR(20) NOT NULL DEFAULT 'YOUTUBE', "action" VARCHAR(20) NOT NULL,
  "watch_seconds" INTEGER NOT NULL DEFAULT 0, "subject" VARCHAR(100),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "video_engagements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "video_engagements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "video_engagements_user_id_created_at_idx" ON "video_engagements"("user_id","created_at");
CREATE INDEX "video_engagements_user_id_subject_created_at_idx" ON "video_engagements"("user_id","subject","created_at");
CREATE INDEX "video_engagements_video_id_action_idx" ON "video_engagements"("video_id","action");

CREATE TABLE "referral_codes" (
  "id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "code" VARCHAR(24) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "referral_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "referral_codes_user_id_key" ON "referral_codes"("user_id");
CREATE UNIQUE INDEX "referral_codes_code_key" ON "referral_codes"("code");

CREATE TABLE "referrals" (
  "id" TEXT NOT NULL, "inviter_id" TEXT NOT NULL, "referred_user_id" TEXT NOT NULL,
  "code" VARCHAR(24) NOT NULL, "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "qualified_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "referrals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "referrals_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "referrals_referred_user_id_fkey" FOREIGN KEY ("referred_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "referrals_not_self" CHECK ("inviter_id" <> "referred_user_id")
);
CREATE UNIQUE INDEX "referrals_referred_user_id_key" ON "referrals"("referred_user_id");
CREATE INDEX "referrals_inviter_id_created_at_idx" ON "referrals"("inviter_id","created_at");
CREATE INDEX "referrals_status_created_at_idx" ON "referrals"("status","created_at");

CREATE TABLE "referral_rewards" (
  "id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "referral_id" TEXT NOT NULL,
  "points" INTEGER NOT NULL DEFAULT 0, "reward_type" VARCHAR(24) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "referral_rewards_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "referral_rewards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "referral_rewards_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "referrals"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "referral_rewards_referral_id_key" ON "referral_rewards"("referral_id");
CREATE INDEX "referral_rewards_user_id_created_at_idx" ON "referral_rewards"("user_id","created_at");

CREATE TABLE "chat_conversations" (
  "id" TEXT NOT NULL, "kind" VARCHAR(16) NOT NULL DEFAULT 'DIRECT',
  "created_by_id" TEXT NOT NULL, "group_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_conversations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "chat_conversations_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "study_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "chat_conversations_group_id_updated_at_idx" ON "chat_conversations"("group_id","updated_at");

CREATE TABLE "chat_members" (
  "id" TEXT NOT NULL, "conversation_id" TEXT NOT NULL, "user_id" TEXT NOT NULL,
  "last_read_at" TIMESTAMP(3), "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_members_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_members_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "chat_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "chat_members_conversation_id_user_id_key" ON "chat_members"("conversation_id","user_id");
CREATE INDEX "chat_members_user_id_joined_at_idx" ON "chat_members"("user_id","joined_at");

CREATE TABLE "chat_messages" (
  "id" TEXT NOT NULL, "conversation_id" TEXT NOT NULL, "sender_id" TEXT NOT NULL,
  "message_type" VARCHAR(16) NOT NULL DEFAULT 'TEXT', "body" VARCHAR(5000),
  "media_url" VARCHAR(1000), "reply_to_id" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "edited_at" TIMESTAMP(3), "deleted_at" TIMESTAMP(3),
  CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "chat_messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "chat_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "chat_messages_conversation_id_created_at_idx" ON "chat_messages"("conversation_id","created_at");
CREATE INDEX "chat_messages_sender_id_created_at_idx" ON "chat_messages"("sender_id","created_at");

CREATE TABLE "call_sessions" (
  "id" TEXT NOT NULL, "caller_id" TEXT NOT NULL, "callee_id" TEXT NOT NULL,
  "call_type" VARCHAR(12) NOT NULL DEFAULT 'AUDIO', "status" VARCHAR(16) NOT NULL DEFAULT 'RINGING',
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "answered_at" TIMESTAMP(3), "ended_at" TIMESTAMP(3),
  CONSTRAINT "call_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "call_sessions_caller_id_fkey" FOREIGN KEY ("caller_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "call_sessions_callee_id_fkey" FOREIGN KEY ("callee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "call_sessions_callee_id_status_started_at_idx" ON "call_sessions"("callee_id","status","started_at");
CREATE INDEX "call_sessions_caller_id_started_at_idx" ON "call_sessions"("caller_id","started_at");

CREATE TABLE "call_signals" (
  "id" TEXT NOT NULL, "call_id" TEXT NOT NULL, "sender_id" TEXT NOT NULL,
  "kind" VARCHAR(16) NOT NULL, "payload" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "call_signals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "call_signals_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "call_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "call_signals_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "call_signals_call_id_created_at_idx" ON "call_signals"("call_id","created_at");
