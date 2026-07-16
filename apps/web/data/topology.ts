/* /api/topology contract — REAL per-service pod truth from core's k8s reads (Sprint H P1).
   Replaces the deleted stub telemetry contract. Nothing here is fabricated: every field comes
   from the Kubernetes API via core's read-only, namespace-allowlisted client. */

export type ServiceStatus = "up" | "degraded" | "down";

export type TopologyPod = {
  name: string;
  ready: boolean;
  phase: string;
  restarts: number;
  image: string;
  imageShort: string;
  commitUrl?: string; // only for this repo's CI-pinned ghcr images
  ageSeconds: number;
  requests?: string;
  limits?: string;
};

export type TopologyService = {
  name: string;
  namespace: string;
  status: ServiceStatus;
  pods: TopologyPod[];
};

export type Topology = {
  generatedAt: string;
  services: TopologyService[];
};
