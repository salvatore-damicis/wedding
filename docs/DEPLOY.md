# Deploy in produzione (Azure)

Infrastruttura come codice con **Terraform** (eseguito da locale), pubblicazione del
contenuto con **GitHub Actions** ad ogni push su `main`.
Vedi le decisioni in [ADR-0003](adr/0003-azure-swa-blob-architecture.md) e [ADR-0006](adr/0006-iac-terraform-github-actions.md).

Il ponte tra i due mondi è **uno solo**: il *deployment token* della Static Web App,
che Terraform produce come output e tu salvi come secret del repo.

## Prerequisiti

- Subscription Azure attiva e [Terraform](https://developer.hashicorp.com/terraform/install) ≥ 1.6
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli): `az login` (poi `az account set --subscription <id>` se ne hai più di una)
- Un account GitHub

> **Resource Group già esistente.** Terraform usa un RG che esiste già (data source, non lo crea):
> sia lo storage del tfstate sia le risorse dell'app finiscono lì.

## 1. Bootstrap dello stato remoto (una volta sola)

```bash
cd infra/bootstrap
terraform init
terraform apply -var 'resource_group_name=<rg-esistente>'
terraform output backend_hcl      # copia l'output
```

Incolla l'output in `infra/backend.hcl` (git-ignored). Parti da `infra/backend.hcl.example`.

## 2. Crea l'infrastruttura (Terraform, da locale)

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars   # e compila resource_group_name + admin_pin
# meglio ancora, non scrivere il PIN su file:
#   export TF_VAR_admin_pin='il-tuo-pin-reale'   (PowerShell: $env:TF_VAR_admin_pin='...')

terraform init -backend-config=backend.hcl
terraform apply
```

Prendi nota degli output:

```bash
terraform output swa_url                    # URL da condividere con gli invitati
terraform output -raw swa_api_key           # deployment token (segreto)
```

## 3. Metti il codice su GitHub e imposta il secret

```bash
# dalla radice del repo
git init && git add . && git commit -m "Sito matrimonio"
git branch -M main
git remote add origin https://github.com/<owner>/<repo>.git
git push -u origin main
```

Nel repo GitHub → **Settings → Secrets and variables → Actions → New repository secret**:

| Nome | Valore |
|------|--------|
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | l'output `swa_api_key` del passo 2 |

Da quel momento **ogni push su `main`** avvia il workflow
[`.github/workflows/azure-static-web-apps.yml`](../.github/workflows/azure-static-web-apps.yml)
che builda le Functions e pubblica tutto sulla Static Web App. Le Pull Request ottengono
un ambiente di anteprima, chiuso automaticamente al merge/close.

## 4. Verifica

- Apri `terraform output swa_url`.
- Smoke test: crea uno Spazio, carica una foto e un video, salva la mappa da `tavoli.html?admin`, conduci una partita da `giochi.html?admin`.
- (Opzionale) stringi la CORS: rimetti `allowed_origin = "https://<swa_default_host_name>"` in `terraform.tfvars` e `terraform apply`.

## Aggiornamenti successivi

- **Solo contenuto** (HTML/CSS/JS, Functions): basta `git push` — il workflow ripubblica.
- **Infrastruttura** (app settings, risorse): modifica i file in `infra/` e rilancia `terraform apply` da locale. Se il `swa_api_key` cambia, aggiorna il secret su GitHub.

## Note

- `data/config.js` resta con `STORAGE.backend = "api"` in produzione. In locale, per lavorare senza backend, si può mettere `"local"` (vedi README).
- I segreti (`terraform.tfvars`, `backend.hcl`, `api/local.settings.json`, `*.tfstate`) sono git-ignored: non finiscono mai nel repo.
- Aggiungere un dominio personalizzato più avanti: risorsa `azurerm_static_web_app_custom_domain` + record DNS.
