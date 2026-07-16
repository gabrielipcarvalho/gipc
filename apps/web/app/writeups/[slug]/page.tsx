import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TerminalWindow } from "../../components/TerminalWindow";
import { SectionHeader } from "../../components/SectionHeader";
import { WriteupBody } from "../../components/WriteupBody";
import { pageMeta } from "../../og";
import { writeups, bySlug, readingMinutes } from "../../../data/writeups";

export const dynamicParams = false; // only the known slugs; anything else 404s statically

export function generateStaticParams() {
  return writeups.map((w) => ({ slug: w.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = bySlug(slug);
  if (!post) return {};
  return pageMeta(`${post.title} · gipc.dev`, post.summary, `/writeups/${slug}`);
}

export default async function WriteupPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = bySlug(slug);
  if (!post) notFound();

  return (
    <main id="main" className="wrap page" tabIndex={-1}>
      <TerminalWindow path={`~/writeups/${post.slug}`}>
        <SectionHeader marker="writeups" title={post.title} />
        <p className="wu-meta">
          <time dateTime={post.date}>{post.date}</time> · {readingMinutes(post)} min read
        </p>
        <WriteupBody blocks={post.body} />
        <p className="wu-ask">
          questions about this build?{" "}
          <a href={`/oracle?ctx=writeup:${post.slug}`}>ask the oracle →</a>
        </p>
        <p className="wu-back">
          <Link href="/writeups">← all writeups</Link>
        </p>
      </TerminalWindow>
    </main>
  );
}
