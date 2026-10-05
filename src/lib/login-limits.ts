import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { loginAttempts } from "../db/schema";
export const GLOBAL_LOGIN_KEY="global:login:v1";
// Shared persistent gate before password hashing; never trust client-supplied IP headers.
export async function reserveLogin(){
  return db.transaction(async tx=>{
    await tx.insert(loginAttempts).values({key:GLOBAL_LOGIN_KEY,count:0}).onConflictDoNothing();
    const [row]=await tx.select().from(loginAttempts).where(eq(loginAttempts.key,GLOBAL_LOGIN_KEY)).for("update");
    const now=new Date(),expired=+now-+row.windowStart>=60000;
    if(!expired&&row.count>=60)return false;
    await tx.update(loginAttempts).set({count:expired?1:row.count+1,windowStart:expired?now:row.windowStart}).where(eq(loginAttempts.key,GLOBAL_LOGIN_KEY));
    await tx.delete(loginAttempts).where(sql`${loginAttempts.windowStart} < now() - interval '24 hours'`);
    return true;
  });
}
