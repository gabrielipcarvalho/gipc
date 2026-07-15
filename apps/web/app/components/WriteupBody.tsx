import { type WBlock, renderInline } from "../../data/writeups";

/* Renders a writeup's typed block array. Server Component — no client JS, no dangerouslySetInnerHTML.
   `h` blocks are <h2> (the page <h1> is the post title via SectionHeader). */
export function WriteupBody({ blocks }: { blocks: WBlock[] }) {
  return (
    <div className="wu-body">
      {blocks.map((b, i) => {
        if ("p" in b) return <p key={i}>{renderInline(b.p)}</p>;
        if ("h" in b) return <h2 key={i}>{b.h}</h2>;
        if ("ul" in b)
          return (
            <ul key={i}>
              {b.ul.map((li, j) => (
                <li key={j}>{renderInline(li)}</li>
              ))}
            </ul>
          );
        return (
          <pre key={i} className="wu-code" tabIndex={0} aria-label={b.lang ? `${b.lang} code` : "code"}>
            <code>{b.code}</code>
          </pre>
        );
      })}
    </div>
  );
}
