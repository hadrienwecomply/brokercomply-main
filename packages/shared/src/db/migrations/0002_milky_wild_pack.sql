ALTER TABLE "knowledge_units" ADD COLUMN "origin" text DEFAULT 'distilled' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_units" ADD COLUMN "review_status" text DEFAULT 'unreviewed' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_units" ADD COLUMN "updated_by" text;--> statement-breakpoint
ALTER TABLE "knowledge_units" ADD COLUMN "is_published" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_knowledge_units_origin" ON "knowledge_units" USING btree ("origin");--> statement-breakpoint
CREATE INDEX "idx_knowledge_units_published" ON "knowledge_units" USING btree ("is_published");