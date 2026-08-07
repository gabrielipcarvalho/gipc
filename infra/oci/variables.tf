variable "compartment_ocid" {
  description = "Compartment to hold everything (tenancy root OCID is fine for a personal tenancy; a dedicated 'gipc' compartment is tidier)."
  type        = string
}

variable "region" {
  description = "Home region — Always Free resources only provision here."
  type        = string
  default     = "ap-sydney-1"
  validation {
    condition     = var.region == "ap-sydney-1"
    error_message = "Home region is ap-sydney-1 (permanent at signup); Always Free compute exists only there."
  }
}

variable "home_ip_cidr" {
  description = "Your current public IP as a /32 — the ONLY inbound allowed, for bootstrap SSH. The site needs zero inbound (Cloudflare Tunnel is outbound-only)."
  type        = string
  validation {
    condition     = can(cidrhost(var.home_ip_cidr, 0)) && endswith(var.home_ip_cidr, "/32")
    error_message = "Provide a single-host /32 CIDR, e.g. 203.0.113.7/32."
  }
}

variable "ssh_public_key" {
  description = "SSH public key for the ubuntu user."
  type        = string
}

# --- Always Free allowance caps (post-2026-06-15 halving): 1,500 OCPU-hrs + 9,000 GB-hrs/mo
# --- = 2 OCPU + 12 GB continuous; block storage free to 200 GB total. The validations make
# --- "we never leave the free tier" a plan-time error instead of a surprise invoice.

variable "ocpus" {
  description = "A1 OCPUs (Always Free floor: 2)."
  type        = number
  default     = 2
  validation {
    condition     = var.ocpus >= 1 && var.ocpus <= 2
    error_message = "ocpus must be 1–2: 2 OCPU × 744 h = 1,488 OCPU-hrs, inside the 1,500 free hrs. More exits the free allowance."
  }
}

variable "memory_in_gbs" {
  description = "A1 RAM in GB (Always Free floor: 12)."
  type        = number
  default     = 12
  validation {
    condition     = var.memory_in_gbs >= 4 && var.memory_in_gbs <= 12
    error_message = "memory_in_gbs must be 4–12: 12 GB × 744 h = 8,928 GB-hrs, inside the 9,000 free hrs. More exits the free allowance."
  }
}

variable "boot_volume_gb" {
  description = "Boot volume size (free block storage cap is 200 GB TOTAL — leave headroom for backups)."
  type        = number
  default     = 150
  validation {
    condition     = var.boot_volume_gb >= 50 && var.boot_volume_gb <= 150
    error_message = "boot_volume_gb must be 50–150: the 200 GB free cap covers boot + backups; 150 leaves 50 GB of headroom."
  }
}
