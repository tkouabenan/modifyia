"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Clapperboard,
  Coins,
  Download,
  FolderOpen,
  Heart,
  Plus,
  Shield,
  Sparkles,
  Trash2,
  UsersRound,
  WandSparkles,
  Clock3,
} from "lucide-react";
import { useWorkspace } from "./provider";
import { Button, EmptyState, Menu, Modal, StatusBadge, Toggle } from "../ui/ui";
import { MediaImage } from "../ui/media-image";
import { api, dateLabel, formatBytes, post } from "@/lib/utils";
import type { Plan } from "@/lib/types";
import { toast } from "sonner";

export function OverviewPage() {
  const { data, loading, error, refresh, t } = useWorkspace();
  if (loading) return <div className="page-loading">Opening overview…</div>;
  if (!data)
    return (
      <EmptyState
        icon={<FolderOpen size={28} />}
        title="Workspace unavailable"
        description={error || "Please try again."}
        action={<Button onClick={() => void refresh()}>Try again</Button>}
      />
    );
  const max = Math.max(1, ...data.stats.monthly.map((m) => m.count));
  return (
    <div>
      <div className="page-heading">
        <div>
          <h1>{t.overview}</h1>
          <p>A snapshot of your creative output, credits, and queue.</p>
        </div>
        <Link href="/create" className="btn btn-primary">
          <Plus size={16} /> Create new video
        </Link>
      </div>
      <div className="stat-grid">
        {[
          ["Videos generated", data.stats.total, <Clapperboard key="a" size={16} />],
          ["Completed", data.stats.completed, <Sparkles key="b" size={16} />],
          ["Active jobs", data.stats.active, <WandSparkles key="c" size={16} />],
          ["Credits", data.user.credits, <Coins key="d" size={16} />],
        ].map(([label, value, icon]) => (
          <article className="stat-card" key={String(label)}>
            <span>
              {icon} {label}
            </span>
            <b>{value}</b>
          </article>
        ))}
      </div>
      <div className="studio-grid" style={{ minHeight: 0, gridTemplateColumns: "1.4fr 1fr" }}>
        <article className="glass-card">
          <h3>Monthly generations</h3>
          <div className="chart" aria-hidden="true">
            {data.stats.monthly.length
              ? data.stats.monthly.map((m) => (
                  <i
                    key={m.month}
                    title={`${m.month}: ${m.count}`}
                    style={{ height: `${Math.max(8, (m.count / max) * 100)}%` }}
                  />
                ))
              : Array.from({ length: 6 }).map((_, i) => (
                  <i key={i} style={{ height: "8%" }} />
                ))}
          </div>
          <p style={{ color: "var(--text-dim)", marginTop: 8, fontSize: 12 }}>
            Storage used: {formatBytes(data.stats.storage)} · Failed: {data.stats.failed}
          </p>
        </article>
        <article className="glass-card">
          <h3>Recent projects</h3>
          <div className="search-results" style={{ marginTop: 12 }}>
            {data.projects.slice(0, 6).map((p) => (
              <Link key={p.id} href={`/create?project=${p.id}`}>
                <FolderOpen size={16} /> {p.name}
                <StatusBadge status={p.status} />
              </Link>
            ))}
            {!data.projects.length && <p>No projects yet. Create your first video.</p>}
          </div>
        </article>
      </div>
    </div>
  );
}

export function ProjectsPage() {
  const { data, refresh } = useWorkspace();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const projects = useMemo(
    () =>
      (data?.projects || []).filter(
        (p) =>
          p.name.toLowerCase().includes(q.toLowerCase()) &&
          (status === "all" || p.status === status),
      ),
    [data, q, status],
  );
  const act = async (id: string, action: "duplicate" | "delete") => {
    try {
      if (action === "duplicate") await post(`projects/${id}/duplicate`);
      else await api(`projects/${id}`, { method: "DELETE" });
      await refresh();
      toast.success(action === "duplicate" ? "Project duplicated." : "Project deleted.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <div>
      <div className="page-heading">
        <div>
          <h1>My projects</h1>
          <p>Reopen, rename, duplicate, or remove saved transformations.</p>
        </div>
        <Link href="/create?new=1" className="btn btn-primary">
          <Plus size={16} /> New project
        </Link>
      </div>
      <div className="toolbar-row">
        <input
          className="input"
          placeholder="Search projects…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ maxWidth: 280 }}
        />
        {["all", "draft", "queued", "processing", "completed", "failed"].map((s) => (
          <button
            key={s}
            className={`filter-chip ${status === s ? "active" : ""}`}
            onClick={() => setStatus(s)}
          >
            {s}
          </button>
        ))}
      </div>
      {projects.length ? (
        <div className="card-grid">
          {projects.map((p) => (
            <article className="media-card" key={p.id}>
              <Link href={`/create?project=${p.id}`} className="thumb">
                <MediaImage
                  src={p.thumbnail || p.character_url || p.output_url}
                  alt={p.name}
                />
              </Link>
              <div className="body">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <h3>{p.name}</h3>
                  <Menu
                    items={[
                      {
                        label: "Open in studio",
                        onClick: () => router.push(`/create?project=${p.id}`),
                      },
                      {
                        label: "Rename",
                        onClick: () => {
                          setRenameId(p.id);
                          setName(p.name);
                        },
                      },
                      { label: "Duplicate", onClick: () => void act(p.id, "duplicate") },
                      {
                        label: "Delete",
                        danger: true,
                        onClick: () => void act(p.id, "delete"),
                      },
                    ]}
                  />
                </div>
                <p>
                  {dateLabel(p.updated_at)} · <StatusBadge status={p.status} />
                </p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<FolderOpen size={28} />}
          title="No projects match."
          description="Create a video or clear your filters."
          action={
            <Link href="/create" className="btn btn-primary">
              Open studio
            </Link>
          }
        />
      )}
      <Modal
        open={!!renameId}
        onOpenChange={() => setRenameId(null)}
        title="Rename project"
      >
        <label className="form-field">
          Name
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="modal-actions">
          <Button
            variant="primary"
            onClick={async () => {
              try {
                await api(`projects/${renameId}`, {
                  method: "PATCH",
                  body: JSON.stringify({ name }),
                });
                await refresh();
                setRenameId(null);
                toast.success("Project renamed.");
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            Save
          </Button>
        </div>
      </Modal>
    </div>
  );
}

export function HistoryPage() {
  const { data } = useWorkspace();
  const completed = (data?.projects || []).filter((p) => p.output_url);
  return (
    <div>
      <div className="page-heading">
        <div>
          <h1>Video history</h1>
          <p>Every completed 720p MP4 stored in this workspace.</p>
        </div>
      </div>
      {completed.length ? (
        <div className="card-grid">
          {completed.map((p) => (
            <article className="media-card" key={p.id}>
              <Link href={`/create?project=${p.id}`} className="thumb">
                <MediaImage src={p.thumbnail || p.output_url} alt={p.name} />
              </Link>
              <div className="body">
                <h3>{p.name}</h3>
                <p>{dateLabel(p.updated_at)} · AI-generated MP4</p>
                <a className="btn btn-secondary" href={`${p.output_url}?download=1&name=${encodeURIComponent(p.name)}`}>
                  <Download size={14} /> Download MP4
                </a>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Clock3 size={28} />}
          title="No completed videos yet."
          description="Generate a transformation to build your history."
        />
      )}
    </div>
  );
}

export function CharactersPage() {
  const { data, refresh } = useWorkspace();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const update = async (id: string, body: Record<string, unknown>) => {
    try {
      await api(`characters/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      await refresh();
      toast.success("Character updated.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <div>
      <div className="page-heading">
        <div>
          <h1>Character library</h1>
          <p>Reusable identities for future motion-transfer projects.</p>
        </div>
        <Link href="/create" className="btn btn-primary">
          Use in studio
        </Link>
      </div>
      {data?.characters.length ? (
        <div className="card-grid">
          {data.characters.map((c) => (
            <article className="media-card" key={c.id}>
              <Link href={`/create?character=${c.asset_id}`} className="thumb">
                <MediaImage src={c.url} alt={c.name} />
              </Link>
              <div className="body">
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <h3>{c.name}</h3>
                  <button
                    className="icon-button"
                    aria-label="Favorite"
                    onClick={() => void update(c.id, { favorite: !c.favorite })}
                  >
                    <Heart size={16} fill={c.favorite ? "currentColor" : "none"} />
                  </button>
                </div>
                <p>{c.collection || "My characters"}</p>
                <div className="toolbar-row">
                  <Button
                    onClick={() => {
                      setEditing(c.id);
                      setName(c.name);
                    }}
                  >
                    Rename
                  </Button>
                  <Button
                    variant="danger"
                    onClick={async () => {
                      try {
                        await api(`characters/${c.id}`, { method: "DELETE" });
                        await refresh();
                        toast.success("Character removed.");
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<UsersRound size={28} />}
          title="Your library is empty."
          description="Upload a character in the studio to save it here."
        />
      )}
      <Modal open={!!editing} onOpenChange={() => setEditing(null)} title="Rename character">
        <label className="form-field">
          Name
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="modal-actions">
          <Button
            variant="primary"
            onClick={() => editing && void update(editing, { name }).then(() => setEditing(null))}
          >
            Save
          </Button>
        </div>
      </Modal>
    </div>
  );
}

export function QueuePage() {
  const { data, refresh } = useWorkspace();
  return (
    <div>
      <div className="page-heading">
        <div>
          <h1>Generation queue</h1>
          <p>Live job states from the worker—not invented percentages.</p>
        </div>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Project</th>
              <th>Status</th>
              <th>Stage</th>
              <th>Credits</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data?.jobs.map((j) => (
              <tr key={j.id}>
                <td>{j.name}</td>
                <td>
                  <StatusBadge status={j.status} />
                </td>
                <td>{j.stage}</td>
                <td>{j.cost}</td>
                <td>
                  {["queued", "uploading", "processing"].includes(j.status) && (
                    <Button
                      onClick={async () => {
                        try {
                          await post(`jobs/${j.id}/cancel`);
                          await refresh();
                          toast.success("Cancellation requested.");
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data?.jobs.length && (
        <EmptyState
          icon={<Clapperboard size={28} />}
          title="Queue is clear."
          description="Start a generation from the studio to see it here."
        />
      )}
    </div>
  );
}

export function BillingPage() {
  const { data } = useWorkspace();
  const router = useRouter();
  const checkout = async (plan: string) => {
    try {
      const result = await post<{ url: string }>("billing/checkout", { plan });
      if (result.url) window.location.assign(result.url);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const portal = async () => {
    try {
      const result = await post<{ url: string }>("billing/portal");
      if (result.url) window.location.assign(result.url);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <div>
      <div className="page-heading">
        <div>
          <h1>Credits & billing</h1>
          <p>
            {data?.user.credits ?? 0} credits available
            {data?.subscription ? ` · ${data.subscription.plan} (${data.subscription.status})` : ""}.
          </p>
        </div>
        {data?.user.role !== "guest" && data?.config.billing && (
          <Button onClick={portal}>Manage subscription</Button>
        )}
      </div>
      <div className="plan-grid">
        {(data?.plans || []).map((plan: Plan) => (
          <article
            className={`plan-card ${plan.id === data?.user.plan ? "featured" : ""}`}
            key={plan.id}
          >
            <span className="section-kicker">{plan.name}</span>
            <div className="price">
              {plan.price ? `$${(plan.price / 100).toFixed(0)}` : "$0"}
            </div>
            <p>{plan.credits.toLocaleString()} credits · {plan.storageMb} MB storage</p>
            <ul>
              {plan.features.map((f) => (
                <li className="check-item" key={f}>
                  {f}
                </li>
              ))}
            </ul>
            {plan.id === "free" ? (
              <Button disabled={data?.user.plan === "free"}>Current free plan</Button>
            ) : data?.user.role === "guest" ? (
              <Button variant="primary" onClick={() => router.push("/signup")}>
                Create an account
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => void checkout(plan.id)}
                disabled={!plan.stripePriceConfigured || data?.user.plan === plan.id}
              >
                {data?.user.plan === plan.id
                  ? "Current plan"
                  : plan.stripePriceConfigured
                    ? "Upgrade"
                    : "Stripe not configured"}
              </Button>
            )}
          </article>
        ))}
      </div>
      <h2 style={{ margin: "28px 0 12px" }}>Credit activity</h2>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>When</th>
              <th>Reason</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {data?.transactions.map((t) => (
              <tr key={t.id}>
                <td>{dateLabel(t.created_at)}</td>
                <td>{t.reason}</td>
                <td>
                  {t.amount > 0 ? "+" : ""}
                  {t.amount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 style={{ margin: "28px 0 12px" }}>Payments</h2>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Date</th>
              <th>Status</th>
              <th>Amount</th>
              <th>Invoice</th>
            </tr>
          </thead>
          <tbody>
            {data?.payments.map((p) => (
              <tr key={p.id}>
                <td>{dateLabel(p.created_at)}</td>
                <td>{p.status}</td>
                <td>
                  {(p.amount / 100).toFixed(2)} {p.currency.toUpperCase()}
                </td>
                <td>
                  {p.invoice_url ? (
                    <a href={p.invoice_url} target="_blank" rel="noreferrer">
                      View
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const { data, loading } = useWorkspace();
  if (loading) return <div className="page-loading">Opening settings…</div>;
  if (!data) return <EmptyState icon={<Shield size={28} />} title="Workspace unavailable" description="Sign in again to manage settings." />;
  return <SettingsForm key={data.user.id} />;
}

function SettingsForm() {
  const { data, refresh } = useWorkspace();
  const router = useRouter();
  const [name, setName] = useState(data?.user.name || "");
  const [locale, setLocale] = useState(data?.user.locale || "en");
  const [notes, setNotes] = useState(!!data?.user.notifications);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const save = async () => {
    try {
      await api("profile", {
        method: "PATCH",
        body: JSON.stringify({ name, locale, notifications: notes }),
      });
      await refresh();
      toast.success("Preferences saved.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const resend = async () => {
    try {
      const result = await post<{ message: string; devLink?: string }>(
        "auth/resend-verification",
      );
      toast.success(result.message);
      if (result.devLink) toast.message(result.devLink);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const destroy = async () => {
    try {
      await api("account", {
        method: "DELETE",
        body: JSON.stringify({ confirmation: confirm, password }),
      });
      toast.success("Account deleted.");
      router.replace("/");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <div>
      <div className="page-heading">
        <div>
          <h1>Settings</h1>
          <p>Profile, language, verification, and account controls.</p>
        </div>
      </div>
      <article className="glass-card" style={{ maxWidth: 560, display: "grid", gap: 12 }}>
        {data?.user.role === "guest" && (
          <p>
            You’re in a preview workspace.{" "}
            <Link href="/signup" className="text-button">
              Create an account
            </Link>{" "}
            to keep your work.
          </p>
        )}
        <label className="form-field">
          Display name
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="form-field">
          Language
          <select
            className="input"
            value={locale}
            onChange={(e) => setLocale(e.target.value as "en" | "fr")}
          >
            <option value="en">English</option>
            <option value="fr">Français</option>
          </select>
        </label>
        <Toggle
          checked={notes}
          onChange={setNotes}
          label="Product notifications"
          description="Hear when generations complete."
        />
        <Button variant="primary" onClick={save}>
          Save preferences
        </Button>
        {data?.user.role !== "guest" && !data?.user.verified && (
          <Button onClick={resend}>Resend verification email</Button>
        )}
      </article>
      {data?.user.role !== "guest" && (
        <article className="glass-card" style={{ maxWidth: 560, marginTop: 18 }}>
          <h3>Delete account</h3>
          <p style={{ color: "var(--text-muted)", margin: "8px 0 12px" }}>
            Type DELETE, confirm your password, cancel any subscription first, and wait for
            active jobs to finish.
          </p>
          <label className="form-field">
            Confirmation
            <input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          <label className="form-field">
            Password
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <Button variant="danger" onClick={destroy}>
            Delete my account
          </Button>
        </article>
      )}
    </div>
  );
}

export function HelpPage() {
  return (
    <div className="help-article">
      <div className="page-heading">
        <div>
          <h1>Help & support</h1>
          <p>How generation, credits, and configuration actually work.</p>
        </div>
      </div>
      <h2 id="guide">Creator guide</h2>
      <p>
        Upload a 4–30 second source clip, add 1–8 character images, confirm you have rights,
        then generate. The studio tracks real provider states: queued, uploading, processing,
        completed, cancelled, or failed.
      </p>
      <h2 id="setup">Service setup</h2>
      <p>
        Real motion transfer needs <code>HF_CREDENTIALS</code> (KEY_ID:KEY_SECRET) and{" "}
        <code>npm run worker</code> against the same database and media storage. Payments need
        Stripe keys. Email verification needs SMTP. Google sign-in needs OAuth client secrets
        and a 32+ character SESSION_SECRET.
      </p>
      <p>
        Credentials stay on the server. The configuration modal never exposes secret values.
      </p>
      <h2>Exports</h2>
      <p>
        Completed videos download as H.264 MP4 at 720p HD with AAC audio when present. Aspect
        ratios are fitted with padding—never stretched.
      </p>
    </div>
  );
}

export function LegalPage() {
  return (
    <div className="legal-article">
      <h1>Legal & responsible use</h1>
      <h2 id="terms">Terms of use</h2>
      <p>
        MODIFY AI provides AI-assisted motion transfer tools. You must have the rights to every
        video, image, and likeness you upload. You are responsible for how you share outputs.
      </p>
      <h2 id="privacy">Privacy</h2>
      <p>
        Media is stored privately per user. Session cookies authenticate the workspace. Payment
        data is handled by Stripe when billing is configured. Do not upload secrets into prompts.
      </p>
      <h2 id="responsible-use">Responsible use</h2>
      <p>
        You confirm permission to use uploaded performances and character likenesses. Prohibited
        uses include impersonation, non-consensual intimate imagery, fraudulent identity
        manipulation, and undisclosed synthetic media intended to deceive.
      </p>
      <p>
        AI-generated videos should be disclosed when shared. MODIFY AI records a disclosure in
        MP4 metadata where supported; this is not cryptographic C2PA provenance.
      </p>
    </div>
  );
}

type AdminPayload = {
  users: {
    id: string;
    email: string | null;
    name: string;
    role: string;
    credits: number;
    email_verified: number;
    suspended: number;
    created_at: string;
  }[];
  jobs: {
    id: string;
    status: string;
    email: string;
    project_name: string;
    cost: number;
    error: string | null;
    created_at: string;
  }[];
  usage: { id: string; event: string; duration: number; created_at?: string }[];
  payments: { id: string; amount: number; status: string; created_at: string }[];
  subscriptions: { id: string; email: string; plan: string; status: string }[];
  audit: { id: string; action: string; created_at: string }[];
  settings: {
    creditsPerSecond: number;
    providerCostPerSecondCents: number;
    trialCredits: number;
    plans: Plan[];
  };
};

export function AdminPage() {
  const { data } = useWorkspace();
  const [admin, setAdmin] = useState<AdminPayload | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (data?.user.role !== "admin") return;
    api<AdminPayload>("admin", { method: "GET" })
      .then(setAdmin)
      .catch((e) => setError((e as Error).message));
  }, [data?.user.role]);
  const load = () =>
    api<AdminPayload>("admin", { method: "GET" })
      .then(setAdmin)
      .catch((e) => setError((e as Error).message));
  if (data?.user.role !== "admin")
    return (
      <EmptyState
        icon={<Shield size={28} />}
        title="Administrators only"
        description="This console is limited to provisioned admin accounts."
      />
    );
  if (error) return <EmptyState icon={<Shield size={28} />} title="Admin API error" description={error} />;
  if (!admin) return <div className="page-loading">Loading operations…</div>;
  const revenue = admin.payments
    .filter((p) => p.status === "paid" || p.status === "succeeded")
    .reduce((s, p) => s + p.amount, 0);
  const action = async (body: Record<string, unknown>) => {
    try {
      await post("admin", body);
      toast.success("Administrative change saved.");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <div>
      <div className="page-heading">
        <div>
          <h1>Administration</h1>
          <p>Users, jobs, provider usage, revenue, and plan configuration.</p>
        </div>
      </div>
      <div className="admin-grid">
        <article className="stat-card">
          <span>Users</span>
          <b>{admin.users.length}</b>
        </article>
        <article className="stat-card">
          <span>Active subscriptions</span>
          <b>{admin.subscriptions.filter((s) => s.status === "active").length}</b>
        </article>
        <article className="stat-card">
          <span>Jobs</span>
          <b>{admin.jobs.length}</b>
        </article>
        <article className="stat-card">
          <span>Recorded revenue</span>
          <b>${(revenue / 100).toFixed(0)}</b>
        </article>
      </div>
      <h2>Users</h2>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Email</th>
              <th>Credits</th>
              <th>Role</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {admin.users.map((u) => (
              <tr key={u.id}>
                <td>
                  {u.email || u.name}
                  {u.suspended ? " · suspended" : ""}
                </td>
                <td>{u.credits}</td>
                <td>{u.role}</td>
                <td>
                  <Button
                    onClick={() =>
                      void action({ action: "credits", user_id: u.id, amount: 50 })
                    }
                  >
                    +50 credits
                  </Button>
                  {u.role !== "admin" && (
                    <Button
                      onClick={() =>
                        void action({
                          action: "suspend",
                          user_id: u.id,
                          suspended: !u.suspended,
                        })
                      }
                    >
                      {u.suspended ? "Restore" : "Suspend"}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 style={{ marginTop: 24 }}>Generation jobs</h2>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Project</th>
              <th>User</th>
              <th>Status</th>
              <th>Cost</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {admin.jobs.map((j) => (
              <tr key={j.id}>
                <td>{j.project_name}</td>
                <td>{j.email}</td>
                <td>
                  <StatusBadge status={j.status} />
                </td>
                <td>{j.cost}</td>
                <td>{j.error || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 style={{ marginTop: 24 }}>Provider usage</h2>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Event</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {admin.usage.map((u) => (
              <tr key={u.id}>
                <td>{u.event}</td>
                <td>{u.duration}s</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="fineprint">
        Estimated provider cost uses {admin.settings.providerCostPerSecondCents}¢ / second.
        Credits per second: {admin.settings.creditsPerSecond}. Trial:{" "}
        {admin.settings.trialCredits}. Audit entries: {admin.audit.length}.
      </p>
    </div>
  );
}
