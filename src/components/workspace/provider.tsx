"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { Workspace } from "@/lib/types";
import { post } from "@/lib/utils";
import { dictionaries } from "@/lib/i18n";
import Link from "next/link";
import { Modal, Button } from "../ui/ui";
import {
  Check,
  KeyRound,
  Database,
  Mail,
  CreditCard,
  Cpu,
  ExternalLink,
  LoaderCircle,
} from "lucide-react";
let bootstrapInFlight: Promise<Workspace> | null = null;
function bootstrapWorkspace() {
  bootstrapInFlight ??= post<Workspace>("bootstrap").finally(() => {
    bootstrapInFlight = null;
  });
  return bootstrapInFlight;
}
const Context = createContext<{
  data: Workspace | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  openConfig: () => void;
  t: typeof dictionaries.en | typeof dictionaries.fr;
}>({
  data: null,
  loading: true,
  error: null,
  refresh: async () => {},
  openConfig: () => {},
  t: dictionaries.en,
});
export function useWorkspace() {
  return useContext(Context);
}
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Workspace | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null),
    [configOpen, setConfigOpen] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setData(await bootstrapWorkspace());
      setLoading(false);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    let alive = true;
    bootstrapWorkspace()
      .then((d) => {
        if (alive) {
          setData(d);
          setError(null);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  const hasWorkspace = data !== null;
  const activeJobs = data?.stats.active || 0;
  useEffect(() => {
    if (!hasWorkspace) return;
    const timer = setInterval(
      () => {
        if (!document.hidden) void refresh();
      },
      activeJobs ? 5000 : 30000,
    );
    return () => clearInterval(timer);
  }, [activeJobs, hasWorkspace, refresh]);
  const locale = data?.user.locale || "en";
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const t = dictionaries[data?.user.locale || "en"];
  return (
    <Context.Provider
      value={{
        data,
        loading,
        error,
        refresh,
        openConfig: () => setConfigOpen(true),
        t,
      }}
    >
      {children}
      <Modal
        open={configOpen}
        onOpenChange={setConfigOpen}
        title="Connect your creative engine"
        description="Your studio works locally. Connect these services to enable the complete production workflow."
        className="config-modal"
      >
        <div className="config-callout">
          <KeyRound size={19} />
          <p>
            Credentials stay on the server. This screen never reads or exposes
            secret values.
          </p>
        </div>
        <div className="service-list">
          {[
            {
              icon: <Cpu size={20} />,
              name:
                data?.config.engine === "higgsfield"
                  ? "Higgsfield Genjutsu"
                  : "MODIFY local engine",
              desc:
                data?.config.engine === "higgsfield"
                  ? "Cloud character and motion transfer"
                  : "On-device motion transfer and 720p MP4 export",
              ok: data?.config.provider,
              keys:
                data?.config.engine === "higgsfield"
                  ? "HF_CREDENTIALS=KEY_ID:KEY_SECRET"
                  : "MOTION_PROVIDER=local",
            },
            {
              icon: <LoaderCircle size={20} />,
              name: "Generation worker",
              desc: "Durable queue and FFmpeg exports",
              ok: data?.config.workerOnline,
              keys: "Embedded by default · or npm run worker",
            },
            {
              icon: <Database size={20} />,
              name: "Private media storage",
              desc: data?.config.storage || "Local storage",
              ok: true,
              keys: "Production: DATABASE_URL + S3_BUCKET",
            },
            {
              icon: <Mail size={20} />,
              name: "Email delivery",
              desc: "Verification and password reset links",
              ok: data?.config.email,
              keys: "SMTP_HOST · MAIL_FROM · SMTP_USER · SMTP_PASSWORD",
            },
            {
              icon: <CreditCard size={20} />,
              name: "Stripe payments",
              desc: "Subscriptions and signed billing webhooks",
              ok: data?.config.billing,
              keys: "STRIPE_SECRET_KEY · STRIPE_WEBHOOK_SECRET · plan price IDs",
            },
          ].map((service) => (
            <div className="service" key={service.name}>
              <span className="service-icon">{service.icon}</span>
              <div>
                <strong>{service.name}</strong>
                <p>{service.desc}</p>
                <code>{service.keys}</code>
              </div>
              <span className={service.ok ? "service-ok" : "service-needed"}>
                {service.ok ? (
                  <>
                    <Check size={12} /> Ready
                  </>
                ) : (
                  "Setup needed"
                )}
              </span>
            </div>
          ))}
        </div>
        <p className="fineprint">
          Generation uses the local MODIFY engine unless MOTION_PROVIDER=higgsfield.
          Cloud extras (Google, SMTP, Stripe, S3) remain optional.
        </p>
        <div className="modal-actions">
          <Link
            href="/help#setup"
            className="btn btn-secondary"
            onClick={() => setConfigOpen(false)}
          >
            Setup guide <ExternalLink size={14} />
          </Link>
          <Button variant="primary" onClick={() => setConfigOpen(false)}>
            Back to creating
          </Button>
        </div>
      </Modal>
    </Context.Provider>
  );
}
