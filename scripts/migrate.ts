import { getDb } from "../src/lib/db";
getDb().then((db) => { console.log(`schema ready (${db.dialect})`); process.exit(0); });
