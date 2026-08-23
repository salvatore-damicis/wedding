# Deploy in produzione (Azure)

Infrastruttura come codice con **Terraform**, pubblicazione con **GitHub Actions**.
Vedi le decisioni in [ADR-0003](adr/0003-azure-swa-blob-architecture.md) e [ADR-0006](adr/0006-iac-terraform-github-actions.md).

## Prerequisiti

- Subscription Azure attiva e [Terraform](https://developer.hashicorp.com/terraform/install) ≥ 1.6
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli): `az login` (poi `az account set --subscription <id>` se ne hai più di una)
- Un account GitHub

## 1. Bootstrap dello stato remoto (una volta sola)

```bash
cd infra/bootstrap
terraform init
terraform apply
terraform output backend_hcl      # copia l'output
```

Incolla l'output in `infra/backend.hcl` (git-ignored). Parti da `infra/backend.hcl.example`.

## 2. Crea l'infrastruttura

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars   # e compila admin_pin
# meglio ancora, non scrivere il PIN su file:
#   export TF_VAR_admin_pin='il-tuo-pin-reale'   (PowerShell: $env:TF_VAR_admin_pin='...')

terraform init -backend-config=backend.hcl
terraform apply
```

Prendi nota degli output:

```bash
terraform output swa_url                    # URL da condividere con gli invitati
terraform output -raw swa_api_key           # token di deploy (segreto)
```

## 3. Metti il codice su GitHub

```bash
# dalla radice del repo
git init && git add . && git commit -m "Sito matrimonio"
git branch -M main
git remote add origin https://github.com/<utente>/<repo>.git
git push -u origin main
```

Nel repo GitHub → **Settings → Secrets and variables → Actions → New repository secret**:

- Nome: `AZURE_STATIC_WEB_APPS_API_TOKEN`
- Valore: l'output `swa_api_key` del passo 2

Il primo push (o un push successivo) avvia il workflow `.github/workflows/azure-static-web-apps.yml`
che builda le Functions e pubblica tutto sulla Static Web App.

## 4. Verifica

- Apri `terraform output swa_url`.
- Smoke test: crea uno Spazio, carica una foto e un video, salva la mappa da `tavoli.html?admin`, conduci una partita da `giochi.html?admin`.
- (Opzionale) stringi la CORS: rimetti `allowed_origin = "https://<swa_default_host_name>"` in `terraform.tfvars` e `terraform apply`.

## Note

- `data/config.js` resta con `STORAGE.backend = "api"` in produzione. In locale, per lavorare senza backend, si può mettere `"local"` (vedi README).
- I segreti (`terraform.tfvars`, `backend.hcl`, `api/local.settings.json`, `*.tfstate`) sono git-ignored: non finiscono mai nel repo.
- Aggiungere un dominio personalizzato più avanti: risorsa `azurerm_static_web_app_custom_domain` + record DNS.
