"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { Brand } from "../brand";
import { Button } from "../ui/ui";
import { MediaImage } from "../ui/media-image";
import { post } from "@/lib/utils";
import { toast } from "sonner";

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="auth-shell">
      <div className="auth-visual">
        <MediaImage
          src="/images/motion-editorial.jpg"
          alt="MODIFY AI studio atmosphere"
          priority
        />
        <Brand />
        <div className="auth-copy">
          <h2>A familiar performance. An entirely new possibility.</h2>
          <p className="lead" style={{ marginTop: 12, color: "#cbd5e1" }}>
            Your character. Any motion. Infinite possibilities.
          </p>
        </div>
      </div>
      <div className="auth-panel">
        <div className="auth-card">
          <Brand />
          <h1>{title}</h1>
          <p>{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

function GoogleButton() {
  return (
    <Link className="btn btn-secondary google-btn" href="/api/auth/google">
      Continue with Google
    </Link>
  );
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await post("auth/login", { email, password });
      toast.success("Welcome back.");
      router.replace("/create");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthShell title="Welcome back." subtitle="Sign in to your creative workspace.">
      <GoogleButton />
      <div className="auth-split">
        <span /> or with email <span />
      </div>
      <form onSubmit={submit}>
        <label className="form-field">
          Email
          <input
            className="input"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="form-field">
          Password
          <input
            className="input"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <Link href="/forgot-password" className="text-button">
          Forgot password?
        </Link>
        <Button variant="primary" loading={busy} type="submit">
          Sign in
        </Button>
      </form>
      <p className="auth-foot">
        New here? <Link href="/signup">Create an account</Link>
      </p>
    </AuthShell>
  );
}

export function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await post<{ message: string; devLink?: string }>(
        "auth/register",
        { name, email, password, consent },
      );
      toast.success(result.message);
      if (result.devLink) toast.message("Development verification link ready.");
      router.replace(result.devLink ? `/verify-email?link=${encodeURIComponent(result.devLink)}` : "/create");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthShell
      title="Create your studio."
      subtitle="Email, password, and a name. Then start transforming motion."
    >
      <GoogleButton />
      <div className="auth-split">
        <span /> or with email <span />
      </div>
      <form onSubmit={submit}>
        <label className="form-field">
          Name
          <input
            className="input"
            required
            minLength={2}
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="form-field">
          Email
          <input
            className="input"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="form-field">
          Password (12+ characters)
          <input
            className="input"
            type="password"
            required
            minLength={12}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className="consent-checkbox">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>
            I agree to the{" "}
            <Link href="/legal" target="_blank">
              terms
            </Link>{" "}
            and{" "}
            <Link href="/legal#responsible-use" target="_blank">
              responsible-use policy
            </Link>
            .
          </span>
        </label>
        <Button variant="primary" loading={busy} type="submit">
          Create account
        </Button>
      </form>
      <p className="auth-foot">
        Already have a workspace? <Link href="/login">Sign in</Link>
      </p>
    </AuthShell>
  );
}

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await post<{ message: string; devLink?: string }>(
        "auth/forgot-password",
        { email },
      );
      toast.success(result.message);
      setLink(result.devLink || "");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthShell
      title="Reset your password."
      subtitle="If an account exists, we’ll send a reset link."
    >
      <form onSubmit={submit}>
        <label className="form-field">
          Email
          <input
            className="input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <Button variant="primary" loading={busy} type="submit">
          Send reset link
        </Button>
      </form>
      {link && (
        <p className="auth-foot">
          Development link: <Link href={link}>Open reset page</Link>
        </p>
      )}
      <p className="auth-foot">
        <Link href="/login">Back to sign in</Link>
      </p>
    </AuthShell>
  );
}

export function ResetForm() {
  const search = useSearchParams();
  const router = useRouter();
  const token = search.get("token") || "";
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await post<{ message: string }>("auth/reset-password", {
        token,
        password,
      });
      toast.success(result.message);
      router.replace("/login");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthShell
      title="Choose a new password."
      subtitle="Use at least 12 characters. You’ll sign in again after this."
    >
      <form onSubmit={submit}>
        <label className="form-field">
          New password
          <input
            className="input"
            type="password"
            required
            minLength={12}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <Button variant="primary" loading={busy} type="submit" disabled={!token}>
          Update password
        </Button>
      </form>
    </AuthShell>
  );
}

export function VerifyForm() {
  const search = useSearchParams();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const token =
    search.get("token") ||
    (() => {
      const link = search.get("link");
      if (!link) return "";
      try {
        return new URL(link, "http://local.invalid").searchParams.get("token") || "";
      } catch {
        return "";
      }
    })();
  const run = async () => {
    setBusy(true);
    try {
      const result = await post<{ message: string }>("auth/verify-email", {
        token,
      });
      toast.success(result.message);
      router.replace("/create");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthShell
      title="Verify your email."
      subtitle="Confirm this address so you can generate videos."
    >
      <Button variant="primary" loading={busy} onClick={run} disabled={!token}>
        Verify email
      </Button>
      <p className="auth-foot">
        Need a new link? Open Settings after signing in and resend verification.
      </p>
    </AuthShell>
  );
}
