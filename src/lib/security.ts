import { randomBytes, scryptSync, scrypt, timingSafeEqual, createHash } from "node:crypto";
export type Role = "owner" | "operator" | "viewer";
export function canWrite(role: Role) { return role === "owner" || role === "operator"; }
export function canAdmin(role: Role) { return role === "owner"; }
export function hashToken(value: string) { return createHash("sha256").update(value).digest("hex"); }
export function hashPassword(password: string) { const salt = randomBytes(16).toString("hex"); return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`; }
export function verifyPassword(password: string, encoded: string) { const [salt, hash] = encoded.split(":"); if (!salt || !hash) return false; const actual = scryptSync(password, salt, 64); const expected = Buffer.from(hash,"hex"); return actual.length === expected.length && timingSafeEqual(actual, expected); }
export async function verifyPasswordAsync(password:string,encoded:string){
  const [salt,hash]=encoded.split(":");if(!salt||!hash)return false;
  const actual=await new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,64,(error,key)=>error?reject(error):resolve(key)));
  const expected=Buffer.from(hash,"hex");return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
export function normalizeDomain(input: string) {
  if (!input.trim()) return null;
  const url = new URL(input.includes("://") ? input : `https://${input}`);
  if (!["http:","https:"].includes(url.protocol) || url.username || url.password || !url.hostname.includes(".")) throw new Error("Domínio inválido");
  return url.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}
