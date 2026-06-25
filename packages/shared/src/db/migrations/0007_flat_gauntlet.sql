ALTER TABLE "form_submissions" ADD COLUMN "review_html" text;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD COLUMN "review_edits" jsonb;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD COLUMN "review_status" text;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD COLUMN "pdf_ref" text;