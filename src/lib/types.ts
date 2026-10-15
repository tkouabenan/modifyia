export type JobStatus =
  | "queued"
  | "uploading"
  | "processing"
  | "completed"
  | "cancelled"
  | "failed";
export type Aspect = "original" | "16:9" | "9:16" | "1:1" | "4:5";
export interface User {
  id: string;
  email: string | null;
  name: string;
  role: "guest" | "user" | "admin";
  credits: number;
  verified: boolean;
  plan: string;
  locale: "en" | "fr";
  created_at: string;
}
export interface Asset {
  id: string;
  name: string;
  kind: "video" | "image" | "output" | "thumbnail";
  mime: string;
  size: number;
  url: string;
  metadata: {
    width?: number;
    height?: number;
    duration?: number;
    fps?: number;
    format?: string;
    audio?: boolean;
  };
  created_at: string;
}
export interface Character {
  id: string;
  name: string;
  collection: string;
  favorite: number;
  asset_id: string;
  url: string;
  created_at: string;
}
export interface Project {
  id: string;
  name: string;
  prompt: string;
  source_id: string | null;
  character_ids: string[];
  trim_start: number;
  trim_end: number;
  aspect: Aspect;
  audio: "preserve" | "mute";
  status: string;
  output_id?: string;
  output_url?: string;
  source_url?: string;
  thumbnail?: string;
  character_url?: string;
  error?: string;
  job_id?: string;
  created_at: string;
  updated_at: string;
}
export interface Job {
  id: string;
  project_id: string;
  name: string;
  status: JobStatus;
  stage: string;
  cost: number;
  error: string | null;
  created_at: string;
  updated_at: string;
  provider_request_id: string | null;
}
export interface Plan {
  id: string;
  name: string;
  price: number;
  credits: number;
  storageMb: number;
  history: string;
  features: string[];
  stripePriceConfigured: boolean;
}
export interface Configuration {
  provider: boolean;
  email: boolean;
  google: boolean;
  billing: boolean;
  storage: string;
  production: boolean;
  workerOnline: boolean;
  creditsPerSecond: number;
  trialCredits: number;
  maxVideoMb: number;
  maxImageMb: number;
  requireVerification: boolean;
}
export interface Workspace {
  user: User;
  projects: Project[];
  characters: Character[];
  jobs: Job[];
  assets: Asset[];
  plans: Plan[];
  config: Configuration;
  stats: {
    total: number;
    completed: number;
    active: number;
    failed: number;
    storage: number;
    monthly: { month: string; count: number }[];
  };
  transactions: {
    id: string;
    amount: number;
    reason: string;
    created_at: string;
  }[];
  notifications: {
    id: string;
    message: string;
    read_at: string | null;
    created_at: string;
  }[];
  subscription?: {
    plan: string;
    status: string;
    current_period_end: string | null;
  };
  payments: {
    id: string;
    amount: number;
    currency: string;
    status: string;
    invoice_url: string | null;
    created_at: string;
  }[];
}
