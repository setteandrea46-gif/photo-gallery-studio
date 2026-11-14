# Analisi del riferimento

Analisi eseguita il 14 novembre 2026 sul percorso pubblico indicato dall'utente.

## Funzionalità osservate

- `/g/18th-francesca/view-night` presenta un'introduzione fotografica a pieno schermo con movimento lento, `SALTA INTRO`, titolo ed `ENTRA`.
- Dopo l'intro compare una pagina quasi nera, con testi avorio e accento champagne/oro.
- La barra iniziale contiene `LA STORIA`, `SCARICA TUTTO` e la selezione per la stampa.
- Sono presenti timeline orizzontale, capitoli narrativi e centinaia di immagini numerate.
- Le miniature sono impaginate come stampe chiare con leggere rotazioni.
- Alcune voci rappresentano raffiche di più fotografie.
- Il lightbox ha immagine centrale, contatore, precedente/successiva, chiusura e download.
- Verificati: freccia destra passa da 1/446 a 2/446; ESC chiude il lightbox.
- Il riepilogo finale mostra numero di foto, progresso di visita e riferimenti dello studio.

## Dati tecnici rilevati

- La galleria osservata dichiarava 446 fotografie.
- Miniature e preview erano risorse separate, coerenti con caricamento progressivo.
- Il documento completo superava 36.000 px di altezza nel viewport osservato.
- `view-night` identifica la vista narrativa scura, non un semplice toggle tema.

## Responsive e limiti

Il browser automatizzato ha consentito l'ispezione diretta a circa 714 × 615 px. Non è stato possibile forzare in modo affidabile i viewport esatti 1440, 1024, 768 e 390 px. Nel progetto i breakpoint sono implementati, ma non vengono spacciati come osservati sul riferimento.

Non sono state verificate funzioni proprietarie lato amministrazione, autenticazione o caricamento del sito originale. Il pannello di questo progetto è un'implementazione originale richiesta dal brief.

## Differenze intenzionali

- Nessuna fotografia, logo, nome o asset del riferimento è incluso.
- Lo scheletro mostra segnaposto neutri finché il proprietario non carica le proprie immagini.
- L'area amministrativa usa D1/R2 e identità Sites.
- La produzione commerciale di stampe o archivi ZIP richiede un servizio esterno dedicato.
