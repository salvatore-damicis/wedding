variable "prefix" {
  description = "Prefisso per i nomi delle risorse (minuscolo, alfanumerico)."
  type        = string
  default     = "smwedding"

  validation {
    condition     = can(regex("^[a-z0-9]{3,16}$", var.prefix))
    error_message = "Il prefisso deve essere 3-16 caratteri minuscoli/numeri (i nomi degli storage account sono restrittivi)."
  }
}

variable "location" {
  description = "Regione Azure per resource group e storage."
  type        = string
  default     = "West Europe"
}

variable "swa_location" {
  description = "Regione della Static Web App. Le SWA vivono solo in alcune regioni: West Europe è la più vicina all'Italia supportata."
  type        = string
  default     = "West Europe"

  validation {
    condition = contains(
      ["West Europe", "Central US", "East US 2", "West US 2", "East Asia"],
      var.swa_location
    )
    error_message = "Regione non supportata dalle Static Web Apps. Usa una tra: West Europe, Central US, East US 2, West US 2, East Asia."
  }
}

variable "blob_container" {
  description = "Nome del container Blob per foto e loghi."
  type        = string
  default     = "photos"
}

variable "admin_pin" {
  description = "PIN admin degli Sposi (moderazione foto, editor tavoli, regia del gioco). NON committare: passalo via terraform.tfvars (git-ignored) o TF_VAR_admin_pin."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.admin_pin) >= 6 && var.admin_pin != "changeme-admin"
    error_message = "Scegli un PIN admin reale di almeno 6 caratteri (non il fallback insicuro 'changeme-admin')."
  }
}

variable "allowed_origin" {
  description = "Origine consentita per la CORS del Blob (upload diretto dal browser). '*' va bene per un sito privato/noindex; per stringere, dopo il primo apply metti l'URL della SWA (output default_host_name)."
  type        = string
  default     = "*"
}
