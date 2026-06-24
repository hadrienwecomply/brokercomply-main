CREATE TABLE "mail_sync_state" (
	"mailbox" text NOT NULL,
	"folder" text NOT NULL,
	"delta_link" text,
	"last_synced_at" timestamp with time zone,
	CONSTRAINT "mail_sync_state_mailbox_folder_pk" PRIMARY KEY("mailbox","folder")
);
