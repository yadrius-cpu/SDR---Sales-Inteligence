CREATE TABLE "experiment_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"arm" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "experiment_arm" CHECK ("experiment_members"."arm" IN ('A','B'))
);
--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_key" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"hypothesis" text NOT NULL,
	"variant_a" text NOT NULL,
	"variant_b" text NOT NULL,
	"metric" text NOT NULL,
	"window_days" integer NOT NULL,
	"min_per_arm" integer NOT NULL,
	"enrollment_ends" timestamp with time zone NOT NULL,
	"protocol_version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "experiment_window" CHECK ("experiments"."window_days" BETWEEN 1 AND 90),
	CONSTRAINT "experiment_minimum" CHECK ("experiments"."min_per_arm" >= 30),
	CONSTRAINT "experiment_metric" CHECK ("experiments"."metric" IN ('replied','meeting','won'))
);
--> statement-breakpoint
ALTER TABLE "experiment_members" ADD CONSTRAINT "experiment_members_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_members" ADD CONSTRAINT "experiment_members_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_members" ADD CONSTRAINT "experiment_members_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_members" ADD CONSTRAINT "experiment_members_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "experiment_company_idx" ON "experiment_members" USING btree ("experiment_id","company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "experiment_opportunity_idx" ON "experiment_members" USING btree ("opportunity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "experiment_request_idx" ON "experiments" USING btree ("created_by","request_key");