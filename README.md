# KartTime Reader WebApp 3.0

Dit is de Chrome-extensie `KartTimeReader_v2`, omgebouwd naar een normale webapp.

## Wat is veranderd?

De extensie gebruikte:

- `manifest.json`
- `content.js`
- `chrome.storage`
- `chrome.tabs`
- de Apex-pagina als content-script

Deze versie gebruikt:

- normale HTML/CSS/JavaScript
- een kleine Node/Express-server
- Playwright om Apex Timing in een browser te openen
- `localStorage` voor de ranking en heatgeschiedenis

Er is dus geen Chrome-extensie meer nodig.

## Functies

- Apex Timing-link invoeren
- live timing uitlezen
- kartnummers automatisch herkennen
- zichtbare beste rondetijd gebruiken
- huidige/laatste lap niet als beste tijd gebruiken
- drivernaam proberen te herkennen
- sessie/heat/fase herkennen
- iedere heat opslaan
- beste tijd per kart
- gemiddelde per kart
- aantal opgeslagen heats
- ranking:
  - 70% gemiddelde
  - 30% beste tijd
- karts verwijderen
- automatisch opnieuw uitlezen
- opgeslagen gegevens blijven in de browser staan

## Installeren

Je hebt Node.js nodig.

Open in deze map een terminal:

```bash
npm install
```

Daarna:

```bash
npx playwright install chromium
```

En daarna:

```bash
npm start
```

Open vervolgens:

```text
http://localhost:3000
```

## Belangrijk

De browserextensie kon direct de reeds gerenderde Apex-pagina uitlezen.

Een normale website mag dat niet zomaar door CORS. Daarom opent deze webapp Apex aan de serverkant met Playwright. De webbrowser van de gebruiker praat alleen met de eigen webapp.

De Apex-pagina moet bereikbaar zijn en de HTML moet ongeveer dezelfde structuur blijven gebruiken.

## GitHub

Alleen GitHub Pages is niet genoeg voor deze versie, omdat GitHub Pages geen Node/Playwright-server draait.

Voor online gebruik heb je bijvoorbeeld een Node-host nodig die Playwright ondersteunt.

De frontend kan wel vanuit dezelfde Node-app worden aangeboden.

## Data

De ranking wordt in `localStorage` van de browser bewaard.

Als je de browserdata wist, is de ranking ook weg.

Voor een echte online versie met accounts/database kan later een database worden toegevoegd.
