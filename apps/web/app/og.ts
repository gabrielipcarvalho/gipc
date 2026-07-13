import type { Metadata } from "next";

/* Per-route metadata helper — page-level openGraph REPLACES the root layout's
   (Next merges shallowly), so every field must be restated here. metadataBase
   (layout.tsx) makes the relative image/canonical paths absolute. */
export function pageMeta(title: string, description: string, path: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      type: "website",
      siteName: "gipc.dev",
      locale: "en_AU",
      images: [{ url: "/og.png", width: 1200, height: 630, alt: "arcane — the gipc.dev operator console" }],
    },
    // Next merges page twitter over root SHALLOWLY, so restate every field per route.
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og.png"],
    },
  };
}
