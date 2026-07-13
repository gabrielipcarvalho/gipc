# Ansible — garuda host provisioning (check-only)

Codifies the host-level provisioning of garuda (the single-node k3s server behind Cloudflare Tunnel that
serves gipc.dev): base packages, k3s, and cloudflared. Complements [Terraform](../terraform/) (which
codifies the k8s namespaces).

## CHECK-ONLY — never run without `--check` this sprint
The box is already provisioned. The deliverable is the codified playbook + a clean dry-run, **not** a
re-apply (re-provisioning a live single-node cluster would risk gipc.dev).

```bash
# offline (no host needed — the CI/dev gate)
ansible-playbook --syntax-check infra/ansible/playbook.yml
ansible-lint infra/ansible/playbook.yml

# dry-run against the live host (read-only; changes nothing)
ansible-playbook -i infra/ansible/inventory.ini infra/ansible/playbook.yml --check --diff
```

Every task is idempotent + check-safe (`package`/`stat`/`file`/`systemd`; the k3s install is guarded by
`creates:`). A real run (no `--check`) is intentionally out of scope.
