ALTER TYPE "public"."evidence_type" ADD VALUE 'customer_statement';--> statement-breakpoint
CREATE TABLE "ai_daily_usage" (
	"day" text PRIMARY KEY NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	"reserved_microusd" integer DEFAULT 0 NOT NULL,
	"last_request_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "conversation_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"activity_version" integer NOT NULL,
	"kind" text NOT NULL,
	"normalized_label" text NOT NULL,
	"raw_excerpt" text NOT NULL,
	"certainty" text NOT NULL,
	"method" text NOT NULL,
	"fingerprint" text NOT NULL,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"published_evidence_id" uuid,
	"contradicted_evidence_id" uuid,
	"contradicted_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extraction_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"activity_version" integer NOT NULL,
	"method" text NOT NULL,
	"input_hash" text NOT NULL,
	"status" text NOT NULL,
	"candidate_count" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"usage" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "body" text;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "author_role" text;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "permitted_basis" text;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "request_key" uuid;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "activity_id" uuid;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "lost_reason" text;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "stage_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_insights" ADD CONSTRAINT "conversation_insights_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_insights" ADD CONSTRAINT "conversation_insights_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_insights" ADD CONSTRAINT "conversation_insights_published_evidence_id_evidence_id_fk" FOREIGN KEY ("published_evidence_id") REFERENCES "public"."evidence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_insights" ADD CONSTRAINT "conversation_insights_contradicted_evidence_id_evidence_id_fk" FOREIGN KEY ("contradicted_evidence_id") REFERENCES "public"."evidence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_runs" ADD CONSTRAINT "extraction_runs_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "insight_fingerprint_idx" ON "conversation_insights" USING btree ("activity_id","activity_version","fingerprint");--> statement-breakpoint
CREATE INDEX "insight_status_idx" ON "conversation_insights" USING btree ("status");--> statement-breakpoint
CREATE INDEX "insight_published_idx" ON "conversation_insights" USING btree ("published_evidence_id");--> statement-breakpoint
CREATE INDEX "insight_contradicted_idx" ON "conversation_insights" USING btree ("contradicted_evidence_id");--> statement-breakpoint
CREATE INDEX "insight_reviewer_idx" ON "conversation_insights" USING btree ("reviewed_by");--> statement-breakpoint
CREATE UNIQUE INDEX "extraction_version_method_idx" ON "extraction_runs" USING btree ("activity_id","activity_version","method");--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_request_idx" ON "activities" USING btree ("opportunity_id","request_key");--> statement-breakpoint
CREATE INDEX "evidence_activity_idx" ON "evidence" USING btree ("activity_id");--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "statement_requires_activity" CHECK ("evidence"."type"::text <> 'customer_statement' OR "evidence"."activity_id" IS NOT NULL);