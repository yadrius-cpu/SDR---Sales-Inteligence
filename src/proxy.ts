import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request:NextRequest){
  const nonce=randomBytes(18).toString("base64"),dev=process.env.NODE_ENV==="development";
  const csp=["default-src 'self'",`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev?" 'unsafe-eval'":""}`,"style-src 'self' 'unsafe-inline'","img-src 'self' data: blob:","font-src 'self'","connect-src 'self'","object-src 'none'","base-uri 'self'","form-action 'self'","frame-ancestors 'none'"].join("; ");
  const headers=new Headers(request.headers);headers.set("x-nonce",nonce);headers.set("Content-Security-Policy",csp);
  headers.set("x-pathname",request.nextUrl.pathname);
  const response=NextResponse.next({request:{headers}});
  response.headers.set("Content-Security-Policy",csp);
  response.headers.set("Cache-Control","private, no-store, max-age=0");
  return response;
}
// Do not clone API upload bodies in Proxy; the route enforces a streaming byte limit.
export const config={matcher:["/((?!api/|_next/static|_next/image|favicon.ico).*)"]};
