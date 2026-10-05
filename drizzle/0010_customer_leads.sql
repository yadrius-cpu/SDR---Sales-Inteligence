CREATE TABLE "customer_leads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "company_name" text NOT NULL,
  "domain" text,
  "contact_name" text,
  "contact_title" text,
  "contact_email" text,
  "status" text DEFAULT 'new' NOT NULL,
  "next_action" text,
  "notes" text,
  "owner_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "customer_leads_organization_id_customer_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."customer_organizations"("id") ON DELETE cascade,
  CONSTRAINT "customer_leads_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action
);--> statement-breakpoint
CREATE INDEX "customer_lead_org_idx" ON "customer_leads" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "customer_lead_status_idx" ON "customer_leads" USING btree ("organization_id", "status");
