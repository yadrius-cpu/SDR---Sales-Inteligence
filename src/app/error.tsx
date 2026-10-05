"use client";
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="login"><h1>Não foi possível carregar os dados.</h1><p>Verifique se o banco está disponível e se as migrações foram aplicadas.</p><button onClick={reset}>Tentar novamente</button></main>;}
