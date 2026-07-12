import projectsData from "./projects.json";

/* Typed loader for the project cards. projects.json is DERIVED from
   resume/resume.json projects[] — names/years/blurbs/tags verbatim, links only
   where the résumé provides one. Edit the résumé first, then mirror here. */
export type ProjectLink = { label: string; href: string };

export type Project = {
  slug: string;
  name: string;
  year: string;
  blurb: string;
  tags: string[];
  featured?: boolean;
  links?: ProjectLink[];
};

export const projects: Project[] = projectsData as Project[];
