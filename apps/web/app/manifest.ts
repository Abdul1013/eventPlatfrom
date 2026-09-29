import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EventMerge — Secure Ticketing",
    short_name: "EventMerge",
    description: "AES-256-GCM encrypted event tickets with dynamic QR codes",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FBFAF7",
    theme_color: "#0D9488",
    categories: ["entertainment", "utilities"],
    icons: [],
    screenshots: [],
  };
}
