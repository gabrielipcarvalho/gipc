import type { MetadataRoute } from "next";
import { writeups } from "../data/writeups";

/* Real routes only. No lastModified — re-stamping every build would lie to crawlers. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://gipc.dev";
  const routes = [
    "/", "/system", "/oracle", "/lab", "/status", "/infra", "/work", "/writeups", "/timeline", "/resume", "/connect", "/meet",
    ...writeups.map((w) => `/writeups/${w.slug}`),
  ];
  return routes.map((p) => ({ url: `${base}${p === "/" ? "" : p}` }));
}
