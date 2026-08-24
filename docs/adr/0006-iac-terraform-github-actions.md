# Infrastruttura come codice: Terraform + deploy via GitHub Actions

> **Aggiornamento (RG preesistente).** Terraform non crea più il Resource Group: ne usa uno **già esistente** come `data source` (`var.resource_group_name`), lo stesso per lo storage del tfstate (bootstrap) e per le risorse dell'app. Dove sotto si legge che `terraform apply`/il bootstrap "crea il Resource Group", oggi lo referenzia soltanto.

L'infrastruttura Azure (ADR-0003: Static Web App + Storage) è descritta in **Terraform** (`infra/`, provider `azurerm`) e il codice del sito è pubblicato da **GitHub Actions** a ogni push su `main`. Terraform crea e possiede l'infrastruttura; la pipeline pubblica il contenuto. I due mondi si toccano in un solo punto: il **deployment token** della SWA.

## 1. Terraform possiede l'infrastruttura, non il codice

`terraform apply` crea Resource Group, Storage Account (Blob container `photos` a lettura pubblica + Table) e la Static Web App (Free, West Europe), e imposta gli **app settings** della SWA (`STORAGE_CONNECTION`, `BLOB_CONTAINER`, `ADMIN_PIN`, `ALLOWED_ORIGIN`). Le Table e la CORS del Blob restano create a runtime da `ensureInit()`: dipendono da valori applicativi e sono idempotenti, quindi tenerle fuori da Terraform evita di duplicare la stessa verità in due posti.

## 2. Il deploy passa da GitHub Actions con il deployment token, non da Terraform

Terraform **non** collega il repo GitHub alla SWA (niente `repository_url`/`repository_token`). Espone invece l'output sensibile `swa_api_key`, che si salva come secret del repo (`AZURE_STATIC_WEB_APPS_API_TOKEN`); un workflow scritto a mano (`.github/workflows/azure-static-web-apps.yml`) usa `Azure/static-web-apps-deploy@v1` per pubblicare sito + Functions.

Perché non far collegare il repo a Terraform: quella strada obbliga a dare a Terraform un **PAT GitHub** con permessi ampi e a far generare a lui il workflow — un secret in più da custodire e meno controllo sulla pipeline. Con il token di deploy come unico ponte, Terraform non conosce GitHub e GitHub non conosce Azure se non per pubblicare.

## 3. Stato remoto su Azure Storage, con bootstrap a stato locale

Il tfstate vive in un backend `azurerm` (Storage Account dedicato, container `tfstate`), così non si perde cambiando o formattando il PC ed è condivisibile. Il classico problema dell'uovo e la gallina — lo storage dello stato deve esistere prima di poterci mettere lo stato — si risolve con un modulo separato `infra/bootstrap/` a **stato locale**, eseguito una volta sola, che crea quello storage e stampa i valori per `backend.hcl`.

## Conseguenze accettate

- **URL gratuito `*.azurestaticapps.net`**: nessun dominio custom né DNS per ora (aggiungibile dopo con una risorsa `azurerm_static_web_app_custom_domain`).
- **Segreti fuori dal repo**: `ADMIN_PIN`, connection string e token non sono in Terraform committato — arrivano da `terraform.tfvars` / `TF_VAR_*` (git-ignored) e dagli output sensibili. Il `.gitignore` blocca `*.tfstate`, `*.tfvars` (tranne gli `.example`) e `backend.hcl`.
- **`ALLOWED_ORIGIN` iniziale `*`**: l'hostname della SWA non è prevedibile prima della creazione, quindi non si può auto-referenziare negli app settings. Per un sito privato/noindex `*` sulla CORS del Blob è accettabile; si stringe con un secondo apply mettendo l'URL reale.
- **Pubblicazione a due comandi**: `terraform apply` (infra) e `git push` (contenuto) sono passi distinti. È il prezzo della separazione infra/codice.

## Considered Options

- **`azurerm_static_web_app` con repo collegato** — un solo flusso, scartato per il PAT GitHub ad ampio raggio e il minor controllo sul workflow (vedi 2).
- **Deploy manuale da CLI (`swa deploy`)** — nessun GitHub, scartato: l'utente vuole push-to-deploy e la tracciabilità dei rilasci.
- **Stato Terraform locale** — zero setup, scartato: perdere il file significa che Terraform "dimentica" cosa ha creato (vedi 3).
- **Bicep invece di Terraform** — nativo Azure, scartato: l'utente ha chiesto esplicitamente Terraform e ne trae competenza riusabile.
