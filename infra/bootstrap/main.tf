# ---------------------------------------------------------------------------
# Bootstrap dello stato remoto di Terraform (si esegue UNA VOLTA sola).
#
# Crea il resource group + lo storage account + il container che conserveranno
# il tfstate della configurazione principale (../). Questo modulo usa stato
# LOCALE (non ha un backend remoto): è il classico problema dell'uovo e la
# gallina — non puoi mettere in remoto lo stato dello storage che deve ancora
# esistere.
#
# Uso:
#   cd infra/bootstrap
#   terraform init
#   terraform apply
# Poi copia gli output in ../backend.hcl e inizializza la config principale con
#   terraform init -backend-config=backend.hcl
# ---------------------------------------------------------------------------

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "azurerm" {
  features {}
  # La subscription arriva da `az login` / ARM_SUBSCRIPTION_ID.
}

variable "prefix" {
  description = "Prefisso per i nomi delle risorse (minuscolo, no simboli)."
  type        = string
  default     = "smwedding"
}

variable "location" {
  description = "Regione Azure."
  type        = string
  default     = "West Europe"
}

# Suffisso casuale: i nomi degli storage account sono globali e devono essere unici.
resource "random_string" "suffix" {
  length  = 6
  upper   = false
  special = false
}

resource "azurerm_resource_group" "tfstate" {
  name     = "${var.prefix}-tfstate-rg"
  location = var.location
}

resource "azurerm_storage_account" "tfstate" {
  name                            = "${var.prefix}tfstate${random_string.suffix.result}"
  resource_group_name             = azurerm_resource_group.tfstate.name
  location                        = azurerm_resource_group.tfstate.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = false

  blob_properties {
    versioning_enabled = true # lo stato è prezioso: teniamo lo storico
  }
}

resource "azurerm_storage_container" "tfstate" {
  name                  = "tfstate"
  storage_account_id    = azurerm_storage_account.tfstate.id
  container_access_type = "private"
}

output "resource_group_name" {
  value = azurerm_resource_group.tfstate.name
}

output "storage_account_name" {
  value = azurerm_storage_account.tfstate.name
}

output "container_name" {
  value = azurerm_storage_container.tfstate.name
}

output "backend_hcl" {
  description = "Incolla questo in infra/backend.hcl"
  value       = <<-EOT
    resource_group_name  = "${azurerm_resource_group.tfstate.name}"
    storage_account_name = "${azurerm_storage_account.tfstate.name}"
    container_name       = "${azurerm_storage_container.tfstate.name}"
    key                  = "wedding-site.tfstate"
  EOT
}
