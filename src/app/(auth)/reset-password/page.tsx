import { Suspense } from "react";
import { ResetForm } from "@/components/auth/auth-form";

export default function Page() {
  return (
    <Suspense fallback={<div className="page-loading">Opening password reset…</div>}>
      <ResetForm />
    </Suspense>
  );
}
