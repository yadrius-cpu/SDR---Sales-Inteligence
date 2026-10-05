CREATE TYPE "public"."customer_task_status" AS ENUM('pending', 'done', 'cancelled');--> statement-breakpoint
CREATE TABLE "customer_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "lead_id" uuid NOT NULL,
  "assignee_id" uuid NOT NULL,
  "due_at" timestamp with time zone NOT NULL,
  "description" text NOT NULL,
  "status" "customer_task_status" DEFAULT 'pending' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "customer_tasks_organization_id_customer_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."customer_organizations"("id") ON DELETE cascade,
  CONSTRAINT "customer_tasks_lead_id_customer_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."customer_leads"("id") ON DELETE cascade,
  CONSTRAINT "customer_tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id")
);--> statement-breakpoint
CREATE INDEX "customer_task_org_idx" ON "customer_tasks" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "customer_task_due_idx" ON "customer_tasks" USING btree ("organization_id", "due_at");
