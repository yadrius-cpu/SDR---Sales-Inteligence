CREATE TABLE "campaign_companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"added_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_key" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"input_hash" text NOT NULL,
	"decision_hash" text,
	"rows" jsonb NOT NULL,
	"campaign_id" uuid,
	"owner_id" uuid NOT NULL,
	"source_url" text NOT NULL,
	"permitted_basis" text NOT NULL,
	"status" text DEFAULT 'preview' NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "inclusion_criteria" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "exclusion_criteria" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "cnpj" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "legal_name" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "state" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "employee_estimate" integer;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "permitted_basis" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "won_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "won_reference" text;--> statement-breakpoint
ALTER TABLE "campaign_companies" ADD CONSTRAINT "campaign_companies_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_companies" ADD CONSTRAINT "campaign_companies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_companies" ADD CONSTRAINT "campaign_companies_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_imports" ADD CONSTRAINT "company_imports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_imports" ADD CONSTRAINT "company_imports_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_imports" ADD CONSTRAINT "company_imports_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_company_unique" ON "campaign_companies" USING btree ("campaign_id","company_id");--> statement-breakpoint
CREATE INDEX "campaign_company_company_idx" ON "campaign_companies" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "import_actor_key_unique" ON "company_imports" USING btree ("created_by","request_key");--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_cnpj_unique" UNIQUE("cnpj");
--> statement-breakpoint
INSERT INTO "campaign_companies" ("campaign_id", "company_id", "added_by")
SELECT DISTINCT ON ("campaign_id", "company_id") "campaign_id", "company_id", "owner_id"
FROM "opportunities" ORDER BY "campaign_id", "company_id", "created_at"
ON CONFLICT ("campaign_id", "company_id") DO NOTHING;
