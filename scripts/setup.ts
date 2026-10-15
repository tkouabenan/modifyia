import { initDb, execSql } from "../src/lib/db";
import { now } from "../src/lib/server/config";
await initDb();
if (process.env.ADMIN_EMAIL) {
  const changes = await execSql(
    "UPDATE users SET role='admin',updated_at=? WHERE email=? AND role<>'guest'",
    [now(), process.env.ADMIN_EMAIL.toLowerCase()],
  );
  console.log(
    changes
      ? "Administrator role assigned."
      : "Register the ADMIN_EMAIL account first, then run db:setup again.",
  );
}
console.log("Database schema is ready.");
process.exit(0);
