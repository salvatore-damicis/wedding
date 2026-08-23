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

  # Stato remoto: i valori concreti arrivano da backend.hcl (creato dal bootstrap)
  #   terraform init -backend-config=backend.hcl
  backend "azurerm" {}
}

provider "azurerm" {
  features {}
}
