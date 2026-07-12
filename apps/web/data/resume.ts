import resumeData from "../../../resume/resume.json";

/* Typed loader for resume/resume.json — THE single source for résumé content.
   Never copy the JSON into apps/web; never render basics.phone, basics.private,
   meta, or any evidence[] array (evidence ids are internal provenance). */
export type ResumeBasics = {
  name: string;
  label: string;
  location: { city: string; region: string; country: string; relocation?: string };
  phone?: string;
  email: string;
  site: string;
  profiles: { network: string; url: string }[];
  workRights?: string;
  summary: string;
  private?: unknown;
};

export type SkillGroup = { category: string; items: string[] };

export type ResumeBullet = { text: string; evidence?: string[]; keywords?: string[] };

export type ResumeRole = {
  org: string;
  role: string;
  location: string;
  start: string;
  end: string;
  note?: string;
  bullets: ResumeBullet[];
};

export type ResumeProject = {
  name: string;
  year: string;
  text: string;
  url?: string;
  keywords?: string[];
  evidence?: string[];
};

export type ResumePublication = {
  authors: string;
  authorPosition?: string;
  authorsConfirmed?: boolean;
  title: string;
  venue: string;
  volume?: string;
  pages?: string;
  date: string;
  doi: string;
  evidence?: string[];
};

export type ResumeEducation = {
  degree: string;
  org: string;
  start?: string;
  end: string;
  detail?: string;
  evidence?: string[];
};

export type ResumeNamedItem = { name: string; date?: string; text?: string; evidence?: string[] };

export type Resume = {
  basics: ResumeBasics;
  skills: SkillGroup[];
  experience: ResumeRole[];
  projects: ResumeProject[];
  publications: ResumePublication[];
  education: ResumeEducation[];
  certifications: ResumeNamedItem[];
  awards: ResumeNamedItem[];
  leadership: ResumeNamedItem[];
};

export const resume: Resume = resumeData as Resume;
