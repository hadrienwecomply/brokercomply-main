CREATE TABLE "prospect_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospect_id" uuid NOT NULL,
	"title" text NOT NULL,
	"type" text DEFAULT 'call' NOT NULL,
	"due_at" timestamp with time zone,
	"assignee" text,
	"status" text DEFAULT 'open' NOT NULL,
	"outcome" text,
	"notes" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"cadence_key" text,
	"created_by" text,
	"completed_by" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prospect_tasks" ADD CONSTRAINT "prospect_tasks_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_prospect_tasks_prospect" ON "prospect_tasks" USING btree ("prospect_id");--> statement-breakpoint
CREATE INDEX "idx_prospect_tasks_status_due" ON "prospect_tasks" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "idx_prospect_tasks_assignee" ON "prospect_tasks" USING btree ("assignee");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_prospect_tasks_open_cadence" ON "prospect_tasks" USING btree ("prospect_id","cadence_key") WHERE "prospect_tasks"."status" = 'open' and "prospect_tasks"."cadence_key" is not null;