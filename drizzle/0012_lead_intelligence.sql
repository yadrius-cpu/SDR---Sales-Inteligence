ALTER TABLE "customer_leads" ADD COLUMN "fit_score" integer;
ALTER TABLE "customer_leads" ADD COLUMN "fit_reason" text;
ALTER TABLE "customer_leads" ADD COLUMN "recommended_action" text;
ALTER TABLE "customer_leads" ADD COLUMN "persona_hypothesis" text;
ALTER TABLE "customer_leads" ADD COLUMN "intelligence_status" text DEFAULT 'not_analyzed' NOT NULL;
