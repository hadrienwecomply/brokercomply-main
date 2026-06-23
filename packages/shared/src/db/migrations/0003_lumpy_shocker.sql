CREATE TABLE "roadmap_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'idea' NOT NULL,
	"theme" text,
	"position" real DEFAULT 0 NOT NULL,
	"owner" text,
	"source_ref" text,
	"created_by" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roadmap_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"voter" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_roadmap_items_status" ON "roadmap_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_roadmap_items_archived" ON "roadmap_items" USING btree ("archived");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_roadmap_votes_item_voter" ON "roadmap_votes" USING btree ("item_id","voter");--> statement-breakpoint
CREATE INDEX "idx_roadmap_votes_item" ON "roadmap_votes" USING btree ("item_id");