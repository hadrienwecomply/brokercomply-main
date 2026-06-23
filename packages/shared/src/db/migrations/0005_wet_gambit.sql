CREATE TABLE "form_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"question_id" text NOT NULL,
	"name" text,
	"type" text,
	"value" jsonb,
	"position" real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"broker_id" uuid NOT NULL,
	"fillout_form_id" text NOT NULL,
	"fillout_submission_id" text NOT NULL,
	"form_type" text,
	"submitted_at" timestamp with time zone,
	"match_method" text NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"n8n_execution_id" text,
	"raw_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "form_fields" ADD CONSTRAINT "form_fields_submission_id_form_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."form_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_broker_id_brokers_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."brokers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_form_fields_submission_question" ON "form_fields" USING btree ("submission_id","question_id");--> statement-breakpoint
CREATE INDEX "idx_form_fields_submission" ON "form_fields" USING btree ("submission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_form_submissions_fillout_submission" ON "form_submissions" USING btree ("fillout_submission_id");--> statement-breakpoint
CREATE INDEX "idx_form_submissions_broker" ON "form_submissions" USING btree ("broker_id");--> statement-breakpoint
CREATE INDEX "idx_form_submissions_status" ON "form_submissions" USING btree ("status");