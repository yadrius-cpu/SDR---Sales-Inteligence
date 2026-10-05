CREATE TABLE "writing_daily_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	"reserved_microusd" integer DEFAULT 0 NOT NULL,
	"last_request_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "writing_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"input_hash" text NOT NULL,
	"draft_version" integer NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"status" text NOT NULL,
	"error_code" text,
	"usage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outreach_drafts" ADD COLUMN "generation" jsonb;--> statement-breakpoint
ALTER TABLE "writing_runs" ADD CONSTRAINT "writing_runs_draft_id_outreach_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."outreach_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_runs" ADD CONSTRAINT "writing_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "writing_draft_request_idx" ON "writing_runs" USING btree ("draft_id","request_key");--> statement-breakpoint
CREATE INDEX "writing_creator_idx" ON "writing_runs" USING btree ("created_by");