/* Section heading — muted `// marker` line + the page's single <h1>.
   Server component. The page <main> landmark is the programmatic focus target on
   route change (see RouteFocus); this <h1> is the crawlable/visible page title. */
export function SectionHeader({ marker, title }: { marker: string; title: string }) {
  return (
    <header className="section-head">
      <p className="section-marker">// {marker}</p>
      <h1 className="section-title">{title}</h1>
    </header>
  );
}
