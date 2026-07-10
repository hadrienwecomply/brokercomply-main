CREATE TABLE "agent_chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"officer" text,
	"cost_usd" numeric,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text,
	"sdk_session_id" text,
	"created_by" text NOT NULL,
	"total_cost_usd" numeric DEFAULT '0' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_chat_messages" ADD CONSTRAINT "agent_chat_messages_chat_id_agent_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."agent_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agent_chat_messages_chat" ON "agent_chat_messages" USING btree ("chat_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_agent_chats_updated_at" ON "agent_chats" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_agent_chats_archived_at" ON "agent_chats" USING btree ("archived_at");