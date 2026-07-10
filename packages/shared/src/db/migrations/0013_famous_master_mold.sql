CREATE TABLE "agent_tool_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid,
	"officer" text,
	"tool_name" text NOT NULL,
	"input" jsonb,
	"decision" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_tool_audit" ADD CONSTRAINT "agent_tool_audit_chat_id_agent_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."agent_chats"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agent_tool_audit_chat" ON "agent_tool_audit" USING btree ("chat_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_agent_tool_audit_tool" ON "agent_tool_audit" USING btree ("tool_name");