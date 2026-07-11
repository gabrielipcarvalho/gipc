# Market keyword profile — DevOps Engineer (AU) — mined 2026-07-11

Corpus: **11 postings read in full** (+19 titles surveyed). Source: Indeed API. Coverage:
Remote-AU, Melbourne, Brisbane. Mixed mid→senior. Companies: BRG, Coates, VEC, Accenture ×2,
ASI, Leidos, Boeing, NRI/Planit, Binance, Datacom.

## Must-have (>50% of postings)
| term | freq | in old CV? | evidence (MCD id) |
|---|---|---|---|
| CI/CD pipelines | 11/11 | weak (研 only) | JDL-02/03 deploy pipelines, CV-PROJ-FIN, PRJ-NINA |
| Kubernetes / containers | 7/11 | yes | CV projects (K8s/AKS), PRJ-GIPC k3s, JDL Docker |
| IaC (Terraform/Bicep/CloudFormation/Helm) | 7/11 | buried | CV-PROJ-FIN (Bicep/Terraform), PRJ-GIPC manifests |
| Monitoring / observability | 6/11 | no | JDL-11 (CloudWatch/GuardDuty), JDL-16 (UptimeRobot), PRJ-GIPC (Prom/Grafana planned — don't overclaim) |
| Linux administration | 5/11* | partial | JDL-04/05/06 (Ubuntu prod), JDL-10, box hardening |
| AWS (EC2/EKS/S3/IAM/VPC/CloudFront/WAF) | 5/11 | yes | JDL-10..14, CV Voice AI |

## Differentiators (20–50%)
| term | freq | evidence |
|---|---|---|
| Security / DevSecOps (vuln mgmt, hardening, WAF) | 5/11 | JDL-23..30 — **rich, buried** |
| Scripting (Bash + Python) | 5/11 | JDL-20/21/22, PRJ-SYNC |
| Azure (AKS, Functions, Monitor, Bicep, Entra) | 4/11 | CV research projects (AKS/Bicep) |
| Incident response / on-call / RCA | 4/11 | JDL-24/26/43/44/45 — **rich, buried** |
| Mentoring / technical leadership | 4/11 | JDL-49..52 |
| Ansible / config mgmt | 3/11 | GAP-REAL (planned gipc only) |
| GitLab CI / Jenkins / GitHub Actions | 3/11 | partial (custom git-aware pipelines JDL-02/03) |

## Salary observations
BRG senior remote: **$214–242k+super**; VEC (gov, Melb): $128,635–140,849+super; ASI (SRE-ish):
$90–110k. Spread = seniority + sector; senior private-sector DevOps ≈ $130–180k typical band.

## Structural market notes
- **Defence/gov segment (Boeing, Leidos, Datacom, VEC) requires AU citizenship + NV1/NV2/TSPV
  clearance → currently inaccessible (189 visa in progress)** — excluded from targeting, ~3/11.
- Melbourne market healthy (Accenture pipeline, VEC, ASI, Leidos). Remote-AU real but noisier.

## Gap analysis
- **HAVE-BURIED (surface in rewrite):** DevSecOps/security engineering [JDL-23..30], incident
  response/RCA [JDL-24,26,43-45], observability stack [JDL-11,16], IaC terminology [CV-FIN,
  PRJ-GIPC], estate DNS/networking [JDL-15], backup/DR engineering [JDL-19], migrations at
  scale [JDL-04..09,22], cost optimization [JDL-14,46].
- **GAP-REAL (learning plan, NOT resume):** Ansible/Puppet in prod, Jenkins/GitLab-CI,
  Rancher/OpenShift, VMware, managed EKS at scale, F5/load balancers, AU security clearance
  (citizenship-gated).

## Top-10 terms to weave
CI/CD · Kubernetes · Terraform/IaC · AWS (CloudFront/WAF/EC2/S3/Lambda) · Linux ·
observability/monitoring · DevSecOps/security hardening · incident response/RCA ·
Docker · automation (Bash/Python)

## Sources
Indeed job ids JOBSEARCH_1,4,11,13,14,16,19,21,24,26,27 (details) + searches: "DevOps
Engineer" × remote/Melbourne/Brisbane, 2026-07-11.
