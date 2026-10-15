import type { Metadata } from "next";
import { Landing } from "@/components/marketing/landing";

export const metadata: Metadata = {
  title: "MODIFY AI — Your Character. Any Motion.",
  description:
    "Upload a video, choose your character, and let MODIFY AI recreate every movement with AI-powered motion transfer. Download 720p HD MP4.",
};

export default function Page() {
  return <Landing />;
}
