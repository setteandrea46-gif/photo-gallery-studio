# Galleria fotografica — scheletro professionale

Piattaforma originale ispirata al linguaggio visivo del riferimento, senza fotografie, logo o codice del sito analizzato. Le immagini pubblicate sono esclusivamente quelle caricate dal proprietario nell'area amministrativa.

**Versione online:** https://atelier-notte-gallery.andsev7.chatgpt.site/g/serata-villa/view-night

## Cosa include

- Intro cinematografica, galleria responsive a capitoli, timeline e lightbox.
- Tastiera (frecce ed ESC), navigazione touch e selezione per stampa.
- Eventi con URL `/g/<slug>/view-night`.
- Pubblicazione/nascondimento, download opzionale e password per galleria.
- Area privata `/admin` protetta dall'identità della piattaforma.
- Upload multiplo in R2 (massimo 25 file per richiesta, 15 MB per file).
- Dati persistenti in D1: utenti, gallerie, fotografie e impostazioni.
- File protetti: una foto non viene servita se la galleria è nascosta o bloccata.
- Branding centralizzato e cartella `public/branding/`.

## Verifica

```bash
npm run build
npm run validate
```

## Prima configurazione

1. Aprire `/admin` e scegliere **Eventi e foto** per creare l'evento.
2. Caricare le proprie fotografie JPG, PNG o WebP nell'evento selezionato.
3. Aprire **Allestisci il sito** per impostare colori, logo e fotografia introduttiva.
4. Attivare pubblicazione, download e password secondo necessità.
5. Copiare il link univoco della galleria.

## Branding

Il layout usa inizialmente `NOME STUDIO`, senza inventare un'identità commerciale. `public/branding/logo-placeholder.svg` è sostituibile. Nome e contatti si cambiano dall'area amministrativa.

## Dati e sicurezza

- `DB` è il database D1 e `BUCKET` lo storage R2.
- La migrazione iniziale è in `drizzle/0000_photo_gallery.sql`.
- Le password delle gallerie sono salvate come digest, mai in chiaro.
- Lo sblocco usa cookie HttpOnly, Secure e SameSite.
- Gli endpoint amministrativi richiedono l'identità autenticata di Sites.
- `.env.example` non contiene segreti.

## Struttura

- `worker/parts/01-core.js`: stile, helper e configurazione.
- `worker/parts/02-pages.js`: pagine pubbliche e amministrative.
- `worker/parts/03-api.js`: API, autorizzazione, database e storage.
- `drizzle/`: schema persistente.
- `public/branding/`: asset sostituibili.
- `docs/ANALISI-RIFERIMENTO.md`: funzionalità realmente verificate.

## Deploy

Il progetto è predisposto per OpenAI Sites/Cloudflare Worker. Per un porting su Vercel occorre sostituire D1/R2 con PostgreSQL e uno storage S3/Supabase; interfaccia e modello dati restano riutilizzabili.
