import type { Metadata } from "next";
import { connection } from "next/server";
import "./globals.css";
import "./research.css";
import "./form-layout.css";
import "./sidebar-layout.css";
import "./spacing-fixes.css";
import "./help-layout.css";
import "./help-animation.css";
export const metadata: Metadata = {title:"PhishShield · Sales Intelligence",description:"Inteligência comercial com evidências e revisão humana"};
export default async function RootLayout({children}:{children:React.ReactNode}) {await connection();return <html lang="pt-BR"><body>{children}</body></html>;}
