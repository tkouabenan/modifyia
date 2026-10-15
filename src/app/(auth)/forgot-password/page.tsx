import { Suspense } from "react";
import { ForgotForm } from "@/components/auth/auth-form";

export default function Page() {
  return (
    <Suspense fallback={<div className="page-loading">Opening reset…</div>}>
      <ForgotForm />
    </Suspense>
  );
}
