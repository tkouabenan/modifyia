import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import { Toaster } from "sonner";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "MODIFY AI — Your character. Any motion.",
    template: "%s | MODIFY AI",
  },
  description:
    "Turn any motion into your character. A professional AI motion-transfer studio with private projects and 720p HD MP4 exports.",
  icons: { icon: "/icon.svg" },
  openGraph: {
    title: "MODIFY AI",
    description: "Your Character. Any Motion. Infinite Possibilities.",
    type: "website",
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#101014",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          richColors
          toastOptions={{
            style: {
              background: "#24232b",
              border: "1px solid #3b3846",
              color: "#f4f1fa",
              fontFamily: "Inter Variable, sans-serif",
            },
          }}
        />
      </body>
    </html>
  );
}
