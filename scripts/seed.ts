import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../src/db";
import { users, products, campaigns, companies, productAccess } from "../src/db/schema";
import { hashPassword } from "../src/lib/security";
async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Seed fictício não permitido em produção.");
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 12) throw new Error("Defina SEED_PASSWORD com 12 ou mais caracteres.");
  await db.transaction(async tx=>{
    for (const role of ["owner","operator","viewer"] as const) await tx.insert(users).values({email:`${role}@demo.invalid`,name:`Demonstração ${role}`,role,platformRole:role === "owner" ? "superadmin" : "member",passwordHash:hashPassword(password)}).onConflictDoNothing();
    const owner = await tx.query.users.findFirst({where:(u,{eq})=>eq(u.email,"owner@demo.invalid")});
    const people = await tx.select({id:users.id,email:users.email}).from(users).where(sql`${users.email} in ('owner@demo.invalid','operator@demo.invalid','viewer@demo.invalid')`);
    const existingAccess = await tx.select({userId:productAccess.userId,product:productAccess.product}).from(productAccess);
    const accessKeys = new Set(existingAccess.map(item=>`${item.userId}:${item.product}`));
    if (owner) await tx.update(users).set({platformRole:"superadmin"}).where(eq(users.id,owner.id));
    for (const person of people) {
      if (!accessKeys.has(`${person.id}:sales_intelligence`)) await tx.insert(productAccess).values({userId:person.id,product:"sales_intelligence",grantedBy:owner?.id});
      if (person.email === "owner@demo.invalid" && owner && !accessKeys.has(`${person.id}:phishshield`)) await tx.insert(productAccess).values({userId:person.id,product:"phishshield",grantedBy:owner.id});
    }
    const [product] = await tx.insert(products).values({name:"PhishShield",description:"Produto em validação de catálogo. Capacidades comerciais ainda não confirmadas.",approvedClaims:[],prohibitedClaims:["Cobertura de WhatsApp","Análise de anexos","Integrações não validadas"]}).onConflictDoNothing().returning();
    if (product && owner) {
      await tx.insert(campaigns).values({productId:product.id,name:"Piloto · Contabilidades brasileiras",sector:"Contabilidade",employeeMin:5,employeeMax:50,targetRoles:["Sócio(a)","Direção","Administrativo/financeiro"],ownerId:owner.id});
      await tx.insert(companies).values(["Aurora Contabilidade (fictícia)","Horizonte Contábil (fictícia)"].map((displayName,i)=>({displayName,domainNormalized:`contabilidade-demo-${i}.invalid`,sector:"Contabilidade",ownerId:owner.id})));
    }
  });
  console.log("Seed concluído: owner@demo.invalid, operator@demo.invalid, viewer@demo.invalid. Senha definida em SEED_PASSWORD. Usuários existentes preservados.");
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
