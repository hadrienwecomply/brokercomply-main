ALTER TABLE "form_submissions" ADD COLUMN "n8n_result" jsonb;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD COLUMN "completed_at" timestamp with time zone;