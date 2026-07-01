CREATE TABLE "broker_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"broker_id" uuid NOT NULL,
	"drive_item_id" text NOT NULL,
	"name" text NOT NULL,
	"path" text,
	"web_url" text,
	"size" bigint,
	"mime_type" text,
	"is_folder" boolean DEFAULT false NOT NULL,
	"etag" text,
	"last_modified_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "broker_documents_drive_item_id_unique" UNIQUE("drive_item_id")
);
--> statement-breakpoint
CREATE TABLE "sharepoint_sync_state" (
	"broker_id" uuid PRIMARY KEY NOT NULL,
	"folder_item_id" text,
	"delta_link" text,
	"last_synced_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "brokers" ADD COLUMN "sharepoint_folder_id" text;--> statement-breakpoint
ALTER TABLE "brokers" ADD COLUMN "sharepoint_web_url" text;--> statement-breakpoint
ALTER TABLE "brokers" ADD COLUMN "sharepoint_folder_path" text;--> statement-breakpoint
ALTER TABLE "brokers" ADD COLUMN "sharepoint_status" text;--> statement-breakpoint
ALTER TABLE "broker_documents" ADD CONSTRAINT "broker_documents_broker_id_brokers_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."brokers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharepoint_sync_state" ADD CONSTRAINT "sharepoint_sync_state_broker_id_brokers_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."brokers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_broker_documents_broker" ON "broker_documents" USING btree ("broker_id");--> statement-breakpoint
CREATE INDEX "idx_broker_documents_deleted_at" ON "broker_documents" USING btree ("deleted_at");