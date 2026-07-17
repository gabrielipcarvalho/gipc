# The codified mirror of gipc.dev's Cloudflare provisioning: the tunnel + the full DNS zone
# (site CNAMEs + the Migadu mail set). Imported and applied in Sprint J — `plan` is clean;
# see README.md for the import notes (short names, config_src, the one reconciling apply).

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

# --- Migadu mail: the records that make gipc.dev email work. All DNS-only (unproxied),
# ttl 300. Authored verbatim from the live-API snapshot — never edit content to "tidy" it;
# a wrong byte here silently breaks mail. Names are the provider's SHORT form (verified at
# import: v4 stores the record's short name in state, not the FQDN). ---

resource "cloudflare_record" "autoconfig" {
  zone_id = var.zone_id
  name    = "autoconfig"
  type    = "CNAME"
  content = "autoconfig.migadu.com"
  proxied = false
  ttl     = 300
}

resource "cloudflare_record" "autodiscover" {
  zone_id = var.zone_id
  name    = "autodiscover"
  type    = "CNAME"
  content = "autodiscover.migadu.com"
  proxied = false
  ttl     = 300
}

resource "cloudflare_record" "dkim1" {
  zone_id = var.zone_id
  name    = "key1._domainkey"
  type    = "CNAME"
  content = "key1.gipc.dev._domainkey.migadu.com"
  proxied = false
  ttl     = 300
}

resource "cloudflare_record" "dkim2" {
  zone_id = var.zone_id
  name    = "key2._domainkey"
  type    = "CNAME"
  content = "key2.gipc.dev._domainkey.migadu.com"
  proxied = false
  ttl     = 300
}

resource "cloudflare_record" "dkim3" {
  zone_id = var.zone_id
  name    = "key3._domainkey"
  type    = "CNAME"
  content = "key3.gipc.dev._domainkey.migadu.com"
  proxied = false
  ttl     = 300
}

resource "cloudflare_record" "mx_primary" {
  zone_id  = var.zone_id
  name     = "gipc.dev"
  type     = "MX"
  content  = "aspmx1.migadu.com"
  priority = 10
  proxied  = false
  ttl      = 300
}

resource "cloudflare_record" "mx_secondary" {
  zone_id  = var.zone_id
  name     = "gipc.dev"
  type     = "MX"
  content  = "aspmx2.migadu.com"
  priority = 20
  proxied  = false
  ttl      = 300
}

resource "cloudflare_record" "srv_autodiscover" {
  zone_id = var.zone_id
  name    = "_autodiscover._tcp"
  type    = "SRV"
  ttl     = 300
  data {
    priority = 0
    weight   = 1
    port     = 443
    target   = "autodiscover.migadu.com"
  }
}

resource "cloudflare_record" "srv_imaps" {
  zone_id = var.zone_id
  name    = "_imaps._tcp"
  type    = "SRV"
  ttl     = 300
  data {
    priority = 0
    weight   = 1
    port     = 993
    target   = "imap.migadu.com"
  }
}

resource "cloudflare_record" "srv_pop3s" {
  zone_id = var.zone_id
  name    = "_pop3s._tcp"
  type    = "SRV"
  ttl     = 300
  data {
    priority = 0
    weight   = 1
    port     = 995
    target   = "pop.migadu.com"
  }
}

resource "cloudflare_record" "srv_submissions" {
  zone_id = var.zone_id
  name    = "_submissions._tcp"
  type    = "SRV"
  ttl     = 300
  data {
    priority = 0
    weight   = 1
    port     = 465
    target   = "smtp.migadu.com"
  }
}

resource "cloudflare_record" "txt_dmarc" {
  zone_id = var.zone_id
  name    = "_dmarc"
  type    = "TXT"
  content = "v=DMARC1; p=quarantine;"
  proxied = false
  ttl     = 300
}

resource "cloudflare_record" "txt_spf" {
  zone_id = var.zone_id
  name    = "gipc.dev"
  type    = "TXT"
  content = "v=spf1 include:spf.migadu.com -all"
  proxied = false
  ttl     = 300
}

resource "cloudflare_record" "txt_mail_verify" {
  zone_id = var.zone_id
  name    = "gipc.dev"
  type    = "TXT"
  content = "hosted-email-verify=mj2ixoiz"
  proxied = false
  ttl     = 300
}

# The tunnel itself. config_src = "local" is the truth: ingress rules live in
# /etc/cloudflared/config.yml on the box (see infra/cloudflared + infra/ansible) — a remote
# tunnel_config resource would misstate how this tunnel is actually managed.
resource "cloudflare_zero_trust_tunnel_cloudflared" "gipc" {
  account_id = var.account_id
  name       = "gipc"
  secret     = var.tunnel_secret
  config_src = "local"

  # Both secret and config_src are ForceNew, and neither survives import into state (the v4
  # provider leaves config_src null on read and never returns the real secret) — so a first
  # plan would see null→"local" and null→<dummy> and want to REPLACE the live tunnel. Ignoring
  # both suppresses that spurious replacement; the real credential + the local config both live
  # on the box, never in Terraform. (Verified at import: state carries the computed tunnel_token
  # but not `secret`; config_src imported as null → the replace was driven by config_src, not
  # the secret.)
  lifecycle {
    ignore_changes = [secret, config_src]
  }
}
