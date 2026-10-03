import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "DB Tools",
  description: "Index sizing tools for multiple databases.",
};

// Server-side redirect — fires before the page renders
export default function RootRedirect() {
  redirect("/oracle/index-estimator");
}
