# AquaPulse · Palghar Coastal Information

A local coastal information tool for Palghar district. Its landing page introduces the AquaPulse services, with dedicated Weather, Disaster, Fisheries, and Fish Markets sections, plus a sourced local assistant, past records, and reference sources.

## Run

On Windows, install Miniforge and Ollama, create the Python environment from `environment.yml`, then download the Ollama models and run the launcher from the project folder:

```powershell
conda env create -f environment.yml
ollama pull llama3.2:3b
ollama pull mxbai-embed-large
./run.ps1
```

Then open http://127.0.0.1:8765. The script expects the Miniforge environment at `%USERPROFILE%\miniforge3\envs\delta-watch` and Ollama at its standard Windows installation path. It starts the local Ollama service when needed and launches the dashboard. If port 8765 is already occupied, run `$env:AQUAPULSE_PORT='8766'; ./run.ps1` and open http://127.0.0.1:8766. The local chat model is `llama3.2:3b`; `mxbai-embed-large` provides semantic search for the RAG library.

## What it connects

- **Chat model and retrieval:** By default, Ollama runs the chat locally. Text in `knowledge/` is embedded locally and retrieved for each question. As an optional alternative, set a rotated Gemini key in the Windows `GEMINI_API_KEY` user environment variable; `run.ps1` then uses Gemini for chat through the Python backend. The question, recent chat history, retrieved reference passages, forecast context, and alert status are sent to Google's API in that mode. RAG embeddings remain local in Ollama. The key is never placed in browser code or project files.
- **Weather context:** Open-Meteo supplies current conditions and a three-day outlook with hourly fallback data; its Marine API supplies modelled wave and sea-temperature context when available. The free endpoint needs no API key for non-commercial use; credit the provider and follow its terms. These forecasts are not official warnings or navigation advice.
- **Nearby weather:** Location defaults to Palghar. Open the compact location control in the header to select a town or village, or choose device location. Device location is optional; if chosen, the browser sends coordinates to Open-Meteo for a nearby forecast. The site keeps those coordinates in page memory only and strips them from the chat request.
- **Section navigation:** Home is the landing page. Weather, Disaster, Fisheries, and Fish Markets have separate interfaces. Ask, Past records, and Sources remain separate sections. Only the selected section is shown; longer content scrolls inside that section.
- **Fisheries:** The section shows Palghar district fisheries figures and named landing centres from the District Strategic Plan, with direct links to current Maharashtra PFZ text and the INCOIS map. PFZ locations are potential fish-aggregation guidance, not catch promises or vessel-safety clearance. The district profile is historical, not live catch data.
- **Fish markets:** The section presents selected historical 2022-23 boatside average prices from a combined Thane/Palghar district group, and links to CMFRI FishWatch for sampled daily landings and auction ranges at selected harbours. Historical figures are not today's price or Palghar-only quotes; FishWatch coverage may not include Palghar. Local Q&A uses the shared local Llama model with agent-specific retrieval rules and must not invent current prices.
- **Locality search:** the picker searches a bundled snapshot of the Maharashtra Common Village Master (Palghar district LGD code 665): 1,009 listed revenue villages across eight talukas. Open-Meteo/GeoNames is used only to match forecast coordinates when available. A village name is not a village-specific hazard assessment; padas/hamlets may not all have independent directory entries or forecast points.
- **Official warning check:** the dashboard checks the NDMA SACHET CAP feeds, preferring Maharashtra when fresh and falling back to the actively updated All India feed. It reports the feed timestamp and shows entries whose text names Palghar or nearby talukas. Since the national feed is limited to its latest 100 items, no matching entry is not proof that no local warning exists; check the SACHET location view and IMD directly.
- **Past records:** the Past records panel searches a small, source-linked archive of IMD station rainfall observations and Palghar District notices. This is not a complete incident archive; station rainfall is not village-level flood evidence or a prediction.

## Reference library

The current RAG library is in `knowledge/`. It includes Palghar district management references, coastal hazards, forecast/alert guidance, fisheries advisories, a Palghar district fisheries profile, and historical combined Thane/Palghar fish-price data. Each file carries its source URL and check date. Review these sources periodically and refresh the document index after editing them.

## What the assistant can and cannot tell you

It can explain documented Palghar hazards and preparedness material, summarize current and forecast weather values, and provide source links. It does not calculate a validated flood map or a location-specific disaster probability. Weather-model output is not an official warning. In an emergency, follow official instructions and call 112.

## Data and attribution

- Weather forecast: [Open-Meteo](https://open-meteo.com/en/docs), with attribution shown in the dashboard. Its free service is for non-commercial use and is subject to usage limits and terms.
- Official alerts: [NDMA SACHET](https://sachet.ndma.gov.in/), [NDMA CAP RSS feeds](https://sachet.ndma.gov.in/CapFeed), [IMD Mausam](https://mausam.imd.gov.in/).
- Locality names and taluka codes: [Maharashtra Common Village Master](https://mahavillages.mahabhumi.gov.in/), data maintained by the Office of Settlement Commissioner and Director of Land Records. Bundled snapshot is `palghar-villages.json`; refresh it from the official directory when its LGD list changes.
- District references: the linked District Palghar and Maharashtra State Disaster Management Authority pages in `knowledge/`.

## Optional Gemini chat

1. Revoke any Gemini key pasted into chat or otherwise shared, then create a replacement in Google AI Studio.
2. Save the replacement as a Windows **User** environment variable named `GEMINI_API_KEY`. Do not put it in `app.js`, `index.html`, or this project.
3. Close and restart the app with `./run.ps1`. If `CHAT_PROVIDER` is unset and the key exists, the script selects Gemini chat (`gemini-3.8-flash`). Remove `GEMINI_API_KEY` or set `CHAT_PROVIDER=local` to use the local chat model again.

The dashboard identifies Gemini as a cloud model because questions and retrieved context leave the computer when Gemini is selected.

## Repository assets

This repository contains the application source, reference text, Palghar locality directory, and historical records used by the website. Local-only tools, installers, environment-specific caches, server logs, and dated backups are not included. No API key is stored in this repository.
