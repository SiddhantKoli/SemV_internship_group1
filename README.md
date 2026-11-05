# Palghar Disaster Desk

A local disaster information assistant for Palghar district. Ask questions in plain language. The app retrieves relevant passages from a small local library of official district and state references, checks current Open-Meteo forecast data, and asks the installed local Llama model to produce a concise, cited response.

## Run

On Windows, install Miniforge and Ollama, create the Python environment from `environment.yml`, then download the Ollama models and run the launcher from the project folder:

```powershell
conda env create -f environment.yml
ollama pull llama3.2:3b
ollama pull mxbai-embed-large
./run.ps1
```

Then open http://127.0.0.1:8765. The script expects the Miniforge environment at `%USERPROFILE%\miniforge3\envs\delta-watch` and Ollama at its standard Windows installation path. It starts the local Ollama service when needed and launches the dashboard. The local chat model is `llama3.2:3b`; `mxbai-embed-large` provides semantic search for the RAG library.

## What it connects

- **Chat model and retrieval:** By default, Ollama runs the chat locally. Text in `knowledge/` is embedded locally and retrieved for each question. As an optional alternative, set a rotated Gemini key in the Windows `GEMINI_API_KEY` user environment variable; `run.ps1` then uses Gemini for chat through the Python backend. The question, recent chat history, retrieved reference passages, forecast context, and alert status are sent to Google's API in that mode. RAG embeddings remain local in Ollama. The key is never placed in browser code or project files.
- **Weather context:** Open-Meteo supplies current conditions and a seven-day forecast for Palghar. The free endpoint needs no API key for non-commercial use; credit the provider and follow its terms.
- **Nearby weather:** Location defaults to Palghar. Open the compact location control in the header to select a town or village, or choose device location. Device location is optional; if chosen, the browser sends coordinates to Open-Meteo for a nearby forecast. The site keeps those coordinates in page memory only and strips them from the chat request.
- **Section navigation:** the top navigation switches between Ask, Weather, Official alerts, Past records, and Sources. Only the selected section is shown; longer content scrolls inside that section.
- **Locality search:** the picker searches a bundled snapshot of the Maharashtra Common Village Master (Palghar district LGD code 665): 1,009 listed revenue villages across eight talukas. Open-Meteo/GeoNames is used only to match forecast coordinates when available. A village name is not a village-specific hazard assessment; padas/hamlets may not all have independent directory entries or forecast points.
- **Official warning check:** the dashboard checks the NDMA SACHET CAP feeds, preferring Maharashtra when fresh and falling back to the actively updated All India feed. It reports the feed timestamp and shows entries whose text names Palghar or nearby talukas. Since the national feed is limited to its latest 100 items, no matching entry is not proof that no local warning exists; check the SACHET location view and IMD directly.
- **Past records:** the Past records panel searches a small, source-linked archive of IMD station rainfall observations and Palghar District notices. This is not a complete incident archive; station rainfall is not village-level flood evidence or a prediction.

## Reference library

The current RAG library is in `knowledge/`. It includes Palghar district management references and contacts, Maharashtra coastal hazard information, and guidance on distinguishing weather forecasts from official alerts. Each file carries its source URL and check date. Review these sources periodically and refresh the document index after editing them.

## What the assistant can and cannot tell you

It can explain documented Palghar hazards and preparedness material, summarize current and forecast weather values, and provide source links. It does not calculate a flood map or a location-specific disaster probability. Weather-model output is not an official warning. The current Palghar HEC-RAS project is a scaffold without a runnable plan; the old terrain visualization and Prithvi image classifier are not part of this new dashboard. In an emergency, follow official instructions and call 112.

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

This repository contains the application source, reference text, locality directory, sample Prithvi inputs/configuration, and HEC-RAS pilot project with terrain data. The local Prithvi checkpoint (`Prithvi-EO-V2-300M-TL-Sen1Floods11.pt`, about 1.2 GB) is excluded because GitHub blocks individual files over 100 MB. The HEC-RAS installer is third-party software and is also excluded. Python/Hugging Face caches, server logs, and dated backup copies are excluded. Obtain the model checkpoint and HEC-RAS installer from their official providers if setting up another machine. No API key is stored in this repository.
