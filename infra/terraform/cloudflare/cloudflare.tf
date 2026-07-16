# The codified mirror of gipc.dev's hand-built Cloudflare provisioning: the tunnel + the DNS
# that routes through it. Import-ready, DELIBERATELY NOT APPLIED — see README.md.

# gipc.dev and www route through the tunnel: proxied CNAMEs onto cfargotunnel.com.
resource "cloudflare_record" "apex" {
  zone_id = var.zone_id
  name    = "gipc.dev"
  type    = "CNAME"
  content = "${var.tunnel_id}.cfargotunnel.com"
  proxied = true
  ttl     = 1
}

resource "cloudflare_record" "www" {
  zone_id = var.zone_id
  name    = "www"
  type    = "CNAME"
  content = "${var.tunnel_id}.cfargotunnel.com"
  proxied = true
  ttl     = 1
}

# The tunnel itself. config_src = "local" is the truth: ingress rules live in
# /etc/cloudflared/config.yml on the box (see infra/cloudflared + infra/ansible) — a remote
# tunnel_config resource would misstate how this tunnel is actually managed.
resource "cloudflare_zero_trust_tunnel_cloudflared" "gipc" {
  account_id = var.account_id
  name       = "gipc"
  secret     = var.tunnel_secret
  config_src = "local"

  # secret is ForceNew: without this, the first plan after import would want to REPLACE the
  # live tunnel. The real credential stays on the box, never in state.
  lifecycle {
    ignore_changes = [secret]
  }
}
