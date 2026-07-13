import projectsData from "./projects.json";

/* Typed loader for the project cards. projects.json is DERIVED from
   resume/resume.json projects[] — names/years/blurbs/tags verbatim, links only
   where the résumé provides one. Edit the résumé first, then mirror here. */
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
};

export const projects: Project[] = projectsData as Project[];
