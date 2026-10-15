import type {
  Aspect,
  JobStatus,
  User,
  Character,
  Project,
  Workspace,
} from "../types";

export interface UserRow {
  id: string;
  email: string | null;
  password_hash: string | null;
  name: string;
  role: User["role"];
  credits: number;
  email_verified: number;
  suspended: number;
  stripe_customer_id: string | null;
  google_id: string | null;
  created_at: string;
  updated_at: string;
}
export interface ProfileRow {
  user_id: string;
  locale: User["locale"];
  notifications: number;
}
export interface ProjectRow extends Omit<Project, "character_ids"> {
  user_id: string;
  character_ids: string;
}
export interface CharacterRow extends Omit<Character, "url"> {
  user_id: string;
}
export interface JobInput {
  source_id: string;
  character_ids: string[];
  trim_start: number;
  trim_end: number;
  aspect: Aspect;
  audio: "preserve" | "mute";
  prompt: string;
  project_name: string;
}
export interface JobRow {
  id: string;
  user_id: string;
  project_id: string;
  status: JobStatus;
  stage: string;
  cost: number;
  duration: number;
  input: string;
  provider_request_id: string | null;
  provider_status_url: string | null;
  provider_cancel_url: string | null;
  provider_output_url: string | null;
  source_url: string | null;
  image_urls: string | null;
  prepared_source_id: string | null;
  lease_owner: string | null;
  lease_until: string | null;
  attempts: number;
  error: string | null;
  refunded_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface SubscriptionRow {
  id: string;
  user_id: string;
  stripe_subscription_id: string | null;
  plan: string;
  status: string;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}
export interface TokenRow {
  token_hash: string;
  user_id: string;
  kind: string;
  expires_at: string;
  created_at: string;
}
export interface GeneratedRow {
  id: string;
  user_id: string;
  project_id: string;
  job_id: string;
  asset_id: string;
  created_at: string;
}
export interface SettingRow {
  key: string;
  value: string;
  updated_at: string;
}
export interface CountRow {
  total: number | string;
}
export type CreditRow = Workspace["transactions"][number] & {
  user_id: string;
  reference_id: string | null;
};
export type PaymentRow = Workspace["payments"][number] & {
  user_id: string;
  stripe_event_id: string;
};
export type NotificationRow = Workspace["notifications"][number] & {
  user_id: string;
};
export interface UsageRow {
  id: string;
  job_id: string;
  event: string;
  duration: number;
  estimated_cost_cents: number;
  created_at: string;
}
export interface AuditRow {
  id: string;
  admin_id: string;
  action: string;
  target_id: string | null;
  details: string;
  created_at: string;
}
