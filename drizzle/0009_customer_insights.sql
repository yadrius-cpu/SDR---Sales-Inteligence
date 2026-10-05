CREATE TABLE "customer_insights" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "summary" text NOT NULL,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'hypothesis' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "customer_insights_organization_id_customer_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."customer_organizations"("id") ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX "customer_insight_kind_idx" ON "customer_insights" USING btree ("organization_id", "kind");--> statement-breakpoint
CREATE INDEX "customer_insight_org_idx" ON "customer_insights" USING btree ("organization_id");
