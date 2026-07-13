/* /robots.txt as a Route Handler (the metadata robots.ts can't emit a comment line).
   The comment is the CTF trailhead — the first place you look in a CTF. */
export const dynamic = "force-static";

export function GET() {
  const body = [
    "# the grimoire hides a flag — `ls -a` in the console, then `cat .hidden`",
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/", // JSON data handlers, not crawlable content
    "",
    "Host: https://gipc.dev",
    "Sitemap: https://gipc.dev/sitemap.xml",
    "",
  ].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain" } });
}
