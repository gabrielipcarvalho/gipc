data "oci_identity_availability_domains" "ads" {
  compartment_id = var.compartment_ocid
}

# Latest Canonical Ubuntu 24.04 build for the A1 shape (the shape filter selects the aarch64 image).
data "oci_core_images" "ubuntu_arm" {
  compartment_id           = var.compartment_ocid
  operating_system         = "Canonical Ubuntu"
  operating_system_version = "24.04"
  shape                    = "VM.Standard.A1.Flex"
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

resource "oci_core_instance" "gipc" {
  compartment_id      = var.compartment_ocid
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
  display_name        = "gipc-node"
  shape               = "VM.Standard.A1.Flex"

  shape_config {
    ocpus         = var.ocpus
    memory_in_gbs = var.memory_in_gbs
  }

  source_details {
    source_type             = "image"
    source_id               = data.oci_core_images.ubuntu_arm.images[0].id
    boot_volume_size_in_gbs = var.boot_volume_gb
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.public.id
    assign_public_ip = true # ephemeral — bootstrap SSH; droppable post-cutover
    nsg_ids          = [oci_core_network_security_group.host.id]
    hostname_label   = "gipc-node"
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
    # No user_data: host bootstrap is infra/ansible/ (runbook Phase B) — one bootstrap system, not two.
  }

  # A restart is a fresh capacity placement (runbook §1) — never let TF cycle the box for a
  # mutable-looking change without an explicit decision.
  lifecycle {
    prevent_destroy = true
  }
}
