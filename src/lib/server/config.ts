import type { SettingRow } from "./records";
import { oneSql } from "../db";
import type { Plan, Configuration } from "../types";

export const now = () => new Date().toISOString();
export const envNumber = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 && process.env[name] ? n : fallback;
};
export const defaults = {
  creditsPerSecond: envNumber("CREDITS_PER_SECOND", 5),
  providerCostPerSecondCents: envNumber("PROVIDER_COST_PER_SECOND_CENTS", 40),
  trialCredits: envNumber("TRIAL_CREDITS", 100),
  plans: [
    {
      id: "free",
      name: "Free",
      price: 0,
      credits: envNumber("TRIAL_CREDITS", 100),
      storageMb: 512,
      history: "Trial workspace",
      features: [
        "Trial credits, once at signup",
        "720p HD MP4 exports",
        "Motion transfer studio",
        "Personal project workspace",
      ],
    },
    {
      id: "creator",
      name: "Creator",
      price: envNumber("CREATOR_PRICE_CENTS", 2900),
      credits: envNumber("CREATOR_MONTHLY_CREDITS", 500),
      storageMb: 5120,
      history: "Extended project history",
      features: [
        "500 credits every month",
        "720p HD MP4 exports",
        "Reusable character library",
        "Priority queue",
        "5 GB private storage",
      ],
    },
    {
      id: "pro",
      name: "Pro",
      price: envNumber("PRO_PRICE_CENTS", 7900),
      credits: envNumber("PRO_MONTHLY_CREDITS", 1600),
      storageMb: 20480,
      history: "Extended project history",
      features: [
        "1,600 credits every month",
        "Everything in Creator",
        "Higher queue priority",
        "20 GB private storage",
        "Priority email support",
      ],
    },
  ],
};
export async function pricing() {
  const setting = await oneSql<SettingRow>(
    "SELECT value FROM settings WHERE key = ?",
    ["pricing"],
  );
  return setting ? { ...defaults, ...JSON.parse(setting.value) } : defaults;
}
export async function plans(): Promise<Plan[]> {
  return (await pricing()).plans.map(
    (p: Omit<Plan, "stripePriceConfigured">) => ({
      ...p,
      features: p.features.map((f) =>
        /credits every month/.test(f)
          ? `${p.credits.toLocaleString()} credits every month`
          : f,
      ),
      stripePriceConfigured:
        p.id === "free" ||
        !!process.env[`STRIPE_${p.id.toUpperCase()}_PRICE_ID`],
    }),
  );
}
export async function configuration(): Promise<Configuration> {
  const p = await pricing();
  const worker = await oneSql<SettingRow>(
    "SELECT value FROM settings WHERE key = ?",
    ["worker_heartbeat"],
  );
  const higgsfield = process.env.MOTION_PROVIDER === "higgsfield";
  return {
    provider: higgsfield ? !!process.env.HF_CREDENTIALS : true,
    engine: higgsfield ? "higgsfield" : "local",
    email: !!(process.env.SMTP_HOST && process.env.MAIL_FROM),
    google: !!(
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      (process.env.SESSION_SECRET?.length || 0) >= 32
    ),
    billing: !!(
      process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET
    ),
    storage: process.env.S3_BUCKET
      ? "S3 private storage"
      : "Local private storage",
    production: process.env.NODE_ENV === "production",
    workerOnline: !!worker && Date.now() - Number(worker.value) < 90_000,
    creditsPerSecond: p.creditsPerSecond,
    trialCredits: p.trialCredits,
    maxVideoMb: envNumber("MAX_VIDEO_MB", 200),
    maxImageMb: envNumber("MAX_IMAGE_MB", 20),
    requireVerification: process.env.REQUIRE_EMAIL_VERIFICATION !== "false",
  };
}
