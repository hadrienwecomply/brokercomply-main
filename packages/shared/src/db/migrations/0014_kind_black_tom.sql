CREATE TABLE "pub_audit_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"broker_id" uuid NOT NULL,
	"check_id" text NOT NULL,
	"field" text NOT NULL,
	"value_llm" text,
	"value_officer" text,
	"correction_note" text,
	"catalog_version" text,
	"promoted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pub_check_guidance" (
	"check_id" text PRIMARY KEY NOT NULL,
	"reformulations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"consigne" text,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pub_audits" ADD COLUMN "accompanying_text" text;--> statement-breakpoint
ALTER TABLE "pub_audits" ADD COLUMN "landing_url" text;--> statement-breakpoint
ALTER TABLE "pub_audit_feedback" ADD CONSTRAINT "pub_audit_feedback_audit_id_pub_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."pub_audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pub_audit_feedback" ADD CONSTRAINT "pub_audit_feedback_broker_id_brokers_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."brokers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_pub_audit_feedback_check" ON "pub_audit_feedback" USING btree ("check_id");--> statement-breakpoint
CREATE INDEX "idx_pub_audit_feedback_audit" ON "pub_audit_feedback" USING btree ("audit_id");