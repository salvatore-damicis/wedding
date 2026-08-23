output "swa_default_host_name" {
  description = "URL pubblico del sito (senza https://)."
  value       = azurerm_static_web_app.site.default_host_name
}

output "swa_url" {
  description = "URL pubblico del sito da condividere con gli invitati."
  value       = "https://${azurerm_static_web_app.site.default_host_name}"
}

output "swa_api_key" {
  description = "Deployment token della Static Web App. Salvalo come secret GitHub AZURE_STATIC_WEB_APPS_API_TOKEN."
  value       = azurerm_static_web_app.site.api_key
  sensitive   = true
}

output "storage_account_name" {
  value = azurerm_storage_account.app.name
}

output "storage_connection_string" {
  description = "Stringa di connessione dello storage (già impostata come app setting della SWA)."
  value       = azurerm_storage_account.app.primary_connection_string
  sensitive   = true
}
