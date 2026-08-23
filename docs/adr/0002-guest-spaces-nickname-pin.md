# Spazi per invitato con nickname + PIN (niente autenticazione vera)

La galleria è organizzata in **spazi personali per invitato** anziché in album tematici. Ogni invitato crea uno spazio scegliendo un **nickname** (pubblico) e un **PIN** (segreto breve). Regole di accesso: scrittura solo sul proprio spazio (protetta dal PIN), lettura libera su tutti gli spazi. Non c'è autenticazione reale (niente email/password/account): il PIN protegge solo la scrittura.

Gli **sposi** hanno un PIN admin riservato che consente di cancellare qualsiasi foto o spazio — valvola di moderazione e unico meccanismo di recupero (PIN dimenticato ⇒ gli sposi azzerano lo spazio, l'invitato lo ricrea; nessun recupero self-service).

## Considered Options

- **Nickname puro senza protezione** — scartato: "spazi segregati" diventerebbe solo un'etichetta, chiunque potrebbe scrivere ovunque.
- **Proprietà legata al dispositivo (token localStorage)** — scartato: si perde lo spazio cambiando telefono o pulendo i dati, e un matrimonio si guarda da più dispositivi.
- **Autenticazione vera (account/email)** — scartato: attrito eccessivo per gli invitati, sproporzionato per l'occasione.

## Consequences

- Il modello dati deve legare ogni foto a uno spazio e ogni spazio a (nickname, PIN). L'adapter di storage espone operazioni per spazio, non un'unica lista piatta di foto.
- Il PIN è verificato **lato server** dalle Azure Functions (vedi ADR-0003): non è bypassabile dal client come lo era nel placeholder. Resta comunque un codice breve → è dissuasione robusta, non sicurezza crittografica forte. Nel `LocalAdapter` (solo UI, senza backend) il controllo resta lato client.
