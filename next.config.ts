import type { NextConfig } from "next";
const config:NextConfig={
  poweredByHeader:false,
  async headers(){
    return [{source:"/:path*",headers:[
      {key:"X-Frame-Options",value:"DENY"},
      {key:"X-Content-Type-Options",value:"nosniff"},
      {key:"Referrer-Policy",value:"no-referrer"},
      {key:"Permissions-Policy",value:"camera=(), microphone=(), geolocation=()"},
      ...(process.env.APP_ORIGIN?.startsWith("https://")?[{key:"Strict-Transport-Security",value:"max-age=31536000"}]:[]),
    ]},{source:"/api/:path*",headers:[
      {key:"Cache-Control",value:"private, no-store, max-age=0"},
      {key:"Content-Security-Policy",value:"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"},
    ]}];
  },
};
export default config;
