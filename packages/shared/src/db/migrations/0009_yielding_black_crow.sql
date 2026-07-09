CREATE TABLE "website_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"broker_id" uuid NOT NULL,
	"website_url" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"findings" jsonb,
	"constats" jsonb,
	"pages_fetched" jsonb,
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
ALTER TABLE "website_audits" ADD CONSTRAINT "website_audits_broker_id_brokers_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."brokers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_website_audits_broker" ON "website_audits" USING btree ("broker_id");--> statement-breakpoint
CREATE INDEX "idx_website_audits_status" ON "website_audits" USING btree ("status");