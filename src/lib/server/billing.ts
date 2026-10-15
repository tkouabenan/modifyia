import type { SubscriptionRow, UserRow } from "./records";
import Stripe from "stripe";
import { execSql, oneSql, transaction } from "../db";
import { plans, now } from "./config";
import { assert, id, AppError, requestOrigin } from "./security";
export function stripeClient() {
  assert(
    process.env.STRIPE_SECRET_KEY,
    "Stripe is not configured. Add the server-side Stripe keys to enable billing.",
    503,
  );
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}
export async function checkout(req: Request, userId: string, planId: string) {
  const plan = (await plans()).find((p) => p.id === planId);
  assert(plan && planId !== "free", "Choose Creator or Pro.");
  const priceId = process.env[`STRIPE_${planId.toUpperCase()}_PRICE_ID`];
  assert(
    priceId && process.env.STRIPE_WEBHOOK_SECRET,
    "This plan is not configured for payments yet.",
    503,
  );
  const stripe = stripeClient();
  const user = await oneSql<UserRow>("SELECT * FROM users WHERE id=?", [
    userId,
  ]);
  assert(
    user && user.role !== "guest",
    "Create an account before choosing a plan.",
    401,
  );
  const existing = await oneSql<SubscriptionRow>(
    "SELECT id FROM subscriptions WHERE user_id=? AND status IN ('active','trialing','past_due')",
    [userId],
  );
  assert(
    !existing,
    "Manage your existing subscription through the billing portal.",
    409,
  );
  const price = await stripe.prices.retrieve(priceId);
  assert(
    price.active &&
      price.recurring?.interval === "month" &&
      price.currency === "usd" &&
      price.unit_amount === plan.price,
    "The Stripe price must match the configured monthly USD plan.",
    503,
  );
  let customer = user.stripe_customer_id;
  if (!customer) {
    customer = (
      await stripe.customers.create(
        {
          email: user.email || undefined,
          name: user.name,
          metadata: { user_id: userId },
        },
        { idempotencyKey: `customer:${userId}` },
      )
    ).id;
    await execSql("UPDATE users SET stripe_customer_id=? WHERE id=?", [
      customer,
      userId,
    ]);
  }
  const session = await stripe.checkout.sessions.create({
    customer,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: userId,
    metadata: { user_id: userId, plan: planId },
    subscription_data: { metadata: { user_id: userId, plan: planId } },
    success_url: `${requestOrigin(req)}/billing?checkout=success`,
    cancel_url: `${requestOrigin(req)}/billing?checkout=cancelled`,
    allow_promotion_codes: true,
  });
  return { url: session.url };
}
export async function billingPortal(req: Request, userId: string) {
  const user = await oneSql<UserRow>(
    "SELECT stripe_customer_id FROM users WHERE id=?",
    [userId],
  );
  assert(
    user?.stripe_customer_id,
    "No billing account exists yet. Choose a paid plan first.",
  );
  const session = await stripeClient().billingPortal.sessions.create({
    customer: user.stripe_customer_id,
    return_url: `${requestOrigin(req)}/billing`,
  });
  return { url: session.url };
}
export async function stripeWebhook(req: Request) {
  assert(
    process.env.STRIPE_WEBHOOK_SECRET,
    "Stripe webhooks are not configured.",
    503,
  );
  const signature = req.headers.get("stripe-signature");
  assert(signature, "Missing Stripe signature.");
  const raw = await req.text();
  assert(Buffer.byteLength(raw) <= 1_048_576, "Webhook is too large.", 413);
  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(
      raw,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    throw new AppError(400, "Invalid Stripe webhook signature.");
  }
  const stripe = stripeClient();
  let sub: Stripe.Subscription | null = null;
  let invoice: Stripe.Invoice | null = null;
  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  )
    sub = event.data.object as Stripe.Subscription;
  if (event.type === "invoice.paid") {
    invoice = event.data.object as Stripe.Invoice;
    const rawSub = invoice.parent?.subscription_details?.subscription;
    if (rawSub)
      sub = await stripe.subscriptions.retrieve(
        typeof rawSub === "string" ? rawSub : rawSub.id,
      );
  }
  await transaction(async () => {
    const inserted = await execSql(
      "INSERT INTO webhook_events(id,created_at) VALUES(?,?) ON CONFLICT(id) DO NOTHING",
      [event.id, now()],
    );
    if (!inserted) return;
    if (!sub) return;
    const uid = sub.metadata.user_id,
      planId = sub.metadata.plan;
    const user = uid
      ? await oneSql<UserRow>(
          "SELECT id,stripe_customer_id FROM users WHERE id=?",
          [uid],
        )
      : null;
    assert(user, "Subscription user could not be resolved.", 400);
    const customerId =
      typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    assert(
      user.stripe_customer_id === customerId,
      "Subscription customer mismatch.",
      400,
    );
    const plan = (await plans()).find(
      (p) => p.id === planId && p.id !== "free",
    );
    assert(plan, "Unknown subscription plan.");
    const periodEnd = sub.items.data[0]?.current_period_end;
    await execSql(
      "INSERT INTO subscriptions(id,user_id,stripe_subscription_id,plan,status,current_period_end,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(stripe_subscription_id) DO UPDATE SET plan=excluded.plan,status=excluded.status,current_period_end=excluded.current_period_end,updated_at=excluded.updated_at",
      [
        id(),
        uid,
        sub.id,
        planId,
        sub.status,
        periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        now(),
        now(),
      ],
    );
    if (invoice) {
      await execSql(
        "INSERT INTO payment_transactions(id,user_id,stripe_event_id,amount,currency,status,invoice_url,created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(stripe_event_id) DO NOTHING",
        [
          id(),
          uid,
          invoice.id,
          invoice.amount_paid,
          invoice.currency,
          "paid",
          invoice.hosted_invoice_url || null,
          now(),
        ],
      );
      if (
        ["subscription_create", "subscription_cycle"].includes(
          invoice.billing_reason || "",
        ) &&
        invoice.amount_paid > 0
      ) {
        const granted = await execSql(
          "INSERT INTO credit_transactions(id,user_id,amount,reason,reference_id,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(reference_id) DO NOTHING",
          [
            id(),
            uid,
            plan.credits,
            `${plan.name} monthly credit allowance`,
            `invoice:${invoice.id}`,
            now(),
          ],
        );
        if (granted) {
          await execSql(
            "UPDATE users SET credits=credits+?,updated_at=? WHERE id=?",
            [plan.credits, now(), uid],
          );
          await execSql(
            "INSERT INTO notifications(id,user_id,message,created_at) VALUES(?,?,?,?)",
            [
              id(),
              uid,
              `${plan.credits} ${plan.name} credits have been added to your balance.`,
              now(),
            ],
          );
        }
      }
    }
  });
  return { received: true };
}
