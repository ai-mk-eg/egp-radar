// Fold the SQLite WAL into the main file so the single .db file can be committed safely.
import Database from "better-sqlite3";
const db = new Database(process.argv[2] || "data/egp-radar.db");
db.pragma("wal_checkpoint(TRUNCATE)"); db.pragma("journal_mode = DELETE"); db.close();
console.log("checkpointed");
