# Sito multi-pagina statico (no single-page, no framework)

Il sito è organizzato in più file HTML statici separati (home, dettagli, galleria/album, giochi) invece di una singola pagina a scroll o una SPA con router JS. Scelto perché la galleria/album sarà la parte più ricca e pesante e merita un URL proprio, condivisibile e caricabile in modo indipendente, mantenendo home e giochi leggeri. Restiamo senza framework né build step; il costo accettato è la duplicazione di nav/footer tra le pagine.
