CREATE TABLE "prospect_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospect_id" uuid NOT NULL,
	"name" text,
	"email" text,
	"phone" text,
	"role" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"societe" text NOT NULL,
	"site_internet" text,
	"verticale" text,
	"language" text,
	"owner" text,
	"source_status" text,
	"broker_id" uuid,
	"pipeline_stage" text DEFAULT 'to_contact' NOT NULL,
	"lost_reason" text,
	"no_show" boolean DEFAULT false NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"mrr" numeric(10, 2),
	"conversion_probability" text,
	"lead_from" text,
	"meeting_date" timestamp with time zone,
	"offer_sent_at" timestamp with time zone,
	"last_reply_at" timestamp with time zone,
	"last_reply_subject" text,
	"reminder_sent_at" timestamp with time zone,
	"called_at" timestamp with time zone,
	"outcome" text,
	"stage" text DEFAULT 'awaiting_reply' NOT NULL,
	"next_action_at" timestamp with time zone,
	"intent" text,
	"intent_confidence" real,
	"intent_quote" text,
	"intent_source" text,
	"intent_updated_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prospect_contacts" ADD CONSTRAINT "prospect_contacts_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_broker_id_brokers_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."brokers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_prospect_contacts_email" ON "prospect_contacts" USING btree ("email") WHERE "prospect_contacts"."email" is not null;--> statement-breakpoint
CREATE INDEX "idx_prospect_contacts_prospect" ON "prospect_contacts" USING btree ("prospect_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_prospects_societe" ON "prospects" USING btree (lower("societe"));--> statement-breakpoint
CREATE INDEX "idx_prospects_stage" ON "prospects" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "idx_prospects_next_action" ON "prospects" USING btree ("stage","next_action_at");--> statement-breakpoint
CREATE INDEX "idx_prospects_pipeline" ON "prospects" USING btree ("pipeline_stage");--> statement-breakpoint
CREATE INDEX "idx_prospects_owner" ON "prospects" USING btree ("owner");