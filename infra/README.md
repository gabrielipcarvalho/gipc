# infra — gipc.dev as code

Public serving path:

    Cloudflare edge (HTTPS)  ->  Cloudflare Tunnel `gipc`  ->  k3s on the `garuda` home box

DNS: `gipc.dev` + `www` are proxied CNAMEs -> `<tunnel-id>.cfargotunnel.com`. Mail (MX -> Migadu) is independent and untouched.

## cloudflared/
- `config.yml` — tunnel ingress (`gipc.dev`, `www` -> k3s NodePort `30080`). Deploys to `/etc/cloudflared/config.yml`.
- `cloudflared.service` — systemd unit. Deploys to `/etc/systemd/system/`.
- **Credentials** (`/etc/cloudflared/gipc.json`, contains the tunnel secret) are **NOT** in this repo.

## k3s/
- `holding.yaml` — namespace `gipc`, nginx Deployment, NodePort Service (`30080`).
- `holding-index.html` — placeholder page, mounted via the `holding` configmap.

### Reproduce
```sh
# backend
sudo k3s kubectl apply -f k3s/holding.yaml
sudo k3s kubectl -n gipc create configmap holding \
  --from-file=index.html=k3s/holding-index.html \
  --dry-run=client -o yaml | sudo k3s kubectl apply -f -
sudo k3s kubectl -n gipc rollout restart deploy/holding

# tunnel (creds must already exist at /etc/cloudflared/gipc.json)
sudo cp cloudflared/config.yml /etc/cloudflared/config.yml
sudo cp cloudflared/cloudflared.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now cloudflared
```
