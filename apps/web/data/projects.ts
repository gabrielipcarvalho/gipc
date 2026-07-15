import projectsData from "./projects.json";

/* Typed loader for the project cards. projects.json is DERIVED from
   resume/resume.json projects[] — names/years/blurbs/tags mirrored verbatim, links only
   where the résumé provides one. detail/stack/highlights are honest expansions traceable
   to career/career-mcd.md (the evidence base). Edit the résumé first, then mirror here. */
export type ProjectLink = { label: string; href: string };

export type ProjectAccent = "violet" | "cyan" | "ok" | "warn" | "err";

export type Project = {
  slug: string;
  name: string;
  year: string;
  blurb: string;
  tags: string[];
  accent?: ProjectAccent; // corner-glow + chip-tint hue (a design choice, not a fact)
  featured?: boolean;
  links?: ProjectLink[];
  detail?: string; // 2–4 sentence honest expansion, shown in the inline detail disclosure
  stack?: string[]; // granular tech chips (finer than tags)
  highlights?: string[]; // 3–4 honest outcome/scale bullets (metrics only where evidenced)
};

export const projects: Project[] = projectsData as Project[];
