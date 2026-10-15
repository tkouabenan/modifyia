import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";
import { LegalPage } from "@/components/workspace/pages";

export default function Page() {
  return (
    <div className="marketing">
      <SiteHeader compact />
      <main className="section">
        <LegalPage />
      </main>
      <SiteFooter />
    </div>
  );
}
