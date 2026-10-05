import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "../src/db";
async function main() { await migrate(db,{migrationsFolder:"drizzle"}); console.log("Migrações aplicadas."); }
main().catch(()=>{console.error("Falha na migração; confira conexão e schema.");process.exitCode=1;}).finally(()=>pool.end());
