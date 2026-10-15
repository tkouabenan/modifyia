import bcrypt from "bcryptjs";
import { initDb, execSql, oneSql } from "../src/lib/db";
import { now } from "../src/lib/server/config";
import { id } from "../src/lib/server/security";
import type { UserRow } from "../src/lib/server/records";

await initDb();

const email = (process.env.ADMIN_EMAIL || "admin@modify.ai").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || "ModifyAdmin2026!";
const hash = await bcrypt.hash(password, 12);
const existing = await oneSql<UserRow>("SELECT * FROM users WHERE email=?", [
  email,
]);
if (existing) {
  await execSql(
    "UPDATE users SET role='admin',password_hash=?,email_verified=1,suspended=0,credits=CASE WHEN credits<100000 THEN 100000 ELSE credits END,updated_at=? WHERE id=?",
    [hash, now(), existing.id],
  );
  console.log(`Super admin ready: ${email}`);
} else {
  const uid = id();
  await execSql(
    "INSERT INTO users(id,email,password_hash,name,role,credits,email_verified,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,?)",
    [
      uid,
      email,
      hash,
      "MODIFY Super Admin",
      "admin",
      100000,
      now(),
      now(),
    ],
  );
  await execSql("INSERT INTO profiles(user_id) VALUES(?)", [uid]);
  await execSql(
    "INSERT INTO credit_transactions(id,user_id,amount,reason,reference_id,created_at) VALUES(?,?,?,?,?,?)",
    [id(), uid, 100000, "Super admin test allowance", `admin-seed:${uid}`, now()],
  );
  console.log(`Super admin created: ${email}`);
}
console.log("Sign in at /login with the ADMIN_EMAIL / ADMIN_PASSWORD values.");
console.log("Database schema is ready.");
process.exit(0);
