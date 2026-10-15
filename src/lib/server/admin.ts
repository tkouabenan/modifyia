import type {
  AuditRow,
  JobRow,
  PaymentRow,
  SubscriptionRow,
  UsageRow,
  UserRow,
} from "./records";
import { execSql, querySql, transaction } from "../db";
import { now, pricing } from "./config";
import { requireAccount } from "./auth";
import { assert, id } from "./security";
import { z } from "zod";
export async function requireAdmin(req: Request) {
  const user = await requireAccount(req, true);
  assert(user.role === "admin", "Administrator access is required.", 403);
  return user;
}
export async function adminData() {
  const [users, jobs, usage, payments, subscriptions, audit, settings] =
    await Promise.all([
      querySql<UserRow>(
        "SELECT id,email,name,role,credits,email_verified,suspended,created_at FROM users WHERE role<>'guest' ORDER BY created_at DESC LIMIT 100",
      ),
      querySql<JobRow & { email: string; project_name: string }>(
        "SELECT j.*,u.email,p.name AS project_name FROM generation_jobs j JOIN users u ON u.id=j.user_id JOIN projects p ON p.id=j.project_id ORDER BY j.created_at DESC LIMIT 100",
      ),
      querySql<UsageRow>(
        "SELECT * FROM provider_usage ORDER BY created_at DESC LIMIT 100",
      ),
      querySql<PaymentRow>(
        "SELECT * FROM payment_transactions ORDER BY created_at DESC LIMIT 100",
      ),
      querySql<SubscriptionRow & { email: string }>(
        "SELECT s.*,u.email FROM subscriptions s JOIN users u ON u.id=s.user_id ORDER BY s.created_at DESC LIMIT 100",
      ),
      querySql<AuditRow>(
        "SELECT * FROM admin_audit_logs ORDER BY created_at DESC LIMIT 50",
      ),
      pricing(),
    ]);
  return { users, jobs, usage, payments, subscriptions, audit, settings };
}
export async function adminAction(
  adminId: string,
  body: Record<string, unknown>,
) {
  const action = String(body.action);
  await transaction(async () => {
    if (action === "credits") {
      const amount = Number(body.amount),
        uid = String(body.user_id);
      assert(
        Number.isSafeInteger(amount) &&
          Math.abs(amount) <= 1_000_000 &&
          amount !== 0,
        "Enter a non-zero whole credit adjustment.",
      );
      const updated = await execSql(
        "UPDATE users SET credits=credits+?,updated_at=? WHERE id=? AND credits+? >=0",
        [amount, now(), uid, amount],
      );
      assert(
        updated,
        "User not found or the adjustment would make their balance negative.",
      );
      await execSql(
        "INSERT INTO credit_transactions(id,user_id,amount,reason,reference_id,created_at) VALUES(?,?,?,?,?,?)",
        [
          id(),
          uid,
          amount,
          "Administrator credit adjustment",
          `admin:${id()}`,
          now(),
        ],
      );
    } else if (action === "suspend") {
      const uid = String(body.user_id);
      assert(
        uid !== adminId,
        "You cannot suspend your own administrator account.",
      );
      const changed = await execSql(
        "UPDATE users SET suspended=?,updated_at=? WHERE id=? AND role<>?",
        [body.suspended ? 1 : 0, now(), uid, "admin"],
      );
      assert(changed, "This account cannot be modified.");
      if (body.suspended)
        await execSql("DELETE FROM sessions WHERE user_id=?", [uid]);
    } else if (action === "pricing") {
      const parsed = z
        .object({
          creditsPerSecond: z.number().int().min(1).max(1000),
          providerCostPerSecondCents: z.number().min(0).max(10000),
          trialCredits: z.number().int().min(0).max(10000),
          plans: z
            .array(
              z.object({
                id: z.enum(["free", "creator", "pro"]),
                name: z.string().min(1).max(40),
                price: z.number().int().min(0).max(1000000),
                credits: z.number().int().min(0).max(1000000),
                storageMb: z.number().int().min(1).max(1000000),
                history: z.string().max(100),
                features: z.array(z.string().max(200)).max(10),
              }),
            )
            .length(3),
        })
        .safeParse(body.settings);
      assert(parsed.success, "Invalid pricing configuration.");
      assert(
        new Set(parsed.data.plans.map((p) => p.id)).size === 3,
        "Each plan must appear exactly once.",
      );
      await execSql(
        "INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
        ["pricing", JSON.stringify(parsed.data), now()],
      );
    } else assert(false, "Unknown administrator action.");
    await execSql(
      "INSERT INTO admin_audit_logs(id,admin_id,action,target_id,details,created_at) VALUES(?,?,?,?,?,?)",
      [
        id(),
        adminId,
        action,
        body.user_id ? String(body.user_id) : null,
        JSON.stringify(body),
        now(),
      ],
    );
  });
  return { message: "Administrative change saved and audited." };
}
