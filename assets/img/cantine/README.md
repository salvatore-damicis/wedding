# Loghi delle cantine

Un file per cantina, **nome = slug del nome della cantina** più `.png`:
`Ca' del Bosco` → `ca-del-bosco.png` (vedi `slugCantina()` in `js/tavoli/view.js`).
Non esiste un campo `logo` nei dati: il collegamento è la convenzione sul nome.
Se il file manca, il cerchio in piantina mostra le **iniziali** — quindi si può
pubblicare senza loghi e aggiungerli uno alla volta.

## ⚠️ I file attuali sono SEGNAPOSTO da sostituire

`cantina-1.png` … `cantina-13.png` corrispondono ai nomi segnaposto del seme in
`data/config.js` (`Cantina 1` … `Cantina 13`). Sono loghi di cantine **altrui**,
scaricati dalla categoria [Logos of wineries](https://commons.wikimedia.org/wiki/Category:Logos_of_wineries)
di Wikimedia Commons **al solo scopo di provare la resa grafica in locale**.

Vanno rimossi e rimpiazzati con i loghi delle vostre 13 cantine, rinominati
secondo lo slug del nome reale.

## Consigli sul formato

- **PNG con fondo trasparente** (o SVG), ritagliato **senza margini vuoti**.
- **Il più quadrato possibile.** I loghi "a striscia" (marchi tipografici larghi:
  qui i ratio vanno da 1.0 a 3.5) dentro un cerchio da ~40 px su telefono
  diventano una riga di testo illeggibile. Dove il marchio ha un simbolo
  (stemma, grappolo, castello), conviene ritagliare **solo il simbolo**.
