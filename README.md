# AquaPulse · Palghar Coastal Information

AquaPulse is a local coastal information assistant for Palghar district, Maharashtra. It provides grounded, domain-specific guidance across Weather, Disaster Preparedness, Marine Fisheries, Environment, Fish Markets, Past Records, and General Coastal Q&A.

## How to Run

### Windows (Automated Launcher)
Install Miniforge and Ollama, pull the models, and launch:
```powershell
conda env create -f environment.yml
ollama pull llama3.2:3b
ollama pull mxbai-embed-large
./run.ps1
```
Then open http://127.0.0.1:8767. If that port is unavailable, `run.ps1` automatically tries fallback ports and prints the URL to open.

### Cross-Platform (Linux / macOS / Windows without Miniforge)
AquaPulse can run on any platform with Python 3.10+ and Ollama:
```bash
# 1. Start Ollama and ensure required models are pulled:
ollama pull llama3.2:3b
ollama pull mxbai-embed-large

# 2. Set up Python virtual environment and dependencies:
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install "fastapi>=0.110.0" "uvicorn[standard]>=0.28.0"

# 3. Start the server directly:
python backend.py
```
By default, the server listens at `http://127.0.0.1:8765`. Configure the port or host using `PORT=8766 HOST=0.0.0.0 python backend.py`.

---

## Command-Line Interface (`cli.py`)

AquaPulse includes a command-line interface that reuses the exact same grounded processing pipeline as the web application.

```bash
# Ask a specific agent with a selected Palghar locality
python cli.py --agent environment --location Boisar "What is this here?"
python cli.py --agent disaster "What is the official control room contact for Palghar?"

# Query via piped stdin
echo "What is the coastline length of Palghar district?" | python cli.py --agent fisheries

# Output machine-readable JSON (answer, sources, agent, retrieved_chunks, latency)
python cli.py --agent fish-markets --json "What was the boatside price of pomfret in 2022-23?"

# Interactive REPL mode (switch agent with /agent; change locality with /location)
python cli.py --interactive --agent ask --location Palghar

# Specify custom top-k and verbose diagnostics
python cli.py --agent ask --top-k 5 --verbose "Explain the Konkan Disaster Mitigation Project"
```

### CLI Arguments
- `question`: Positional argument. When omitted, the CLI reads from stdin (with non-blocking detection to avoid hanging in non-interactive environments).
- `--agent {weather, disaster, fisheries, fish-markets, environment, ask, records, sources}`: Selects specialized agent domain.
- `--location <Palghar locality>`: Adds selected location as context for synthetic section explainers; it is not a local observation.
- `--json`: Outputs machine-readable JSON format.
- `--interactive`: Enters interactive terminal conversation.
- `--top-k <int>`: Sets the number of retrieved RAG chunks (default: 4).
- `--model <name>`: Overrides chat model (default: `llama3.2:3b`).
- `--provider {local, gemini}`: Sets provider (default: `local`).
- `--verbose`: Displays latency and chunk metrics.

---

## HTTP Chat API (`/api/chat`)

The backend exposes an HTTP REST endpoint used by the web client and external automated evaluators.

### Route: `POST /api/chat`
**Headers:** `Content-Type: application/json`

### Request Body Schema
```json
{
  "message": "What is the official disaster control room contact for Palghar?",
  "agent": "disaster",
  "location": {
    "name": "Palghar",
    "district": "Palghar"
  },
  "history": [
    {"role": "user", "content": "Previous question"},
    {"role": "assistant", "content": "Previous answer"}
  ]
}
```

### Response Body Schema
```json
{
  "answer": "The official Palghar District Disaster Management control room contact is 02525-297474 and toll-free 1077. In an immediate emergency, call 112.",
  "sources": [
    {
      "id": "palghar-district",
      "title": "Palghar district disaster information and official contacts",
      "source": "District Disaster Management, District Palghar, Government of Maharashtra",
      "url": "https://palghar.gov.in/en/disaster-management/",
      "citation": "S1"
    }
  ],
  "weather": {
    "available": false
  },
  "alerts": {
    "available": true,
    "feed_name": "NDMA SACHET · Maharashtra CAP feed",
    "items": []
  },
  "model": "llama3.2:3b",
  "provider": "local",
  "retrieved_chunks": 4,
  "agent": "disaster",
  "latency": 0.421
}
```

### `curl` Example
```bash
curl -X POST http://127.0.0.1:8765/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What was the boatside price of bombil in 2022-23?",
    "agent": "fish-markets"
  }'
```

---

## Guardrails and Grounding Architecture

AquaPulse is hardened against prompt injection, hallucinations, jailbreaks, and false premises:
1. **Strict Context Grounding:** Answers are generated strictly from verified passages in `knowledge/` and live APIs (Open-Meteo, NDMA SACHET). If retrieval is weak or empty, the system falls back to `"I don't have that in my sources."` and recommends official authorities.
2. **Numeric Grounding Post-Check:** Model outputs are scanned to verify all numerical figures (prices, dates, rainfall depths) against retrieved passages or live data to prevent confabulation by small 3B models.
3. **Injection & Jailbreak Pre-Filter:** Code-level filtering catches instruction overrides (`ignore previous instructions`), roleplay (`DAN`), and prompt exfiltration (`show your system prompt`).
4. **Domain Scope Enforcement:** Automatically classifies and redirects out-of-scope requests (programming, politics, jokes) and cross-agent confusion (e.g. asking fish markets for flood evacuation).
5. **False Premise Correction:** Identifies fabricated disaster assertions (such as a fictional "2019 Palghar tsunami") and corrects the premise.
6. **Anti-Sycophancy:** Firmly sticks to verified official data even when a user asserts contrary claims without evidence.
7. **Input Bounding:** Gracefully truncates inputs exceeding 2,000 characters with a notice and sanitizes control characters.

---

## What It Connects
- **Chat Model & Retrieval:** Local Ollama running `llama3.2:3b` with `mxbai-embed-large` embeddings for semantic search over `knowledge/`.
- **Weather Context:** Open-Meteo live API provides temperature, precipitation, humidity, and wind guidance.
- **Environment:** Searchable notes cite the MPCB 2015–2016 Dahanu/Tarapur sampling report, NCCR 1990–2016 shoreline assessment, and 2023 mangrove assessment. The Environment agent also fetches wave height, wave period, and sea-surface temperature from the no-key Open-Meteo Marine API. These are model estimates at a sea grid point, not buoy readings, pollution tests, beach safety results, or official warnings. The original government PDFs are linked from each note, not bundled into the repo.
- **Synthetic example cases:** `assets/synthetic-answers.json` contains 900 generated cases: 500 explicit examples plus 400 section explainers across Weather, Disaster, Fisheries, Fish Markets, and Environment. Ask a section assistant “What is this here?” or ask what a specific panel/chart means. The citation is labeled `SYNTHETIC`. Any selected locality from the Palghar village directory is display context only; no locality-specific observation is claimed. These cases remain outside factual RAG.
- **Official Warning Check:** Live RSS integration with NDMA SACHET Maharashtra and All-India CAP feeds.
- **Past Records Archive:** Source-linked archive in `historical-records.json` of IMD rainfall observations and district notices.
- **Village Directory:** 1,009 listed Palghar revenue villages in `palghar-villages.json`.

Environment example questions:
- `What did the MPCB study report about Tarapur creek water quality?`
- `Which Palghar beaches were named in the shoreline assessment?`
- `What is the modelled wave height near Palghar?`
- `Show a synthetic demo temperature case for Boisar.`
