CREATE TABLE "aml_exclusion_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" text,
	"reason" text,
	"excluded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"topic" text,
	"regulatory_refs" jsonb,
	"language" text,
	"source_ids" uuid[],
	"source_date" date,
	"author" text,
	"confidence" real,
	"embedding" vector(1536),
	"search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', coalesce("knowledge_units"."question", '') || ' ' || coalesce("knowledge_units"."answer", ''))) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" text NOT NULL,
	"conversation_id" text,
	"subject" text,
	"body_clean" text,
	"attachment_text" text,
	"sender" text,
	"recipients" jsonb,
	"mailbox" text,
	"language" text,
	"received_at" timestamp with time zone,
	"raw_metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_documents_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
CREATE INDEX "idx_knowledge_units_embedding" ON "knowledge_units" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "idx_knowledge_units_search" ON "knowledge_units" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "idx_knowledge_units_topic" ON "knowledge_units" USING btree ("topic");--> statement-breakpoint
CREATE INDEX "idx_knowledge_units_language" ON "knowledge_units" USING btree ("language");--> statement-breakpoint
CREATE INDEX "idx_knowledge_units_source_date" ON "knowledge_units" USING btree ("source_date");--> statement-breakpoint
CREATE INDEX "idx_source_documents_conversation" ON "source_documents" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_source_documents_received_at" ON "source_documents" USING btree ("received_at");