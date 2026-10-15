import { Suspense } from "react";
import { LoginForm } from "@/components/auth/auth-form";

export default function Page() {
  return (
    <Suspense fallback={<div className="page-loading">Opening sign in…</div>}>
      <LoginForm />
    </Suspense>
  );
}
