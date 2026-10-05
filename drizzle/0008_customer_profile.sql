CREATE TABLE "customer_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "customer_profiles_organization_id_customer_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."customer_organizations"("id") ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX "customer_profile_org_idx" ON "customer_profiles" USING btree ("organization_id");
