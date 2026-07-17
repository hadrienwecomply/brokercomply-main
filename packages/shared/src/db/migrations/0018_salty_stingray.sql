ALTER TABLE "prospect_contacts" ADD COLUMN "linkedin" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "lists" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "bce" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "forme_juridique" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "gerants_tous" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "rue" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "code_postal" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "ville" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "province" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "pays" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "fsma_statut" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "debut_statut" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "types_produits" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "activite" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "taille_equipe" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "tel_societe" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "tel_source" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "site_status" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "site_quality" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "site_summary" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "linkedin_societe" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "instagram" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "x_twitter" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "date_enrichissement" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "logo_base64" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "logo_mime_type" text;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_prospects_bce" ON "prospects" USING btree ("bce") WHERE "prospects"."bce" is not null;