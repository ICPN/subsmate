import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SubsMate — Gestione abbonamenti team",
    short_name: "SubsMate",
    description: "Gestione degli abbonamenti condivisi ai servizi LLM.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#161b2d",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
