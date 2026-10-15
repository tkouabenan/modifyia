import { Suspense } from "react";
import { Studio } from "@/components/studio/studio";
export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="page-loading">Opening your creative studio…</div>
      }
    >
      <Studio />
    </Suspense>
  );
}
