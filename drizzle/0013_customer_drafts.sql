CREATE TABLE "customer_drafts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "lead_id" uuid NOT NULL,
  "channel" text DEFAULT 'manual' NOT NULL,
  "message" text NOT NULL,
  "rationale" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "approved_by" uuid,
  "approved_at" timestamp with time zone,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "customer_drafts_organization_id_customer_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."customer_organizations"("id") ON DELETE cascade,
  CONSTRAINT "customer_drafts_lead_id_customer_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."customer_leads"("id") ON DELETE cascade,
  CONSTRAINT "customer_drafts_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id"),
  CONSTRAINT "customer_drafts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
);--> statement-breakpoint
CREATE INDEX "customer_draft_org_idx" ON "customer_drafts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "customer_draft_lead_idx" ON "customer_drafts" USING btree ("lead_id");
