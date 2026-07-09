CREATE TABLE "pub_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"broker_id" uuid NOT NULL,
	"batch_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"file_name" text NOT NULL,
	"image_base64" text NOT NULL,
	"image_mime_type" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"findings" jsonb,
	"qualification" jsonb,
	"error_message" text,
	"review_html" text,
	"review_edits" jsonb,
	"review_status" text,
	"pdf_ref" text,
	"pdf_base64" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pub_audits" ADD CONSTRAINT "pub_audits_broker_id_brokers_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."brokers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_pub_audits_broker" ON "pub_audits" USING btree ("broker_id");--> statement-breakpoint
CREATE INDEX "idx_pub_audits_batch" ON "pub_audits" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "idx_pub_audits_status" ON "pub_audits" USING btree ("status");