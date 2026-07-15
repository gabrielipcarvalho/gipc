import { renderOg, OG_SIZE, OG_CONTENT_TYPE } from "../../og/og-image";
import { writeups, bySlug } from "../../../data/writeups";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "gipc.dev — writeup";
export const dynamicParams = false; // only the known slugs; keeps every OG image build-time SSG (fonts read at build cwd)

export function generateStaticParams() {
  return writeups.map((w) => ({ slug: w.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = bySlug(slug);
  return renderOg(post?.title ?? "Writeup", "field notes");
}
