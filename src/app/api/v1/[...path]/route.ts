import { analyticsRoute } from "@/lib/analytics/service";
import { BodyError, boundedJson } from "@/lib/http-security";
import { reserveLogin } from "@/lib/login-limits";
import { crmRoute } from "@/lib/crm/service";
import { importRoute } from "@/lib/crm/imports";
import { pipelineRoute } from "@/lib/crm/pipeline";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { and, eq, sql, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users, sessions, loginAttempts, products, companies, campaigns, auditEvents, customerDrafts, customerInsights, customerLeads, customerMemberships, customerOrganizations, customerProfiles, customerTasks, invitations, productAccess } from "@/db/schema";
import { currentUser, sessionCookie } from "@/lib/auth";
import { canAdmin, canWrite, hashPassword, hashToken, verifyPasswordAsync } from "@/lib/security";
import { researchRoute } from "@/lib/research/service";
import { ResearchError } from "@/lib/research/contracts";
import { outreachRoute } from "@/lib/outreach/service";
import { conversationRoute } from "@/lib/conversations/service";
import { writingRoute } from "@/lib/writing/service";
const dummyHash = hashPassword(randomBytes(24).toString("hex"));
const fail = (code: string, message: string, status: number) => NextResponse.json({error:{code,message}},{status});
type Context = { params: Promise<{ path: string[] }> };
export async function GET(request: NextRequest, context: Context) { return handle(request,context); }
export async function POST(request: NextRequest, context: Context) { return handle(request,context); }
async function handle(request: NextRequest, context: Context) {
  try {
    const path = (await context.params).path.join("/");
    if([...request.nextUrl.searchParams].some(([key,value])=>key.includes("\0")||value.includes("\0")))return fail("VALIDATION_ERROR","Caractere nulo não permitido.",400);
    const write = request.method === "POST";
    if (write && request.headers.get("origin") !== process.env.APP_ORIGIN) return fail("INVALID_ORIGIN","Origem não permitida.",403);
    const bodyLimit = path === "companies/import" || path.startsWith("customer/leads/import") ? 1048576 : 65536;
    if (write && Number(request.headers.get("content-length") || 0) > bodyLimit) return fail("BODY_TOO_LARGE","Conteúdo excede o limite.",413);
    let body: unknown = {};
    if (write) body = await boundedJson(request,bodyLimit);
    if (path === "auth/login" && write) {
      const input = z.object({email:z.string().email().max(254).transform(v=>v.toLowerCase().trim()),password:z.string().min(1).max(256)}).parse(body);
      if(!await reserveLogin())return fail("RATE_LIMITED","Muitas tentativas. Aguarde um minuto.",429);
      const key = hashToken(input.email);
      const [attempt] = await db.insert(loginAttempts).values({key}).onConflictDoUpdate({target:loginAttempts.key,set:{count:sql`case when ${loginAttempts.windowStart} < now() - interval '15 minutes' then 1 else ${loginAttempts.count} + 1 end`,windowStart:sql`case when ${loginAttempts.windowStart} < now() - interval '15 minutes' then now() else ${loginAttempts.windowStart} end`}}).returning();
      if (attempt.count > 10) return fail("RATE_LIMITED","Muitas tentativas. Aguarde 15 minutos.",429);
      const user = await db.query.users.findFirst({where:eq(users.email,input.email)});
      const valid = await verifyPasswordAsync(input.password,user?.passwordHash ?? dummyHash);
      if (!valid || !user?.active) return fail("INVALID_CREDENTIALS","E-mail ou senha inválidos.",401);
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now()+8*60*60*1000);
      await db.transaction(async tx=>{
        await tx.delete(loginAttempts).where(eq(loginAttempts.key,key));
        await tx.insert(sessions).values({tokenHash:hashToken(token),userId:user.id,expiresAt});
        await tx.insert(auditEvents).values({actorId:user.id,entityType:"user",entityId:user.id,action:"login"});
      });
      (await cookies()).set(sessionCookie,token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",expires:expiresAt});
      return NextResponse.json({data:{role:user.role}});
    }
    if (path === "auth/register" && write) {
      const input = z.object({
        name:z.string().trim().min(2).max(120),
        email:z.string().email().max(254).transform(v=>v.toLowerCase().trim()),
        password:z.string().min(12).max(256),
        companyName:z.string().trim().min(2).max(160),
        domain:z.string().trim().max(253).optional().default(""),
        sector:z.string().trim().max(120).optional().default(""),
      }).parse(body);
      const domain = input.domain.toLowerCase().replace(/^https?:\/\//,"").replace(/\/.*$/,"").trim() || null;
      const existingUser = await db.query.users.findFirst({where:eq(users.email,input.email)});
      if (existingUser) return fail("CONFLICT","Este e-mail já possui uma conta.",409);
      if (domain && await db.query.customerOrganizations.findFirst({where:eq(customerOrganizations.domain,domain)})) return fail("CONFLICT","Este domínio já possui uma empresa cadastrada.",409);
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now()+8*60*60*1000);
      const created = await db.transaction(async tx=>{
        const [newUser] = await tx.insert(users).values({email:input.email,name:input.name,role:"operator",platformRole:"member",passwordHash:hashPassword(input.password)}).returning({id:users.id});
        const [organization] = await tx.insert(customerOrganizations).values({name:input.companyName,domain,sector:input.sector || null}).returning({id:customerOrganizations.id});
        await tx.insert(customerMemberships).values({organizationId:organization.id,userId:newUser.id,role:"company_admin"});
        await tx.insert(productAccess).values({userId:newUser.id,product:"sales_intelligence",organizationId:organization.id,grantedBy:newUser.id});
        await tx.insert(sessions).values({tokenHash:hashToken(token),userId:newUser.id,expiresAt});
        await tx.insert(auditEvents).values({actorId:newUser.id,entityType:"customer_organization",entityId:organization.id,action:"self_registered",metadata:{product:"sales_intelligence"}});
        return {userId:newUser.id,organizationId:organization.id};
      });
      (await cookies()).set(sessionCookie,token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",expires:expiresAt});
      return NextResponse.json({data:{...created,product:"sales_intelligence"}}, {status:201});
    }
    if (path === "team/accept" && write) {
      const input = z.object({token:z.string().min(20).max(200),name:z.string().trim().min(2).max(120),password:z.string().min(12).max(256)}).parse(body);
      const invitation = await db.query.invitations.findFirst({where:eq(invitations.tokenHash,hashToken(input.token))});
      if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date() || !invitation.organizationId) return fail("INVALID_INVITATION","Convite inválido ou expirado.",400);
      if (await db.query.users.findFirst({where:eq(users.email,invitation.email)})) return fail("CONFLICT","Este e-mail já possui uma conta. Solicite ao administrador a associação da conta.",409);
      const sessionToken = randomBytes(32).toString("hex"), expiresAt = new Date(Date.now()+8*60*60*1000);
      const created = await db.transaction(async tx=>{
        const [newUser] = await tx.insert(users).values({email:invitation.email,name:input.name,role:"operator",platformRole:"member",passwordHash:hashPassword(input.password)}).returning({id:users.id});
        await tx.insert(customerMemberships).values({organizationId:invitation.organizationId!,userId:newUser.id,role:invitation.role as "company_admin"|"sales_manager"|"sales_user"|"company_viewer"});
        await tx.insert(productAccess).values({userId:newUser.id,product:invitation.product,organizationId:invitation.organizationId,grantedBy:invitation.createdBy});
        await tx.insert(sessions).values({tokenHash:hashToken(sessionToken),userId:newUser.id,expiresAt});
        await tx.update(invitations).set({acceptedAt:new Date(),updatedAt:new Date()}).where(eq(invitations.id,invitation.id));
        return newUser.id;
      });
      (await cookies()).set(sessionCookie,sessionToken,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",expires:expiresAt});
      return NextResponse.json({data:{userId:created,product:invitation.product}}, {status:201});
    }
    const user = await currentUser();
    if (!user) return fail("UNAUTHENTICATED","Entre para continuar.",401);
    const customerPaths = path === "me" || path === "auth/logout" || path === "customer/insights" || path === "onboarding/profile" || path === "team/members" || path === "team/invite" || path === "customer/leads" || path.startsWith("customer/leads/") || path === "customer/tasks" || path.startsWith("customer/tasks/") || path.startsWith("customer/drafts/");
    if (user.isCustomer && !customerPaths) return fail("FORBIDDEN","Esta área pertence à operação interna da plataforma.",403);
    if (path === "auth/logout" && write) {
      const jar = await cookies(); const token = jar.get(sessionCookie)?.value;
      if (token) await db.delete(sessions).where(eq(sessions.tokenHash,hashToken(token)));
      jar.delete(sessionCookie); return NextResponse.json({data:{ok:true}});
    }
    if (path === "onboarding/profile" && write) {
      const input = z.object({step:z.coerce.number().int().min(1).max(4)}).passthrough().parse(body);
      const membership = await db.query.customerMemberships.findFirst({where:(m,{and,eq})=>and(eq(m.userId,user.id),eq(m.active,true))});
      if (!membership || !["company_admin","sales_manager"].includes(membership.role)) return fail("FORBIDDEN","Somente administradores e gestores podem editar o diagnóstico.",403);
      const organization = await db.query.customerOrganizations.findFirst({where:eq(customerOrganizations.id,membership.organizationId)});
      const answers = Object.fromEntries(Object.entries(input).filter(([key])=>key !== "step").map(([key,value])=>[key,String(value).trim().slice(0,3000)]));
      const current = await db.query.customerProfiles.findFirst({where:eq(customerProfiles.organizationId,membership.organizationId)});
      const merged = {...(current?.answers ?? {}),...answers};
      await db.transaction(async tx=>{
        await tx.insert(customerProfiles).values({organizationId:membership.organizationId,answers:merged}).onConflictDoUpdate({target:customerProfiles.organizationId,set:{answers:merged,updatedAt:new Date()}});
        await tx.update(customerOrganizations).set({onboardingStep:Math.max(organization?.onboardingStep ?? 0,input.step),updatedAt:new Date()}).where(eq(customerOrganizations.id,membership.organizationId));
        if (input.step === 4) {
          const insights: {kind:string;title:string;summary:string;details:Record<string,string>}[] = [
            {kind:"icp",title:"Perfil de cliente ideal",summary:merged.targetSegments || "Definir segmentos prioritários",details:{porte:merged.targetSize || "Não informado",regioes:merged.regions || "Não informado",criterios_exclusao:merged.exclusionCriteria || "Não informado"}},
            {kind:"persona",title:"Persona e decisor principal",summary:merged.decisionMakers || "Identificar o principal decisor",details:{dores:merged.customerPainPoints || "Não informado",abordagem:"Validar a dor em uma conversa de descoberta"}},
            {kind:"priorities",title:"Prioridades comerciais",summary:merged.salesChallenges || "Investigar os maiores desafios comerciais",details:{canais:merged.salesChannels || "Não informado",diferenciais:merged.differentiators || "Não informado",ciclo:merged.salesCycle || "Não informado"}},
          ];
          for (const insight of insights) await tx.insert(customerInsights).values({organizationId:membership.organizationId,...insight}).onConflictDoUpdate({target:[customerInsights.organizationId,customerInsights.kind],set:{title:insight.title,summary:insight.summary,details:insight.details,updatedAt:new Date()}});
        }
      });
      return NextResponse.json({data:{step:input.step,completed:input.step===4}});
    }
    if (path === "customer/insights" && !write) {
      const membership = await db.query.customerMemberships.findFirst({where:(m,{and,eq})=>and(eq(m.userId,user.id),eq(m.active,true))});
      if (!membership) return fail("FORBIDDEN","Usuário não vinculado a uma empresa.",403);
      return NextResponse.json({data:await db.select().from(customerInsights).where(eq(customerInsights.organizationId,membership.organizationId)).orderBy(customerInsights.kind)});
    }
    if (path === "team/members" && !write) {
      const membership = await db.query.customerMemberships.findFirst({where:(m,{and,eq})=>and(eq(m.userId,user.id),eq(m.active,true))});
      if (!membership) return fail("FORBIDDEN","Usuário não vinculado a uma empresa.",403);
      const rows = await db.select({id:users.id,name:users.name,email:users.email,role:customerMemberships.role,active:customerMemberships.active}).from(customerMemberships).innerJoin(users,eq(customerMemberships.userId,users.id)).where(eq(customerMemberships.organizationId,membership.organizationId));
      return NextResponse.json({data:rows});
    }
    if (path === "team/invite" && write) {
      const input = z.object({email:z.string().email().max(254).transform(v=>v.toLowerCase().trim()),role:z.enum(["company_admin","sales_manager","sales_user","company_viewer"])}).parse(body);
      const membership = await db.query.customerMemberships.findFirst({where:(m,{and,eq})=>and(eq(m.userId,user.id),eq(m.active,true))});
      if (!membership || membership.role !== "company_admin") return fail("FORBIDDEN","Somente o administrador da empresa pode convidar usuários.",403);
      const existing = await db.query.customerMemberships.findFirst({where:(m,{and,eq})=>and(eq(m.organizationId,membership.organizationId),eq(m.active,true))});
      const existingEmail = await db.query.users.findFirst({where:eq(users.email,input.email)});
      if (existingEmail) return fail("CONFLICT","Este e-mail já possui uma conta.",409);
      const token = randomBytes(32).toString("hex");
      const [invitation] = await db.insert(invitations).values({email:input.email,organizationId:membership.organizationId,product:"sales_intelligence",role:input.role,tokenHash:hashToken(token),expiresAt:new Date(Date.now()+7*24*60*60*1000),createdBy:user.id}).returning({id:invitations.id});
      return NextResponse.json({data:{id:invitation.id,inviteUrl:request.nextUrl.origin+"/invite?token="+encodeURIComponent(token),expiresInDays:7}});
    }
    if (path === "customer/leads" && !write) {
      if (!user.customerOrganizationId) return fail("FORBIDDEN","Usuário não vinculado a uma empresa.",403);
      return NextResponse.json({data:await db.select().from(customerLeads).where(eq(customerLeads.organizationId,user.customerOrganizationId)).orderBy(desc(customerLeads.createdAt))});
    }
    if (path === "customer/leads" && write) {
      if (!user.customerOrganizationId || user.customerRole === "company_viewer") return fail("FORBIDDEN","Seu perfil não pode cadastrar leads.",403);
      const input = z.object({companyName:z.string().trim().min(2).max(160),domain:z.string().trim().max(253).optional().default(""),contactName:z.string().trim().max(120).optional().default(""),contactTitle:z.string().trim().max(120).optional().default(""),contactEmail:z.string().email().max(254).optional().or(z.literal("")).default(""),status:z.enum(["new","qualified","contacted","meeting","won","lost"]).default("new"),nextAction:z.string().trim().max(500).optional().default(""),notes:z.string().trim().max(3000).optional().default("")}).parse(body);
      const [lead] = await db.insert(customerLeads).values({...input,organizationId:user.customerOrganizationId,ownerId:user.id}).returning();
      return NextResponse.json({data:lead},{status:201});
    }
    if ((path === "customer/leads/import/preview" || path === "customer/leads/import/commit") && write) {
      if (!user.customerOrganizationId || user.customerRole === "company_viewer") return fail("FORBIDDEN","Seu perfil não pode importar leads.",403);
      const input = z.object({rows:z.array(z.object({companyName:z.string().trim().min(2).max(160),domain:z.string().trim().max(253).default(""),contactName:z.string().trim().max(120).default(""),contactTitle:z.string().trim().max(120).default(""),contactEmail:z.string().email().max(254).or(z.literal("")).default(""),nextAction:z.string().trim().max(500).default(""),notes:z.string().trim().max(3000).default("")})).min(1).max(200),confirmation:z.literal("confirmed").optional()}).parse(body);
      const existing = await db.select({companyName:customerLeads.companyName,domain:customerLeads.domain}).from(customerLeads).where(eq(customerLeads.organizationId,user.customerOrganizationId));
      const normalize = (value:string) => value.trim().toLowerCase();
      const seen:{companyName:string;domain:string}[] = [];
      const marked = input.rows.map((row,index)=>{
        const duplicate = existing.some(item=>(row.domain && item.domain && normalize(row.domain)===normalize(item.domain)) || normalize(row.companyName)===normalize(item.companyName)) || seen.some(item=>(row.domain && item.domain && normalize(row.domain)===normalize(item.domain)) || normalize(row.companyName)===normalize(item.companyName));
        if (!duplicate) seen.push({companyName:row.companyName,domain:row.domain});
        return {...row,line:index+2,duplicate};
      });
      if (path.endsWith("/preview")) return NextResponse.json({data:{rows:marked,total:marked.length,duplicates:marked.filter(row=>row.duplicate).length}});
      if (input.confirmation !== "confirmed") return fail("CONFIRMATION_REQUIRED","Confirme a prévia antes de importar.",400);
      let created=0,skipped=0;
      for (const row of marked) {
        if (row.duplicate) { skipped++; continue; }
        await db.insert(customerLeads).values({organizationId:user.customerOrganizationId,companyName:row.companyName,domain:row.domain || null,contactName:row.contactName || null,contactTitle:row.contactTitle || null,contactEmail:row.contactEmail || null,nextAction:row.nextAction || null,notes:row.notes || null,ownerId:user.id});
        created++;
      }
      return NextResponse.json({data:{created,skipped,total:marked.length}});
    }
    if (path.startsWith("customer/leads/") && path.endsWith("/edit") && write) {
      if (!user.customerOrganizationId || user.customerRole === "company_viewer") return fail("FORBIDDEN","Seu perfil não pode editar leads.",403);
      const leadId = path.split("/")[2];
      if (!z.uuid().safeParse(leadId).success) return fail("VALIDATION_ERROR","Lead inválido.",400);
      const input = z.object({companyName:z.string().trim().min(2).max(160),domain:z.string().trim().max(253).optional().default(""),contactName:z.string().trim().max(120).optional().default(""),contactTitle:z.string().trim().max(120).optional().default(""),contactEmail:z.string().email().max(254).optional().or(z.literal("")).default(""),status:z.enum(["new","qualified","contacted","meeting","won","lost"]),nextAction:z.string().trim().max(500).optional().default(""),notes:z.string().trim().max(3000).optional().default("")}).parse(body);
      const [lead] = await db.update(customerLeads).set({...input,updatedAt:new Date()}).where(and(eq(customerLeads.id,leadId),eq(customerLeads.organizationId,user.customerOrganizationId))).returning();
      if (!lead) return fail("NOT_FOUND","Lead não encontrado.",404);
      return NextResponse.json({data:lead});
    }
    if (path.startsWith("customer/leads/") && path.endsWith("/analyze") && write) {
      if (!user.customerOrganizationId || user.customerRole === "company_viewer") return fail("FORBIDDEN","Seu perfil não pode analisar leads.",403);
      const leadId = path.split("/")[2];
      const lead = await db.query.customerLeads.findFirst({where:(l,{and,eq})=>and(eq(l.id,leadId),eq(l.organizationId,user.customerOrganizationId!))});
      if (!lead) return fail("NOT_FOUND","Lead não encontrado.",404);
      const profile = await db.query.customerProfiles.findFirst({where:eq(customerProfiles.organizationId,user.customerOrganizationId)});
      const answers = profile?.answers ?? {}, text = [lead.companyName,lead.domain ?? "",lead.contactTitle ?? ""].join(" ").toLowerCase();
      const target = (answers.targetSegments ?? "").toLowerCase(), title = (lead.contactTitle ?? "").toLowerCase();
      let score = 25, reasons:string[] = [];
      if (target && target.split(/[,;\n]/).some(item=>item.trim() && text.includes(item.trim()))) { score += 30; reasons.push("segmento ou descrição compatível com o cliente ideal"); }
      if (lead.domain) { score += 10; reasons.push("domínio informado"); }
      if (lead.contactName) { score += 10; reasons.push("contato identificado"); }
      if (lead.contactEmail) { score += 10; reasons.push("e-mail profissional informado"); }
      if (title && /(diretor|sócio|socia|owner|gestor|gerente|administr|finance|segurança|security|ceo)/i.test(title)) { score += 15; reasons.push("cargo pode participar da decisão"); }
      score = Math.min(100,score);
      const persona = lead.contactTitle || answers.decisionMakers || "decisor ainda não identificado";
      const action = lead.contactName ? "Pesquisar contexto do contato e preparar uma pergunta de descoberta." : "Identificar o decisor responsável pelo problema.";
      const reason = reasons.length ? reasons.join("; ")+ "." : "Ainda há pouca informação para confirmar aderência ao ICP.";
      const [updated] = await db.update(customerLeads).set({fitScore:score,fitReason:reason,recommendedAction:action,personaHypothesis:persona,intelligenceStatus:"hypothesis",updatedAt:new Date()}).where(and(eq(customerLeads.id,leadId),eq(customerLeads.organizationId,user.customerOrganizationId))).returning();
      return NextResponse.json({data:updated});
    }
    if (path.startsWith("customer/leads/") && path.endsWith("/draft") && write) {
      if (!user.customerOrganizationId || user.customerRole === "company_viewer") return fail("FORBIDDEN","Seu perfil não pode criar abordagens.",403);
      const leadId = path.split("/")[2];
      const lead = await db.query.customerLeads.findFirst({where:(l,{and,eq})=>and(eq(l.id,leadId),eq(l.organizationId,user.customerOrganizationId!))});
      if (!lead) return fail("NOT_FOUND","Lead não encontrado.",404);
      const profile = await db.query.customerProfiles.findFirst({where:eq(customerProfiles.organizationId,user.customerOrganizationId)});
      const answers = profile?.answers ?? {}, recipient = lead.contactName || "tudo bem", segment = answers.targetSegments || "o segmento de vocês", pain = answers.customerPainPoints || "esse desafio";
      const message = "Olá, "+recipient+". Vi que a "+lead.companyName+" atua em "+segment+". Gostaria de entender como vocês lidam hoje com "+pain+". Quem costuma participar dessa avaliação por aí?";
      const rationale = "Pergunta de descoberta baseada no segmento e na dor informados pela empresa. Não presume problema, ferramenta ou capacidade do produto.";
      const [draft] = await db.insert(customerDrafts).values({organizationId:user.customerOrganizationId,leadId,channel:"manual",message,rationale,createdBy:user.id}).returning();
      return NextResponse.json({data:draft},{status:201});
    }
    if (path.startsWith("customer/drafts/") && path.endsWith("/edit") && write) {
      if (!user.customerOrganizationId || user.customerRole === "company_viewer") return fail("FORBIDDEN","Seu perfil não pode editar abordagens.",403);
      const draftId = path.split("/")[2], input = z.object({message:z.string().trim().min(20).max(3000)}).parse(body);
      const [draft] = await db.update(customerDrafts).set({message:input.message,status:"draft",approvedBy:null,approvedAt:null,updatedAt:new Date()}).where(and(eq(customerDrafts.id,draftId),eq(customerDrafts.organizationId,user.customerOrganizationId))).returning();
      if (!draft) return fail("NOT_FOUND","Rascunho não encontrado.",404);
      return NextResponse.json({data:draft});
    }
    if (path.startsWith("customer/drafts/") && path.endsWith("/status") && write) {
      if (!user.customerOrganizationId || user.customerRole === "company_viewer") return fail("FORBIDDEN","Seu perfil não pode aprovar abordagens.",403);
      const draftId = path.split("/")[2], input = z.object({status:z.enum(["approved","rejected","draft"])}).parse(body);
      const [draft] = await db.update(customerDrafts).set({status:input.status,approvedBy:input.status==="approved"?user.id:null,approvedAt:input.status==="approved"?new Date():null,updatedAt:new Date()}).where(and(eq(customerDrafts.id,draftId),eq(customerDrafts.organizationId,user.customerOrganizationId))).returning();
      if (!draft) return fail("NOT_FOUND","Rascunho não encontrado.",404);
      return NextResponse.json({data:draft});
    }
    if (path === "customer/tasks" && !write) {
      if (!user.customerOrganizationId) return fail("FORBIDDEN","Usuário não vinculado a uma empresa.",403);
      return NextResponse.json({data:await db.select({task:customerTasks,companyName:customerLeads.companyName}).from(customerTasks).innerJoin(customerLeads,eq(customerTasks.leadId,customerLeads.id)).where(eq(customerTasks.organizationId,user.customerOrganizationId)).orderBy(customerTasks.dueAt)});
    }
    if (path === "customer/tasks" && write) {
      if (!user.customerOrganizationId || user.customerRole === "company_viewer") return fail("FORBIDDEN","Seu perfil não pode criar tarefas.",403);
      const input = z.object({leadId:z.uuid(),dueAt:z.string().datetime(),description:z.string().trim().min(3).max(500)}).parse(body);
      const lead = await db.query.customerLeads.findFirst({where:(l,{and,eq})=>and(eq(l.id,input.leadId),eq(l.organizationId,user.customerOrganizationId!))});
      if (!lead) return fail("NOT_FOUND","Lead não encontrado.",404);
      const [task] = await db.insert(customerTasks).values({organizationId:user.customerOrganizationId,leadId:input.leadId,assigneeId:user.id,dueAt:new Date(input.dueAt),description:input.description}).returning();
      return NextResponse.json({data:task},{status:201});
    }
    if (path.startsWith("customer/tasks/") && path.endsWith("/status") && write) {
      if (!user.customerOrganizationId || user.customerRole === "company_viewer") return fail("FORBIDDEN","Seu perfil não pode alterar tarefas.",403);
      const taskId = path.split("/")[2], input = z.object({status:z.enum(["pending","done","cancelled"])}).parse(body);
      const [task] = await db.update(customerTasks).set({status:input.status,updatedAt:new Date()}).where(and(eq(customerTasks.id,taskId),eq(customerTasks.organizationId,user.customerOrganizationId))).returning();
      if (!task) return fail("NOT_FOUND","Tarefa não encontrada.",404);
      return NextResponse.json({data:task});
    }
    if (path.startsWith("admin/") && !canAdmin(user.role)) return fail("FORBIDDEN","Acesso reservado ao administrador.",403);
    if (write && !canWrite(user.role)) return fail("FORBIDDEN","Seu perfil permite apenas leitura.",403);
    const analyticsResponse = await analyticsRoute(path,write,body,user,request.nextUrl.searchParams); if(analyticsResponse) return analyticsResponse;
    const importResponse = await importRoute(path,write,body,user); if(importResponse) return importResponse;
    const pipelineResponse = await pipelineRoute(path,write,body,user); if(pipelineResponse) return pipelineResponse;
    const crmResponse = await crmRoute(path,write,body,user,request.nextUrl.searchParams); if(crmResponse) return crmResponse;
    const writingResponse = await writingRoute(path,write,body,user);
    if (writingResponse) return writingResponse;
    const conversationResponse = await conversationRoute(path,write,body,user);
    if (conversationResponse) return conversationResponse;
    const outreachResponse = await outreachRoute(path,write,body,user,request.nextUrl.searchParams.get("page"));
    if (outreachResponse) return outreachResponse;
    const researchResponse = await researchRoute(path,write,body,user,request.nextUrl.searchParams.get("page"));
    if (researchResponse) return researchResponse;
    if (path === "me" && !write) return NextResponse.json({data:user});
    if (path === "admin/users" && !write) return NextResponse.json({data:await db.select({id:users.id,name:users.name,role:users.role,active:users.active}).from(users)});
    if (path === "admin/audit" && !write) return NextResponse.json({data:await db.select().from(auditEvents).orderBy(desc(auditEvents.happenedAt)).limit(50)});
    if (path === "products" && !write) return NextResponse.json({data:await db.select().from(products)});
    if (path === "campaigns" && !write) {
      const page = z.coerce.number().int().min(1).max(10000).parse(request.nextUrl.searchParams.get("page") ?? 1);
      const data = await db.select().from(campaigns).orderBy(desc(campaigns.createdAt)).limit(50).offset((page-1)*50);
      return NextResponse.json({data,pagination:{page,pageSize:50}});
    }
    return fail("NOT_FOUND","Recurso não encontrado.",404);
  } catch (error) {
    if (error instanceof BodyError) return fail(error.code,error.message,error.status);
    if (error instanceof ResearchError) return fail(error.code,error.message,error.status);
    if (error instanceof z.ZodError) return fail("VALIDATION_ERROR","Revise os campos informados.",400);
    console.error("api_request_failed");
    return fail("INTERNAL_ERROR","Não foi possível concluir. Verifique o serviço e tente novamente.",500);
  }
}
