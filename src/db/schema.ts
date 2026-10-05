import { pgTable, pgEnum, uuid, text, boolean, timestamp, jsonb, integer, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
const dates = () => ({ createdAt: timestamp("created_at", {withTimezone:true}).defaultNow().notNull(), updatedAt: timestamp("updated_at", {withTimezone:true}).defaultNow().notNull() });
export const role = pgEnum("role", ["owner", "operator", "viewer"]);
export const users = pgTable("users", { id: uuid().defaultRandom().primaryKey(), email: text().notNull().unique(), name: text().notNull(), role: role().notNull(), platformRole: text("platform_role").default("member").notNull(), passwordHash: text("password_hash").notNull(), active: boolean().default(true).notNull(), ...dates() });
export const sessions = pgTable("sessions", { id: uuid().defaultRandom().primaryKey(), tokenHash: text("token_hash").notNull().unique(), userId: uuid("user_id").notNull().references(()=>users.id,{onDelete:"cascade"}), expiresAt: timestamp("expires_at",{withTimezone:true}).notNull(), ...dates() }, t=>[index("sessions_user_idx").on(t.userId)]);
export const loginAttempts = pgTable("login_attempts", { key: text().primaryKey(), count: integer().default(1).notNull(), windowStart: timestamp("window_start",{withTimezone:true}).defaultNow().notNull() });
export const customerOrganizations = pgTable("customer_organizations", { id: uuid().defaultRandom().primaryKey(), name: text().notNull(), domain: text(), sector: text(), country: text().default("Brasil").notNull(), onboardingStep: integer("onboarding_step").default(0).notNull(), ...dates() }, t=>[uniqueIndex("customer_org_domain_idx").on(t.domain)]);
export const customerMembershipRole = pgEnum("customer_membership_role", ["company_admin", "sales_manager", "sales_user", "company_viewer"]);
export const customerMemberships = pgTable("customer_memberships", { id: uuid().defaultRandom().primaryKey(), organizationId: uuid("organization_id").notNull().references(()=>customerOrganizations.id,{onDelete:"cascade"}), userId: uuid("user_id").notNull().references(()=>users.id,{onDelete:"cascade"}), role: customerMembershipRole().notNull(), active: boolean().default(true).notNull(), ...dates() }, t=>[uniqueIndex("customer_membership_unique").on(t.organizationId,t.userId), index("customer_membership_user_idx").on(t.userId)]);
export const customerProfiles = pgTable("customer_profiles", { id: uuid().defaultRandom().primaryKey(), organizationId: uuid("organization_id").notNull().references(()=>customerOrganizations.id,{onDelete:"cascade"}), answers: jsonb().$type<Record<string,string>>().default({}).notNull(), ...dates() }, t=>[uniqueIndex("customer_profile_org_idx").on(t.organizationId)]);
export const customerInsights = pgTable("customer_insights", { id: uuid().defaultRandom().primaryKey(), organizationId: uuid("organization_id").notNull().references(()=>customerOrganizations.id,{onDelete:"cascade"}), kind: text().notNull(), title: text().notNull(), summary: text().notNull(), details: jsonb().$type<Record<string,string>>().default({}).notNull(), status: text().default("hypothesis").notNull(), ...dates() }, t=>[uniqueIndex("customer_insight_kind_idx").on(t.organizationId,t.kind), index("customer_insight_org_idx").on(t.organizationId)]);
export const customerLeads = pgTable("customer_leads", { id: uuid().defaultRandom().primaryKey(), organizationId: uuid("organization_id").notNull().references(()=>customerOrganizations.id,{onDelete:"cascade"}), companyName: text("company_name").notNull(), domain: text(), contactName: text("contact_name"), contactTitle: text("contact_title"), contactEmail: text("contact_email"), status: text().default("new").notNull(), nextAction: text("next_action"), notes: text(), fitScore: integer("fit_score"), fitReason: text("fit_reason"), recommendedAction: text("recommended_action"), personaHypothesis: text("persona_hypothesis"), intelligenceStatus: text("intelligence_status").default("not_analyzed").notNull(), ownerId: uuid("owner_id").notNull().references(()=>users.id), ...dates() }, t=>[index("customer_lead_org_idx").on(t.organizationId), index("customer_lead_status_idx").on(t.organizationId,t.status)]);
export const customerTaskStatus = pgEnum("customer_task_status", ["pending","done","cancelled"]);
export const customerTasks = pgTable("customer_tasks", { id: uuid().defaultRandom().primaryKey(), organizationId: uuid("organization_id").notNull().references(()=>customerOrganizations.id,{onDelete:"cascade"}), leadId: uuid("lead_id").notNull().references(()=>customerLeads.id,{onDelete:"cascade"}), assigneeId: uuid("assignee_id").notNull().references(()=>users.id), dueAt: timestamp("due_at",{withTimezone:true}).notNull(), description: text().notNull(), status: customerTaskStatus().default("pending").notNull(), ...dates() }, t=>[index("customer_task_org_idx").on(t.organizationId),index("customer_task_due_idx").on(t.organizationId,t.dueAt)]);
export const customerDrafts = pgTable("customer_drafts", { id: uuid().defaultRandom().primaryKey(), organizationId: uuid("organization_id").notNull().references(()=>customerOrganizations.id,{onDelete:"cascade"}), leadId: uuid("lead_id").notNull().references(()=>customerLeads.id,{onDelete:"cascade"}), channel: text().default("manual").notNull(), message: text().notNull(), rationale: text().notNull(), status: text().default("draft").notNull(), approvedBy: uuid("approved_by").references(()=>users.id), approvedAt: timestamp("approved_at",{withTimezone:true}), createdBy: uuid("created_by").notNull().references(()=>users.id), ...dates() }, t=>[index("customer_draft_org_idx").on(t.organizationId),index("customer_draft_lead_idx").on(t.leadId)]);
export const productAccess = pgTable("product_access", { id: uuid().defaultRandom().primaryKey(), userId: uuid("user_id").notNull().references(()=>users.id,{onDelete:"cascade"}), product: text().notNull(), organizationId: uuid("organization_id").references(()=>customerOrganizations.id,{onDelete:"cascade"}), grantedBy: uuid("granted_by").references(()=>users.id,{onDelete:"set null"}), active: boolean().default(true).notNull(), ...dates() }, t=>[uniqueIndex("product_access_unique").on(t.userId,t.product,t.organizationId), index("product_access_user_idx").on(t.userId), index("product_access_org_idx").on(t.organizationId)]);
export const invitations = pgTable("invitations", { id: uuid().defaultRandom().primaryKey(), email: text().notNull(), organizationId: uuid("organization_id").references(()=>customerOrganizations.id,{onDelete:"cascade"}), product: text().notNull(), role: text().notNull(), tokenHash: text("token_hash").notNull().unique(), expiresAt: timestamp("expires_at",{withTimezone:true}).notNull(), acceptedAt: timestamp("accepted_at",{withTimezone:true}), createdBy: uuid("created_by").notNull().references(()=>users.id), ...dates() }, t=>[index("invitation_email_idx").on(t.email)]);
export const products = pgTable("products", { id: uuid().defaultRandom().primaryKey(), name: text().notNull().unique(), description: text().notNull(), approvedClaims: jsonb("approved_claims").$type<string[]>().default([]).notNull(), prohibitedClaims: jsonb("prohibited_claims").$type<string[]>().default([]).notNull(), version: integer().default(1).notNull(), ...dates() });
export const campaigns = pgTable("campaigns", { version:integer().default(1).notNull(),inclusionCriteria:text("inclusion_criteria").default("").notNull(),exclusionCriteria:text("exclusion_criteria").default("").notNull(), id: uuid().defaultRandom().primaryKey(), productId: uuid("product_id").notNull().references(()=>products.id), name: text().notNull(), sector: text().notNull(), employeeMin: integer("employee_min").notNull(), employeeMax: integer("employee_max").notNull(), geography: text().default("Brasil").notNull(), targetRoles: jsonb("target_roles").$type<string[]>().default([]).notNull(), status: text().default("draft").notNull(), ownerId: uuid("owner_id").notNull().references(()=>users.id), ...dates() },t=>[index("campaign_product_idx").on(t.productId),index("campaign_owner_idx").on(t.ownerId)]);
export const companies = pgTable("companies", { cnpj:text().unique(),legalName:text("legal_name"),city:text(),state:text(),employeeEstimate:integer("employee_estimate"),sourceUrl:text("source_url"),permittedBasis:text("permitted_basis"),version:integer().default(1).notNull(), id: uuid().defaultRandom().primaryKey(), displayName: text("display_name").notNull(), domainNormalized: text("domain_normalized"), sector: text().notNull(), country: text().default("Brasil").notNull(), status: text().default("discovered").notNull(), ownerId: uuid("owner_id").notNull().references(()=>users.id), ...dates() },t=>[index("company_domain_idx").on(t.domainNormalized),index("company_owner_idx").on(t.ownerId)]);
export const auditEvents = pgTable("audit_events", { id: uuid().defaultRandom().primaryKey(), actorId: uuid("actor_id").references(()=>users.id,{onDelete:"set null"}), entityType: text("entity_type").notNull(), entityId: uuid("entity_id").notNull(), action: text().notNull(), metadata: jsonb().$type<Record<string,unknown>>().default({}).notNull(), happenedAt: timestamp("happened_at",{withTimezone:true}).defaultNow().notNull() },t=>[index("audit_actor_idx").on(t.actorId)]);
export const evidenceType = pgEnum("evidence_type", ["public_fact", "inference", "unknown", "customer_statement"]);
export const reviewStatus = pgEnum("review_status", ["pending", "approved", "rejected"]);
export const sourceSettings = pgTable("source_settings", {
  id: text().primaryKey(), enabled: boolean().default(false).notNull(), contactEmail: text("contact_email"),
  lastFetchedAt: timestamp("last_fetched_at", {withTimezone:true}), ...dates(),
});
export const sources = pgTable("sources", {
  id: uuid().defaultRandom().primaryKey(), companyId: uuid("company_id").notNull().references(()=>companies.id,{onDelete:"cascade"}),
  sourceType: text("source_type").notNull(), url: text().notNull(), publisher: text().notNull(),
  collectedAt: timestamp("collected_at",{withTimezone:true}).defaultNow().notNull(), permittedBasis: text("permitted_basis").notNull(),
  contentHash: text("content_hash").notNull(), createdBy: uuid("created_by").notNull().references(()=>users.id), ...dates(),
},t=>[index("sources_company_idx").on(t.companyId),index("sources_creator_idx").on(t.createdBy)]);
export const evidence = pgTable("evidence", {
  id: uuid().defaultRandom().primaryKey(), companyId: uuid("company_id").notNull().references(()=>companies.id,{onDelete:"cascade"}),
  sourceId: uuid("source_id").references(()=>sources.id), type: evidenceType().notNull(), claim: text().notNull(), excerpt: text(),
  activityId: uuid("activity_id").references(()=>activities.id,{onDelete:"cascade"}),
  observedAt: timestamp("observed_at",{withTimezone:true}).notNull(), expiresAt: timestamp("expires_at",{withTimezone:true}),
  confidenceLabel: text("confidence_label").notNull(), status: reviewStatus().default("pending").notNull(),
  version: integer().default(1).notNull(), reviewedBy: uuid("reviewed_by").references(()=>users.id), reviewedAt: timestamp("reviewed_at",{withTimezone:true}),
  reviewNote: text("review_note"), createdBy: uuid("created_by").notNull().references(()=>users.id), ...dates(),
},t=>[index("evidence_company_type_idx").on(t.companyId,t.type),index("evidence_review_idx").on(t.status),index("evidence_source_idx").on(t.sourceId),index("evidence_activity_idx").on(t.activityId),index("evidence_creator_idx").on(t.createdBy),index("evidence_reviewer_idx").on(t.reviewedBy),check("fact_requires_source",sql`${t.type} <> 'public_fact' OR ${t.sourceId} IS NOT NULL`),check("statement_requires_activity",sql`${t.type}::text <> 'customer_statement' OR ${t.activityId} IS NOT NULL`)]);
export const researchBriefs = pgTable("research_briefs", {
  id: uuid().defaultRandom().primaryKey(), companyId: uuid("company_id").notNull().references(()=>companies.id,{onDelete:"cascade"}),
  version: integer().notNull(), summary: text().notNull(), unknowns: jsonb().$type<string[]>().notNull(), discoveryQuestion: text("discovery_question").notNull(),
  evidenceSnapshot: jsonb("evidence_snapshot").$type<{id:string;version:number;type:string;claim:string;sourceUrl:string|null;observedAt:string}[]>().notNull(),
  method: text().notNull(), status: reviewStatus().default("pending").notNull(),
  reviewedBy: uuid("reviewed_by").references(()=>users.id), reviewedAt: timestamp("reviewed_at",{withTimezone:true}),
  createdBy: uuid("created_by").notNull().references(()=>users.id), ...dates(),
},t=>[uniqueIndex("brief_company_version_idx").on(t.companyId,t.version),index("brief_status_idx").on(t.status),index("brief_creator_idx").on(t.createdBy),index("brief_reviewer_idx").on(t.reviewedBy)]);
export const researchRuns = pgTable("research_runs", {
  id: uuid().defaultRandom().primaryKey(), companyId: uuid("company_id").notNull().references(()=>companies.id,{onDelete:"cascade"}),
  requestKey: uuid("request_key").notNull(), entityId: text("entity_id").notNull(), status: text().notNull(), errorCode: text("error_code"),
  createdBy: uuid("created_by").notNull().references(()=>users.id), ...dates(),
},t=>[uniqueIndex("research_request_idx").on(t.companyId,t.requestKey),index("research_creator_idx").on(t.createdBy)]);
export const opportunityStage = pgEnum("opportunity_stage", ["discovered","researched","qualified","contact_identified","ready_for_review","contacted","replied","discovery","meeting","trial","negotiation","won","no_response","not_fit","lost","follow_up_later","do_not_contact"]);
export const draftStatus = pgEnum("draft_status", ["draft","approved","rejected"]);
export const taskStatus = pgEnum("task_status", ["pending","done","cancelled"]);
export const contacts = pgTable("contacts", { version:integer().default(1).notNull(),
  id:uuid().defaultRandom().primaryKey(),companyId:uuid("company_id").notNull().references(()=>companies.id,{onDelete:"cascade"}),
  name:text().notNull(),nameNormalized:text("name_normalized").notNull(),title:text().notNull(),roleCategory:text("role_category").notNull(),
  professionalUrl:text("professional_url"),workEmail:text("work_email"),sourceUrl:text("source_url").notNull(),permittedBasis:text("permitted_basis").notNull(),purpose:text().notNull(),
  contactStatus:text("contact_status").default("not_contacted").notNull(),doNotContactAt:timestamp("do_not_contact_at",{withTimezone:true}),
  createdBy:uuid("created_by").notNull().references(()=>users.id),...dates(),
},t=>[uniqueIndex("contact_company_name_idx").on(t.companyId,t.nameNormalized),uniqueIndex("contact_profile_idx").on(t.professionalUrl),uniqueIndex("contact_email_idx").on(t.workEmail),index("contact_creator_idx").on(t.createdBy)]);
export const opportunities = pgTable("opportunities", {
  id:uuid().defaultRandom().primaryKey(),companyId:uuid("company_id").notNull().references(()=>companies.id,{onDelete:"cascade"}),
  campaignId:uuid("campaign_id").notNull().references(()=>campaigns.id),primaryContactId:uuid("primary_contact_id").notNull().references(()=>contacts.id),
  stage:opportunityStage().default("contact_identified").notNull(),ownerId:uuid("owner_id").notNull().references(()=>users.id),...dates(),
  wonAt:timestamp("won_at",{withTimezone:true}),wonReference:text("won_reference"),lostReason:text("lost_reason"),stageVersion:integer("stage_version").default(1).notNull(),
},t=>[index("opportunity_company_idx").on(t.companyId),index("opportunity_campaign_stage_idx").on(t.campaignId,t.stage),index("opportunity_contact_idx").on(t.primaryContactId),index("opportunity_owner_idx").on(t.ownerId)]);
export const outreachDrafts = pgTable("outreach_drafts", {
  id:uuid().defaultRandom().primaryKey(),opportunityId:uuid("opportunity_id").notNull().references(()=>opportunities.id,{onDelete:"cascade"}),
  contactId:uuid("contact_id").notNull().references(()=>contacts.id),channel:text().default("linkedin").notNull(),persona:text().notNull(),message:text().notNull(),
  productId:uuid("product_id").notNull().references(()=>products.id),productVersion:integer("product_version").notNull(),
  productSnapshot:jsonb("product_snapshot").$type<{name:string;approvedClaims:string[];prohibitedClaims:string[]}>().notNull(),
  evidenceSnapshot:jsonb("evidence_snapshot").$type<{id:string;version:number;claim:string;sourceUrl:string;observedAt:string}[]>().default([]).notNull(),
  isGeneric:boolean("is_generic").notNull(),rationale:text().notNull(),templateVersion:text("template_version").notNull(),
  generation:jsonb().$type<{provider:string;model:string;promptVersion:string;runId:string;purpose:string}>(),
  status:draftStatus().default("draft").notNull(),version:integer().default(1).notNull(),editedBy:uuid("edited_by").references(()=>users.id),
  approvedBy:uuid("approved_by").references(()=>users.id),approvedAt:timestamp("approved_at",{withTimezone:true}),copiedAt:timestamp("copied_at",{withTimezone:true}),
  sentConfirmedAt:timestamp("sent_confirmed_at",{withTimezone:true}),sentRequestKey:uuid("sent_request_key"),createdBy:uuid("created_by").notNull().references(()=>users.id),...dates(),
},t=>[index("draft_opportunity_idx").on(t.opportunityId),index("draft_contact_idx").on(t.contactId),index("draft_status_idx").on(t.status),index("draft_product_idx").on(t.productId),index("draft_creator_idx").on(t.createdBy),check("sent_requires_approval",sql`${t.sentConfirmedAt} IS NULL OR (${t.status} = 'approved' AND ${t.approvedBy} IS NOT NULL)`)]);
export const activities = pgTable("activities", {
  id:uuid().defaultRandom().primaryKey(),opportunityId:uuid("opportunity_id").notNull().references(()=>opportunities.id,{onDelete:"cascade"}),contactId:uuid("contact_id").references(()=>contacts.id),
  draftId:uuid("draft_id").references(()=>outreachDrafts.id,{onDelete:"set null"}),kind:text().notNull(),channel:text().notNull(),happenedAt:timestamp("happened_at",{withTimezone:true}).defaultNow().notNull(),
  authorId:uuid("author_id").notNull().references(()=>users.id),metadata:jsonb().$type<Record<string,unknown>>().default({}).notNull(),...dates(),
  body:text(),authorRole:text("author_role"),permittedBasis:text("permitted_basis"),version:integer().default(1).notNull(),requestKey:uuid("request_key"),contentHash:text("content_hash"),deletedAt:timestamp("deleted_at",{withTimezone:true}),
},t=>[index("activity_opportunity_date_idx").on(t.opportunityId,t.happenedAt),index("activity_contact_idx").on(t.contactId),uniqueIndex("activity_draft_kind_idx").on(t.draftId,t.kind),index("activity_author_idx").on(t.authorId),uniqueIndex("activity_request_idx").on(t.opportunityId,t.requestKey)]);
export const tasks = pgTable("tasks", {
  id:uuid().defaultRandom().primaryKey(),opportunityId:uuid("opportunity_id").notNull().references(()=>opportunities.id,{onDelete:"cascade"}),contactId:uuid("contact_id").notNull().references(()=>contacts.id),
  assigneeId:uuid("assignee_id").notNull().references(()=>users.id),dueAt:timestamp("due_at",{withTimezone:true}).notNull(),actionType:text("action_type").default("manual_follow_up").notNull(),description:text().notNull(),
  status:taskStatus().default("pending").notNull(),sourceDraftId:uuid("source_draft_id").references(()=>outreachDrafts.id,{onDelete:"set null"}),...dates(),
},t=>[index("task_assignee_due_status_idx").on(t.assigneeId,t.dueAt,t.status),index("task_opportunity_idx").on(t.opportunityId),index("task_contact_idx").on(t.contactId),uniqueIndex("task_source_draft_idx").on(t.sourceDraftId)]);
export const conversationInsights=pgTable("conversation_insights",{
  id:uuid().defaultRandom().primaryKey(),activityId:uuid("activity_id").notNull().references(()=>activities.id,{onDelete:"cascade"}),activityVersion:integer("activity_version").notNull(),
  kind:text().notNull(),normalizedLabel:text("normalized_label").notNull(),rawExcerpt:text("raw_excerpt").notNull(),certainty:text().notNull(),method:text().notNull(),fingerprint:text().notNull(),
  status:reviewStatus().default("pending").notNull(),version:integer().default(1).notNull(),reviewedBy:uuid("reviewed_by").references(()=>users.id),reviewedAt:timestamp("reviewed_at",{withTimezone:true}),reviewNote:text("review_note"),
  publishedEvidenceId:uuid("published_evidence_id").references(()=>evidence.id,{onDelete:"set null"}),contradictedEvidenceId:uuid("contradicted_evidence_id").references(()=>evidence.id,{onDelete:"set null"}),contradictedVersion:integer("contradicted_version"),...dates(),
},t=>[uniqueIndex("insight_fingerprint_idx").on(t.activityId,t.activityVersion,t.fingerprint),index("insight_status_idx").on(t.status),index("insight_published_idx").on(t.publishedEvidenceId),index("insight_contradicted_idx").on(t.contradictedEvidenceId),index("insight_reviewer_idx").on(t.reviewedBy)]);
export const extractionRuns=pgTable("extraction_runs",{
  id:uuid().defaultRandom().primaryKey(),activityId:uuid("activity_id").notNull().references(()=>activities.id,{onDelete:"cascade"}),activityVersion:integer("activity_version").notNull(),method:text().notNull(),inputHash:text("input_hash").notNull(),status:text().notNull(),candidateCount:integer("candidate_count").default(0).notNull(),errorCode:text("error_code"),...dates(),
  attempts:integer().default(1).notNull(),usage:jsonb().$type<Record<string,unknown>>().default({}).notNull(),
},t=>[uniqueIndex("extraction_version_method_idx").on(t.activityId,t.activityVersion,t.method)]);
export const aiDailyUsage=pgTable("ai_daily_usage",{day:text().primaryKey(),requests:integer().default(0).notNull(),reservedMicrousd:integer("reserved_microusd").default(0).notNull(),lastRequestAt:timestamp("last_request_at",{withTimezone:true})});
export const writingRuns=pgTable("writing_runs",{
  id:uuid().defaultRandom().primaryKey(),draftId:uuid("draft_id").notNull().references(()=>outreachDrafts.id,{onDelete:"cascade"}),
  requestKey:uuid("request_key").notNull(),inputHash:text("input_hash").notNull(),draftVersion:integer("draft_version").notNull(),
  provider:text().notNull(),model:text().notNull(),promptVersion:text("prompt_version").notNull(),status:text().notNull(),errorCode:text("error_code"),
  usage:jsonb().$type<Record<string,unknown>>().default({}).notNull(),createdBy:uuid("created_by").notNull().references(()=>users.id),...dates(),
},t=>[uniqueIndex("writing_draft_request_idx").on(t.draftId,t.requestKey),index("writing_creator_idx").on(t.createdBy)]);
export const writingDailyUsage=pgTable("writing_daily_usage",{
  id:text().primaryKey(),requests:integer().default(0).notNull(),reservedMicrousd:integer("reserved_microusd").default(0).notNull(),lastRequestAt:timestamp("last_request_at",{withTimezone:true}),
});
export const campaignCompanies=pgTable("campaign_companies",{
  id:uuid().defaultRandom().primaryKey(),campaignId:uuid("campaign_id").notNull().references(()=>campaigns.id,{onDelete:"cascade"}),companyId:uuid("company_id").notNull().references(()=>companies.id,{onDelete:"cascade"}),addedBy:uuid("added_by").notNull().references(()=>users.id),...dates(),
},t=>[uniqueIndex("campaign_company_unique").on(t.campaignId,t.companyId),index("campaign_company_company_idx").on(t.companyId)]);
export const companyImports=pgTable("company_imports",{
  id:uuid().defaultRandom().primaryKey(),requestKey:uuid("request_key").notNull(),createdBy:uuid("created_by").notNull().references(()=>users.id),inputHash:text("input_hash").notNull(),decisionHash:text("decision_hash"),
  rows:jsonb().$type<import("../lib/crm/contracts").ImportRow[]>().notNull(),campaignId:uuid("campaign_id").references(()=>campaigns.id,{onDelete:"set null"}),ownerId:uuid("owner_id").notNull().references(()=>users.id),
  sourceUrl:text("source_url").notNull(),permittedBasis:text("permitted_basis").notNull(),status:text().default("preview").notNull(),result:jsonb().$type<{created:number;linked:number;skipped:number;companyIds:string[]}>(),...dates(),
},t=>[uniqueIndex("import_actor_key_unique").on(t.createdBy,t.requestKey)]);

export const experiments = pgTable("experiments", {
  id: uuid().defaultRandom().primaryKey(), requestKey: uuid("request_key").notNull(),
  campaignId: uuid("campaign_id").notNull().references(()=>campaigns.id),
  name: text().notNull(), hypothesis: text().notNull(), variantA: text("variant_a").notNull(), variantB: text("variant_b").notNull(),
  metric: text().notNull(), windowDays: integer("window_days").notNull(), minPerArm: integer("min_per_arm").notNull(),
  enrollmentEnds: timestamp("enrollment_ends",{withTimezone:true}).notNull(),
  protocolVersion: integer("protocol_version").default(1).notNull(), createdBy: uuid("created_by").notNull().references(()=>users.id), ...dates(),
},t=>[uniqueIndex("experiment_request_idx").on(t.createdBy,t.requestKey), check("experiment_window",sql`${t.windowDays} BETWEEN 1 AND 90`),check("experiment_minimum",sql`${t.minPerArm} >= 30`),check("experiment_metric",sql`${t.metric} IN ('replied','meeting','won')`)]);
export const experimentMembers = pgTable("experiment_members", {
  id: uuid().defaultRandom().primaryKey(), experimentId: uuid("experiment_id").notNull().references(()=>experiments.id,{onDelete:"cascade"}),
  opportunityId: uuid("opportunity_id").notNull().references(()=>opportunities.id,{onDelete:"cascade"}),
  companyId: uuid("company_id").notNull().references(()=>companies.id,{onDelete:"cascade"}),
  arm: text().notNull(), createdBy: uuid("created_by").notNull().references(()=>users.id), ...dates(),
},t=>[uniqueIndex("experiment_company_idx").on(t.experimentId,t.companyId), uniqueIndex("experiment_opportunity_idx").on(t.opportunityId),check("experiment_arm",sql`${t.arm} IN ('A','B')`)]);
