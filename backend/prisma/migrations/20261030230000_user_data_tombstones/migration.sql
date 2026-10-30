-- Preserve deletion markers so stale devices cannot resurrect removed account data.
ALTER TABLE "user_data_records" ADD COLUMN "deleted_at" TIMESTAMP(3);
CREATE INDEX "user_data_records_user_id_kind_deleted_at_idx" ON "user_data_records"("user_id", "kind", "deleted_at");
