import { Suspense } from "react";
import { SignupForm } from "@/components/auth/auth-form";

export default function Page() {
  return (
    <Suspense fallback={<div className="page-loading">Opening registration…</div>}>
      <SignupForm />
    </Suspense>
  );
}
