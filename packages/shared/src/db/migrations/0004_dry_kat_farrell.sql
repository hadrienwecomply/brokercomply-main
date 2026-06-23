CREATE TABLE "broker_plan_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"broker_id" uuid NOT NULL,
	"code" text NOT NULL,
	"applicable" boolean DEFAULT true NOT NULL,
	"deadline_override" date,
	"position" real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broker_plan_substeps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"step_id" uuid NOT NULL,
	"template_substep_id" text NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"completed_at" timestamp with time zone,
	"notes" text,
	"position" real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brokers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"societe" text NOT NULL,
	"contact_name" text,
	"emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"phone" text,
	"website" text,
	"bce" text,
	"fsma_number" text,
	"address" text,
	"city" text,
	"countries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"language" text,
	"size_bucket" text,
	"product" text DEFAULT 'BrokerComply' NOT NULL,
	"linkedin_url" text,
	"status" text DEFAULT 'onboarding' NOT NULL,
	"mrr" numeric(10, 2),
	"signature_date" date,
	"last_contact_date" date,
	"account_owner" text,
	"notion_page_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brokers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "broker_plan_steps" ADD CONSTRAINT "broker_plan_steps_broker_id_brokers_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."brokers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broker_plan_substeps" ADD CONSTRAINT "broker_plan_substeps_step_id_broker_plan_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."broker_plan_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_broker_plan_steps_broker_code" ON "broker_plan_steps" USING btree ("broker_id","code");--> statement-breakpoint
CREATE INDEX "idx_broker_plan_steps_broker" ON "broker_plan_steps" USING btree ("broker_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_broker_plan_substeps_step_tpl" ON "broker_plan_substeps" USING btree ("step_id","template_substep_id");--> statement-breakpoint
CREATE INDEX "idx_broker_plan_substeps_step" ON "broker_plan_substeps" USING btree ("step_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_brokers_bce" ON "brokers" USING btree ("bce") WHERE "brokers"."bce" is not null;--> statement-breakpoint
CREATE INDEX "idx_brokers_status" ON "brokers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_brokers_account_owner" ON "brokers" USING btree ("account_owner");