ALTER TABLE "users" ADD COLUMN "platform_role" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
CREATE TABLE "customer_organizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "domain" text,
  "sector" text,
  "country" text DEFAULT 'Brasil' NOT NULL,
  "onboarding_step" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "customer_org_domain_idx" ON "customer_organizations" USING btree ("domain");--> statement-breakpoint
CREATE TYPE "public"."customer_membership_role" AS ENUM('company_admin', 'sales_manager', 'sales_user', 'company_viewer');--> statement-breakpoint
CREATE TABLE "customer_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" "customer_membership_role" NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "customer_memberships_organization_id_customer_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."customer_organizations"("id") ON DELETE cascade,
  CONSTRAINT "customer_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX "customer_membership_unique" ON "customer_memberships" USING btree ("organization_id", "user_id");--> statement-breakpoint
CREATE INDEX "customer_membership_user_idx" ON "customer_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE TABLE "product_access" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "product" text NOT NULL,
  "organization_id" uuid,
  "granted_by" uuid,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "product_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade,
  CONSTRAINT "product_access_organization_id_customer_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."customer_organizations"("id") ON DELETE cascade,
  CONSTRAINT "product_access_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null
);--> statement-breakpoint
CREATE UNIQUE INDEX "product_access_unique" ON "product_access" USING btree ("user_id", "product", "organization_id");--> statement-breakpoint
CREATE INDEX "product_access_user_idx" ON "product_access" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "product_access_org_idx" ON "product_access" USING btree ("organization_id");--> statement-breakpoint
CREATE TABLE "invitations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "organization_id" uuid,
  "product" text NOT NULL,
  "role" text NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "accepted_at" timestamp with time zone,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "invitations_organization_id_customer_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."customer_organizations"("id") ON DELETE cascade,
  CONSTRAINT "invitations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action,
  CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash")
);--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitations" USING btree ("email");
