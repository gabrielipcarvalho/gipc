import type { MetadataRoute } from "next";

/* Real routes only. No lastModified — re-stamping every build would lie to crawlers. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://gipc.dev";
  return ["/", "/system", "/work", "/timeline", "/resume", "/connect"].map((p) => ({
    url: `${base}${p === "/" ? "" : p}`,
  }));
}
