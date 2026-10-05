import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { customerMemberships, productAccess, sessions, users } from "@/db/schema";
import { hashToken } from "./security";
export const sessionCookie = "sales_session";
export async function currentUser() {
  const token = (await cookies()).get(sessionCookie)?.value;
  if (!token) return null;
  const [row] = await db.select({id:users.id,name:users.name,role:users.role,platformRole:users.platformRole}).from(sessions).innerJoin(users,eq(sessions.userId,users.id)).where(and(eq(sessions.tokenHash,hashToken(token)),gt(sessions.expiresAt,new Date()),eq(users.active,true)));
  if (!row) return null;
  const access = await db.select({product:productAccess.product,organizationId:productAccess.organizationId}).from(productAccess).where(and(eq(productAccess.userId,row.id),eq(productAccess.active,true)));
  const [membership] = await db.select({organizationId:customerMemberships.organizationId,role:customerMemberships.role}).from(customerMemberships).where(and(eq(customerMemberships.userId,row.id),eq(customerMemberships.active,true)));
  const products = access.length ? access.map(item=>item.product) : row.platformRole === "superadmin" || row.role === "owner" ? ["sales_intelligence","phishshield"] : ["sales_intelligence"];
  return {...row,products,customerOrganizationId:membership?.organizationId ?? null,customerRole:membership?.role ?? null,isCustomer:Boolean(membership)};
}
export async function requireUser() { const user = await currentUser(); if (!user) redirect("/login"); return user; }
export async function requireProduct(product:"phishshield"|"sales_intelligence") { const user = await requireUser(); if (!user.products.includes(product)) redirect("/forbidden"); return user; }
