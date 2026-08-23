# Deploy in produzione (Azure)

Infrastruttura come codice con **Terraform**, il tutto orchestrato da **GitHub Actions**
(un unico workflow manuale applica l'infra e pubblica il contenuto).
Vedi le decisioni in [ADR-0003](adr/0003-azure-swa-blob-architecture.md) e [ADR-0006](adr/0006-iac-terraform-github-actions.md).

> **Resource Group già esistente.** Terraform usa un RG che esiste già (data source, non lo crea):
> sia lo storage del tfstate sia le risorse dell'app finiscono lì.

## A) Deploy gestito da GitHub Actions (consigliato)

Il workflow [`.github/workflows/infra-and-deploy.yml`](../.github/workflows/infra-and-deploy.yml)
si avvia **a mano** dalla tab **Actions** del repo e in un solo run:
`terraform apply` (infra) → legge il deployment token dagli output → pubblica sito + Functions.
L'autenticazione ad Azure è via **OIDC**: nessuna password/secret di lunga durata.

### 1. Crea l'identità per GitHub (una volta sola)

Serve un'app registration (service principal) con un *federated credential* legato al tuo repo.
Da una shell con Azure CLI loggata (`az login`):

```bash
# --- compila questi tre ---
SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
RG="<rg-esistente>"
REPO="<owner>/<repo>"          # es. salvatore/wedding-site

APP_ID="$(az ad app create --display-name "smwedding-gha" --query appId -o tsv)"
az ad sp create --id "$APP_ID"

# Contributor sul solo Resource Group (basta questo, non serve tutta la subscription)
az role assignment create --assignee "$APP_ID" --role Contributor \
  --scope "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RG"

# Federated credential per i run sul branch main
az ad app federated-credential create --id "$APP_ID" --parameters "{
  \"name\": \"github-main\",
  \"issuer\": \"https://token.actions.githubusercontent.com\",
  \"subject\": \"repo:${REPO}:ref:refs/heads/main\",
  \"audiences\": [\"api://AzureADTokenExchange\"]
}"

# Valori da mettere su GitHub:
echo "AZURE_CLIENT_ID       = $APP_ID"
echo "AZURE_TENANT_ID       = $(az account show --query tenantId -o tsv)"
echo "AZURE_SUBSCRIPTION_ID = $SUBSCRIPTION_ID"
```

> Se il tenant aziendale ti impedisce di creare app registration, si può usare la variante
> con client-secret o un SP esistente: vedi le note in fondo.

### 2. Imposta secret e variabili nel repo GitHub

**Settings → Secrets and variables → Actions.**

**Secrets** (tab *Secrets*):

| Nome | Valore |
|------|--------|
| `AZURE_CLIENT_ID` | `APP_ID` dallo step 1 |
| `AZURE_TENANT_ID` | tenant id dallo step 1 |
| `AZURE_SUBSCRIPTION_ID` | subscription id dallo step 1 |
| `ADMIN_PIN` | il PIN admin reale degli Sposi (≥ 6 caratteri) |

**Variables** (tab *Variables* — non sono segrete):

| Nome | Valore | Obbligatoria? |
|------|--------|---------------|
| `APP_RESOURCE_GROUP` | nome del RG esistente | sì |
| `TFSTATE_SA` | nome **globalmente unico** per lo storage account del tfstate (3-24 minuscole/numeri, es. `smweddingtfstate01`) | sì |
| `PREFIX` | prefisso risorse (default `smwedding`) | no |
| `SWA_LOCATION` | regione SWA (default `West Europe`) | no |
| `ALLOWED_ORIGIN` | CORS del Blob (default `*`) | no |

> Il deployment token della SWA **non** va messo a mano: lo produce Terraform e il workflow
> lo legge da solo durante il run.

### 3. Push del codice e avvio

```bash
git init && git add . && git commit -m "Sito matrimonio"
git branch -M main
git remote add origin https://github.com/<owner>/<repo>.git
git push -u origin main
```

Poi: **Actions → "Infra (Terraform) + Deploy" → Run workflow** (lascia `apply_infra` attivo al primo giro).
Lo storage del tfstate viene creato automaticamente al primo run se non esiste.

### 4. Verifica

- L'URL del sito è nei log del passo *Terraform apply* (output `swa_url`), oppure nel portale sulla Static Web App.
- Smoke test: crea uno Spazio, carica una foto e un video, salva la mappa da `tavoli.html?admin`, conduci una partita da `giochi.html?admin`.
- (Opzionale) stringi la CORS: imposta la variabile `ALLOWED_ORIGIN = https://<host-della-swa>` e rilancia il workflow.

I run successivi: fai push e riavvia il workflow. Se hai cambiato solo il contenuto (niente infra),
puoi deselezionare `apply_infra` per saltare Terraform e pubblicare solo il sito.

---

## B) Deploy manuale da locale (alternativa)

Se preferisci non usare GitHub Actions, puoi fare tutto da terminale.

```bash
# 1. Stato remoto (una volta sola)
cd infra/bootstrap
terraform init
terraform apply -var 'resource_group_name=<rg-esistente>'
terraform output backend_hcl        # copia in ../backend.hcl (vedi backend.hcl.example)

# 2. Infra
cd ../
cp terraform.tfvars.example terraform.tfvars   # compila resource_group_name + admin_pin
#   (oppure: export TF_VAR_admin_pin='...'  /  PowerShell: $env:TF_VAR_admin_pin='...')
terraform init -backend-config=backend.hcl
terraform apply
terraform output swa_url
terraform output -raw swa_api_key    # token di deploy

# 3. Contenuto (SWA CLI)
npx @azure/static-web-apps-cli deploy . --api-location api \
  --deployment-token "$(terraform -chdir=infra output -raw swa_api_key)"
```

## Note

- `data/config.js` resta con `STORAGE.backend = "api"` in produzione. In locale, per lavorare senza backend, si può mettere `"local"` (vedi README).
- I segreti (`terraform.tfvars`, `backend.hcl`, `api/local.settings.json`, `*.tfstate`) sono git-ignored: non finiscono mai nel repo.
- **Variante senza OIDC** (tenant che blocca le app registration): crea un secret sull'app —
  `az ad app credential reset --id "$APP_ID"` restituisce `password` — e nel workflow sostituisci
  l'OIDC con `ARM_CLIENT_SECRET` (secret `AZURE_CLIENT_SECRET`), togliendo `ARM_USE_OIDC` e
  `permissions: id-token`. Dimmelo e preparo la variante.
- Aggiungere un dominio personalizzato più avanti: risorsa `azurerm_static_web_app_custom_domain` + record DNS.
