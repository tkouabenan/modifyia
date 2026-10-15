import { Suspense } from "react";
import { VerifyForm } from "@/components/auth/auth-form";

export default function Page() {
  return (
    <Suspense fallback={<div className="page-loading">Opening verification…</div>}>
      <VerifyForm />
    </Suspense>
  );
}
