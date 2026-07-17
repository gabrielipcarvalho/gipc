#!/usr/bin/env bash
# Import the live gipc.dev Cloudflare DNS + tunnel into this Terraform root.
#
# Idempotent: skips any resource already in state. Record ids are resolved by CONTENT MATCH
# against the LIVE API (never a hand-written id table — a mis-keyed id would import the wrong
# record, and for the two same-name TXT records content is the ONLY disambiguator). No secrets
# are read or emitted here; the tunnel credential is never touched (config_src = local).
#
# Requires in the environment (transient — never on disk):
#   CLOUDFLARE_API_TOKEN, TF_VAR_account_id, TF_VAR_zone_id, TF_VAR_tunnel_id, TF_VAR_tunnel_secret
# Usage: from infra/terraform/cloudflare/, `bash import.sh`.
set -euo pipefail

: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN}"
: "${TF_VAR_zone_id:?}" ; : "${TF_VAR_account_id:?}" ; : "${TF_VAR_tunnel_id:?}"

api() { curl -s -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" "$@"; }
RECORDS_JSON="$(api "https://api.cloudflare.com/client/v4/zones/${TF_VAR_zone_id}/dns_records?per_page=100")"

in_state() { terraform state list 2>/dev/null | grep -qxF "$1"; }

# Resolve a record id by exact (type, name, content) match against the live API.
rec_id() {
  local type="$1" name="$2" content="$3"
  echo "$RECORDS_JSON" | python3 -c '
import json,sys
d=json.load(sys.stdin)["result"]
t,n,c=sys.argv[1],sys.argv[2],sys.argv[3]
hits=[r["id"] for r in d if r["type"]==t and r["name"]==n and r.get("content")==c]
if len(hits)!=1:
    sys.stderr.write(f"FATAL: {t} {n} {c!r} matched {len(hits)} records (want 1)\n"); sys.exit(1)
print(hits[0])' "$type" "$name" "$content"
}

imp() { # resource_addr  type  name  content
  local addr="$1"
  if in_state "$addr"; then echo "skip (in state): $addr"; return; fi
  local id; id="$(rec_id "$2" "$3" "$4")"
  echo "import: $addr  ->  ${TF_VAR_zone_id}/${id}"
  terraform import "$addr" "${TF_VAR_zone_id}/${id}"
}

TUN="${TF_VAR_tunnel_id}.cfargotunnel.com"
imp cloudflare_record.apex             CNAME gipc.dev                       "$TUN"
imp cloudflare_record.www              CNAME www.gipc.dev                   "$TUN"
imp cloudflare_record.autoconfig       CNAME autoconfig.gipc.dev            autoconfig.migadu.com
imp cloudflare_record.autodiscover     CNAME autodiscover.gipc.dev          autodiscover.migadu.com
imp cloudflare_record.dkim1            CNAME key1._domainkey.gipc.dev        key1.gipc.dev._domainkey.migadu.com
imp cloudflare_record.dkim2            CNAME key2._domainkey.gipc.dev        key2.gipc.dev._domainkey.migadu.com
imp cloudflare_record.dkim3            CNAME key3._domainkey.gipc.dev        key3.gipc.dev._domainkey.migadu.com
imp cloudflare_record.mx_primary       MX    gipc.dev                       aspmx1.migadu.com
imp cloudflare_record.mx_secondary     MX    gipc.dev                       aspmx2.migadu.com
imp cloudflare_record.srv_autodiscover SRV   _autodiscover._tcp.gipc.dev    "1 443 autodiscover.migadu.com"
imp cloudflare_record.srv_imaps        SRV   _imaps._tcp.gipc.dev           "1 993 imap.migadu.com"
imp cloudflare_record.srv_pop3s        SRV   _pop3s._tcp.gipc.dev           "1 995 pop.migadu.com"
imp cloudflare_record.srv_submissions  SRV   _submissions._tcp.gipc.dev     "1 465 smtp.migadu.com"
imp cloudflare_record.txt_dmarc        TXT   _dmarc.gipc.dev                "v=DMARC1; p=quarantine;"
imp cloudflare_record.txt_spf          TXT   gipc.dev                       "v=spf1 include:spf.migadu.com -all"
imp cloudflare_record.txt_mail_verify  TXT   gipc.dev                       "hosted-email-verify=mj2ixoiz"

TADDR=cloudflare_zero_trust_tunnel_cloudflared.gipc
if in_state "$TADDR"; then
  echo "skip (in state): $TADDR"
else
  echo "import: $TADDR  ->  ${TF_VAR_account_id}/${TF_VAR_tunnel_id}"
  terraform import "$TADDR" "${TF_VAR_account_id}/${TF_VAR_tunnel_id}"
fi

echo "--- state list ---"
terraform state list
