ALTER TABLE "source_documents" ADD COLUMN "direction" text;--> statement-breakpoint
ALTER TABLE "source_documents" ADD COLUMN "distilled_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_source_documents_distilled_at" ON "source_documents" USING btree ("distilled_at");