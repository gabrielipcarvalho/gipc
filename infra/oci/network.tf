# Minimal public network: the VM needs OUTBOUND (tunnel, GHCR pulls, apt) and one inbound
# pinhole (SSH from home) for bootstrap. No LB (paid — Cloudflare Tunnel replaces it), no
# service gateway complexity.

resource "oci_core_vcn" "gipc" {
  compartment_id = var.compartment_ocid
  display_name   = "gipc-vcn"
  cidr_blocks    = ["10.10.0.0/16"]
  dns_label      = "gipc"
}

resource "oci_core_internet_gateway" "igw" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.gipc.id
  display_name   = "gipc-igw"
}

resource "oci_core_route_table" "public" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.gipc.id
  display_name   = "gipc-public-rt"

  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_internet_gateway.igw.id
  }
}

resource "oci_core_subnet" "public" {
  compartment_id             = var.compartment_ocid
  vcn_id                     = oci_core_vcn.gipc.id
  display_name               = "gipc-public"
  cidr_block                 = "10.10.1.0/24"
  route_table_id             = oci_core_route_table.public.id
  dns_label                  = "pub"
  prohibit_public_ip_on_vnic = false
}

# NSG carries the actual policy (subnet security lists stay default-ish; NSG is per-VNIC and
# matches how we think about it: this one VM, these rules).
resource "oci_core_network_security_group" "host" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.gipc.id
  display_name   = "gipc-host-nsg"
}

resource "oci_core_network_security_group_security_rule" "ssh_from_home" {
  network_security_group_id = oci_core_network_security_group.host.id
  direction                 = "INGRESS"
  protocol                  = "6" # TCP
  source_type               = "CIDR_BLOCK"
  source                    = var.home_ip_cidr
  description               = "bootstrap SSH — the site itself needs zero inbound (CF Tunnel is outbound-only)"

  tcp_options {
    destination_port_range {
      min = 22
      max = 22
    }
  }
}

resource "oci_core_network_security_group_security_rule" "egress_all" {
  network_security_group_id = oci_core_network_security_group.host.id
  direction                 = "EGRESS"
  protocol                  = "all"
  destination_type          = "CIDR_BLOCK"
  destination               = "0.0.0.0/0"
  description               = "tunnel + GHCR + apt + Anthropic API"
}
