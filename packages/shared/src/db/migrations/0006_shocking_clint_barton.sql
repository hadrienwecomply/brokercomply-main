CREATE TABLE "plan_step_offsets" (
	"code" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"offset_days" integer NOT NULL,
	"position" real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_task_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"step_code" text NOT NULL,
	"title" text NOT NULL,
	"email_subject" text,
	"email_body" text,
	"content_key" text,
	"position" real DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "broker_plan_substeps" ALTER COLUMN "template_substep_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "broker_plan_substeps" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "broker_plan_substeps" ADD COLUMN "email_subject" text;--> statement-breakpoint
ALTER TABLE "broker_plan_substeps" ADD COLUMN "email_body" text;--> statement-breakpoint
ALTER TABLE "broker_plan_substeps" ADD COLUMN "due_date" date;--> statement-breakpoint
ALTER TABLE "broker_plan_substeps" ADD COLUMN "is_custom" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "broker_plan_substeps" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_plan_task_templates_step" ON "plan_task_templates" USING btree ("step_code");