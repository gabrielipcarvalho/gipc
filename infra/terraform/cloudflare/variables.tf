# No defaults anywhere: real ids live on the box / in the Cloudflare dashboard, never in git.
variable "account_id" {
  type        = string
  description = "Cloudflare account id"
}

variable "zone_id" {
  type        = string
  description = "Zone id for gipc.dev"
}

variable "tunnel_id" {
  type        = string
  description = "The existing tunnel's UUID (import target — see README)"
}

variable "tunnel_secret" {
  type        = string
  sensitive   = true
  description = "Tunnel secret — required by the v4 schema; ignore_changes keeps the live value untouched post-import"
}
