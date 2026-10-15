import { Suspense } from "react";
import { BillingPage } from "@/components/workspace/pages";
export default function Page() {
  return (
    <Suspense fallback={<div className="page-loading">Opening billing…</div>}>
      <BillingPage />
    </Suspense>
  );
}
