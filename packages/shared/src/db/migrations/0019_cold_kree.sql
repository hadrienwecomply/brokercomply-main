CREATE TABLE "pub_custom_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section" text NOT NULL,
	"intitule" text NOT NULL,
	"intitule_key" text NOT NULL,
	"type" text DEFAULT 'principe' NOT NULL,
	"base_legale" text,
	"example_verdict" text,
	"example_citation" text,
	"example_explication" text,
	"example_reformulation" text,
	"occurrences" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"source_audit_id" uuid,
	"broker_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pub_custom_checks" ADD CONSTRAINT "pub_custom_checks_source_audit_id_pub_audits_id_fk" FOREIGN KEY ("source_audit_id") REFERENCES "public"."pub_audits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pub_custom_checks" ADD CONSTRAINT "pub_custom_checks_broker_id_brokers_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."brokers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pub_custom_checks_key" ON "pub_custom_checks" USING btree ("section","intitule_key");--> statement-breakpoint
CREATE INDEX "idx_pub_custom_checks_status" ON "pub_custom_checks" USING btree ("status");