CREATE TABLE "outbound_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"broker_id" uuid NOT NULL,
	"step_code" text,
	"substep_template_id" text,
	"from_mailbox" text NOT NULL,
	"to_addrs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cc_addrs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reply_to" text,
	"subject" text,
	"body" text,
	"sent_by_officer" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outbound_emails" ADD CONSTRAINT "outbound_emails_broker_id_brokers_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."brokers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_outbound_emails_broker" ON "outbound_emails" USING btree ("broker_id");--> statement-breakpoint
CREATE INDEX "idx_outbound_emails_substep" ON "outbound_emails" USING btree ("broker_id","substep_template_id");