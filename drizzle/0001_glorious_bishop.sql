CREATE TYPE "public"."evidence_type" AS ENUM('public_fact', 'inference', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"source_id" uuid,
	"type" "evidence_type" NOT NULL,
	"claim" text NOT NULL,
	"excerpt" text,
	"observed_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"confidence_label" text NOT NULL,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fact_requires_source" CHECK ("evidence"."type" <> 'public_fact' OR "evidence"."source_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "research_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"summary" text NOT NULL,
	"unknowns" jsonb NOT NULL,
	"discovery_question" text NOT NULL,
	"evidence_snapshot" jsonb NOT NULL,
	"method" text NOT NULL,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"entity_id" text NOT NULL,
	"status" text NOT NULL,
	"error_code" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"contact_email" text,
	"last_fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"url" text NOT NULL,
	"publisher" text NOT NULL,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"permitted_basis" text NOT NULL,
	"content_hash" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_briefs" ADD CONSTRAINT "research_briefs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_briefs" ADD CONSTRAINT "research_briefs_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_briefs" ADD CONSTRAINT "research_briefs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidence_company_type_idx" ON "evidence" USING btree ("company_id","type");--> statement-breakpoint
CREATE INDEX "evidence_review_idx" ON "evidence" USING btree ("status");--> statement-breakpoint
CREATE INDEX "evidence_source_idx" ON "evidence" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "evidence_creator_idx" ON "evidence" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "evidence_reviewer_idx" ON "evidence" USING btree ("reviewed_by");--> statement-breakpoint
CREATE UNIQUE INDEX "brief_company_version_idx" ON "research_briefs" USING btree ("company_id","version");--> statement-breakpoint
CREATE INDEX "brief_status_idx" ON "research_briefs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "brief_creator_idx" ON "research_briefs" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "brief_reviewer_idx" ON "research_briefs" USING btree ("reviewed_by");--> statement-breakpoint
CREATE UNIQUE INDEX "research_request_idx" ON "research_runs" USING btree ("company_id","request_key");--> statement-breakpoint
CREATE INDEX "research_creator_idx" ON "research_runs" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "sources_company_idx" ON "sources" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "sources_creator_idx" ON "sources" USING btree ("created_by");