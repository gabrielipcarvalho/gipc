output "public_ip" {
  description = "Bootstrap SSH target — feeds infra/ansible/inventory.ini (host 'oracle')."
  value       = oci_core_instance.gipc.public_ip
}

output "instance_ocid" {
  value = oci_core_instance.gipc.id
}

output "image_used" {
  description = "Resolved Ubuntu 24.04 aarch64 image (pin it in a tfvars if drift ever bites)."
  value       = data.oci_core_images.ubuntu_arm.images[0].display_name
}
