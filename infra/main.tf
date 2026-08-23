# ---------------------------------------------------------------------------
# Infrastruttura del sito matrimonio (ADR-0003, ADR-0006).
#
#   - usa un Resource Group GIÀ ESISTENTE (data source, non lo crea)
#   - 1 Storage Account (Blob container "photos" a lettura pubblica + Table)
#         → metadati in Table, byte di foto/video/loghi in Blob
#   - 1 Static Web App (Free, West Europe) che serve il sito + le Functions /api
#
# La pubblicazione del codice NON è gestita qui: avviene via GitHub Actions con
# il deployment token (output `swa_api_key`) salvato come secret del repo.
# Terraform crea l'infrastruttura; la pipeline pubblica il contenuto.
# ---------------------------------------------------------------------------

resource "random_string" "suffix" {
  length  = 6
  upper   = false
  special = false
}

# Resource Group già esistente: Terraform lo referenzia, non lo crea (ADR-0006).
data "azurerm_resource_group" "app" {
  name = var.resource_group_name
}

# ---- Storage: metadati (Table) + byte (Blob) ------------------------------
resource "azurerm_storage_account" "app" {
  name                            = "${var.prefix}data${random_string.suffix.result}"
  resource_group_name             = data.azurerm_resource_group.app.name
  location                        = data.azurerm_resource_group.app.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = true # il container "photos" è a lettura pubblica
}

# Container a lettura pubblica: le foto/video/loghi sono serviti direttamente da
# Blob (URL pubblici, non indicizzati). L'app usa comunque un SAS per la SCRITTURA.
resource "azurerm_storage_container" "photos" {
  name                  = var.blob_container
  storage_account_id    = azurerm_storage_account.app.id
  container_access_type = "blob"
}

# Le Table ("spaces", "photos", "site") e la CORS del Blob sono create a runtime
# da ensureInit() (api/src/shared/storage.js): dipendono da valori applicativi
# (ALLOWED_ORIGIN) e restano idempotenti.

# ---- Static Web App --------------------------------------------------------
resource "azurerm_static_web_app" "site" {
  name                = "${var.prefix}-swa"
  resource_group_name = data.azurerm_resource_group.app.name
  location            = var.swa_location
  sku_tier            = "Free"
  sku_size            = "Free"

  app_settings = {
    STORAGE_CONNECTION = azurerm_storage_account.app.primary_connection_string
    BLOB_CONTAINER     = var.blob_container
    ADMIN_PIN          = var.admin_pin
    ALLOWED_ORIGIN     = var.allowed_origin
  }
}
