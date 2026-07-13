/* Mirrors services/core DeployEvent JSON (lowercase keys). */
export type DeployStage = "commit" | "build" | "test" | "deploy" | "released";
export type DeployStatus = "start" | "success" | "failure";

export type DeployEvent = {
  sha: string;
  subject: string;
  stage: DeployStage;
  status: DeployStatus;
  ts: string;
};

/* Pipeline order for the animated track. */
export const DEPLOY_STAGES: DeployStage[] = ["commit", "build", "test", "deploy", "released"];
