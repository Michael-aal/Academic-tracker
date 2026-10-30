ALTER TABLE "users" ADD COLUMN "session_version" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "user_data_records" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "record_id" VARCHAR(120) NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_data_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_data_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "user_data_records_user_id_kind_record_id_key" ON "user_data_records"("user_id", "kind", "record_id");
CREATE INDEX "user_data_records_user_id_kind_updated_at_idx" ON "user_data_records"("user_id", "kind", "updated_at");
