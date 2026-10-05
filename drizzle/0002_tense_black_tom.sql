CREATE TYPE "public"."draft_status" AS ENUM('draft', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."opportunity_stage" AS ENUM('discovered', 'researched', 'qualified', 'contact_identified', 'ready_for_review', 'contacted', 'replied', 'discovery', 'meeting', 'trial', 'negotiation', 'won', 'no_response', 'not_fit', 'lost', 'follow_up_later', 'do_not_contact');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pending', 'done', 'cancelled');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"contact_id" uuid,
	"draft_id" uuid,
	"kind" text NOT NULL,
	"channel" text NOT NULL,
	"happened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"author_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_normalized" text NOT NULL,
	"title" text NOT NULL,
	"role_category" text NOT NULL,
	"professional_url" text,
	"work_email" text,
	"source_url" text NOT NULL,
	"permitted_basis" text NOT NULL,
	"purpose" text NOT NULL,
	"contact_status" text DEFAULT 'not_contacted' NOT NULL,
	"do_not_contact_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"primary_contact_id" uuid NOT NULL,
	"stage" "opportunity_stage" DEFAULT 'contact_identified' NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"channel" text DEFAULT 'linkedin' NOT NULL,
	"persona" text NOT NULL,
	"message" text NOT NULL,
	"product_id" uuid NOT NULL,
	"product_version" integer NOT NULL,
	"product_snapshot" jsonb NOT NULL,
	"evidence_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_generic" boolean NOT NULL,
	"rationale" text NOT NULL,
	"template_version" text NOT NULL,
	"status" "draft_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"edited_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"copied_at" timestamp with time zone,
	"sent_confirmed_at" timestamp with time zone,
	"sent_request_key" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sent_requires_approval" CHECK ("outreach_drafts"."sent_confirmed_at" IS NULL OR ("outreach_drafts"."status" = 'approved' AND "outreach_drafts"."approved_by" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"assignee_id" uuid NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"action_type" text DEFAULT 'manual_follow_up' NOT NULL,
	"description" text NOT NULL,
	"status" "task_status" DEFAULT 'pending' NOT NULL,
	"source_draft_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_draft_id_outreach_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."outreach_drafts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_primary_contact_id_contacts_id_fk" FOREIGN KEY ("primary_contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_drafts" ADD CONSTRAINT "outreach_drafts_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_drafts" ADD CONSTRAINT "outreach_drafts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_drafts" ADD CONSTRAINT "outreach_drafts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_drafts" ADD CONSTRAINT "outreach_drafts_edited_by_users_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_drafts" ADD CONSTRAINT "outreach_drafts_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_drafts" ADD CONSTRAINT "outreach_drafts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_source_draft_id_outreach_drafts_id_fk" FOREIGN KEY ("source_draft_id") REFERENCES "public"."outreach_drafts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_opportunity_date_idx" ON "activities" USING btree ("opportunity_id","happened_at");--> statement-breakpoint
CREATE INDEX "activity_contact_idx" ON "activities" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_draft_kind_idx" ON "activities" USING btree ("draft_id","kind");--> statement-breakpoint
CREATE INDEX "activity_author_idx" ON "activities" USING btree ("author_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_company_name_idx" ON "contacts" USING btree ("company_id","name_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_profile_idx" ON "contacts" USING btree ("professional_url");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_email_idx" ON "contacts" USING btree ("work_email");--> statement-breakpoint
CREATE INDEX "contact_creator_idx" ON "contacts" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "opportunity_company_idx" ON "opportunities" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "opportunity_campaign_stage_idx" ON "opportunities" USING btree ("campaign_id","stage");--> statement-breakpoint
CREATE INDEX "opportunity_contact_idx" ON "opportunities" USING btree ("primary_contact_id");--> statement-breakpoint
CREATE INDEX "opportunity_owner_idx" ON "opportunities" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "draft_opportunity_idx" ON "outreach_drafts" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "draft_contact_idx" ON "outreach_drafts" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "draft_status_idx" ON "outreach_drafts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "draft_product_idx" ON "outreach_drafts" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "draft_creator_idx" ON "outreach_drafts" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "task_assignee_due_status_idx" ON "tasks" USING btree ("assignee_id","due_at","status");--> statement-breakpoint
CREATE INDEX "task_opportunity_idx" ON "tasks" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "task_contact_idx" ON "tasks" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_source_draft_idx" ON "tasks" USING btree ("source_draft_id");