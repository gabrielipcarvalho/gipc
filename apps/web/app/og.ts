import type { Metadata } from "next";

/* Per-route metadata helper — page-level openGraph REPLACES the root layout's
   (Next merges shallowly), so every field must be restated here. metadataBase
   (layout.tsx) makes the relative image/canonical paths absolute. */
export function pageMeta(title: string, description: string, path: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    // openGraph.images + twitter.image are supplied per-route by the `opengraph-image.tsx` file convention
    // (which OVERRIDES metadata config), so no image is hardcoded here.
    openGraph: {
      title,
      description,
      url: path,
      type: "website",
      siteName: "gipc.dev",
      locale: "en_AU",
    },
    // Next merges page twitter over root SHALLOWLY, so restate every field per route.
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}
