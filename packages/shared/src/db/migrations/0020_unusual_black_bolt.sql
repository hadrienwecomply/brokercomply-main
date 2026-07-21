CREATE TABLE "prospect_ai_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospect_id" uuid NOT NULL,
	"message_id" text NOT NULL,
	"intent" text NOT NULL,
	"confidence" real NOT NULL,
	"quote" text,
	"stage_before" text NOT NULL,
	"stage_after" text,
	"status" text NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "stage_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prospect_ai_actions" ADD CONSTRAINT "prospect_ai_actions_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_prospect_ai_actions_prospect" ON "prospect_ai_actions" USING btree ("prospect_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_prospect_ai_actions_status" ON "prospect_ai_actions" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_prospect_ai_actions_message" ON "prospect_ai_actions" USING btree ("message_id");