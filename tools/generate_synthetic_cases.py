from __future__ import annotations
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "synthetic-answers.json"
RNG = random.Random(20261106)
PLACES = ["Palghar", "Boisar", "Dahanu", "Satpati", "Chinchani", "Bordi", "Kelva", "Manor", "Vasai", "Virar"]

weather_topics = [
    ("temperature", "temperature", lambda: f"{RNG.randint(24, 35)} °C"),
    ("humidity", "relative humidity", lambda: f"{RNG.randint(48, 91)}%"),
    ("wind speed", "wind", lambda: f"{RNG.randint(5, 32)} km/h"),
    ("wind gust", "gust", lambda: f"{RNG.randint(12, 46)} km/h"),
    ("rainfall", "rain", lambda: f"{RNG.randint(0, 34)} mm"),
    ("rain chance", "precipitation probability", lambda: f"{RNG.randint(5, 95)}%"),
    ("maximum temperature", "daily maximum temperature", lambda: f"{RNG.randint(28, 39)} °C"),
    ("minimum temperature", "daily minimum temperature", lambda: f"{RNG.randint(18, 28)} °C"),
    ("cloud cover", "cloud cover", lambda: f"{RNG.randint(0, 100)}%"),
    ("three-day forecast", "fictional three-day outlook", lambda: f"day 1 rain {RNG.randint(0, 12)} mm, day 2 rain {RNG.randint(0, 20)} mm, day 3 rain {RNG.randint(0, 15)} mm"),
]
disaster_topics = [
    ("rain watch", "rainfall watch"), ("coastal flood sample", "coastal flood illustration"),
    ("high tide sample", "high-tide illustration"), ("cyclone sample", "cyclone-card example"),
    ("heat advisory sample", "heat-advisory illustration"), ("strong wind sample", "strong-wind illustration"),
    ("swell sample", "swell illustration"), ("alert status sample", "fictional alert-status example"),
    ("flood depth limitation", "no measured flood depth in this fictional case"), ("evacuation notice sample", "fictional notice layout only"),
]
fishing_topics = [
    ("potential fishing zone", "fictional PFZ marker"), ("season guidance", "sample seasonal guidance card"),
    ("monsoon closure", "illustrative closure reminder"), ("mackerel availability", "fictional mackerel note"),
    ("pomfret availability", "fictional pomfret note"), ("prawn availability", "fictional prawn note"),
    ("sea conditions", "illustrative marine-condition note"), ("landing centre update", "fictional landing-centre status"),
    ("fishing safety", "sample safety checklist card"), ("species guidance", "fictional species information card"),
]
market_species = ["pomfret", "black pomfret", "prawns", "mackerel", "bombil", "seer fish", "crab", "sardine", "tarli", "surmai"]
env_topics = [
    ("water quality index", "fictional water-quality index"), ("turbidity", "fictional turbidity reading"),
    ("dissolved oxygen", "fictional dissolved-oxygen reading"), ("shoreline erosion", "fictional shoreline-change rate"),
    ("mangrove cover", "fictional mangrove-area value"), ("marine litter", "fictional litter observation"),
    ("chlorophyll", "fictional chlorophyll indicator"), ("sea temperature", "fictional sea-surface temperature"),
    ("wave height", "fictional wave-height estimate"), ("pollution report", "fictional pollution-report entry"),
]

cases = []
def add(agent: str, case_no: int, place: str, topic: str, question: str, answer: str, extra_keywords: list[str] | None = None):
    tokens = {w.casefold() for w in question.replace("?", " ").replace(",", " ").split() if len(w) > 2}
    tokens.update({place.casefold(), topic.casefold(), "synthetic", "demo"})
    if extra_keywords:
        tokens.update(x.casefold() for x in extra_keywords)
    cases.append({
        "case_id": f"{agent.upper()}-{case_no:03d}", "agent": agent,
        "question": question, "keywords": sorted(tokens),
        "answer": "SYNTHETIC DEMO · FICTIONAL CASE — " + answer,
        "provenance": "synthetic", "citation": "SYNTHETIC",
        "source_title": "AquaPulse generated test case",
        "source_note": "Invented for software testing. Not an observation, official warning, forecast, advisory, price quote, or real location report.",
    })

case_no = {agent: 0 for agent in ["weather", "disaster", "fisheries", "markets", "environment"]}
for place in PLACES:
    for topic, label, value_fn in weather_topics:
        case_no["weather"] += 1
        value = value_fn()
        q = f"Show a synthetic demo {topic} case for {place}."
        a = f"The generated test value for {label} in the fictional {place} scenario is {value}. It has no real observation time and must not be used as a forecast or safety decision."
        add("weather", case_no["weather"], place, topic, q, a, ["weather", "forecast"])
    for topic, label in disaster_topics:
        case_no["disaster"] += 1
        q = f"Show a synthetic demo {topic} case for {place}."
        a = f"This is a fictional {label} card associated with the {place} name for interface testing. No agency issued it; it is not a real warning, flood estimate, or evacuation instruction. Check SACHET, IMD, and district notices for actual alerts."
        add("disaster", case_no["disaster"], place, topic, q, a, ["disaster", "warning", "alert"])
    for topic, label in fishing_topics:
        case_no["fisheries"] += 1
        q = f"Show a synthetic demo {topic} case for {place}."
        a = f"This fictional fisheries example for the {place} name is a {label}. It is not an INCOIS advisory, verified fishing ground, catch prediction, regulation notice, or vessel-safety clearance."
        add("fisheries", case_no["fisheries"], place, topic, q, a, ["fish", "fishing"])
    for species in market_species:
        case_no["markets"] += 1
        low = RNG.randrange(90, 601, 10)
        high = low + RNG.randrange(40, 241, 10)
        q = f"Show a synthetic demo {species} price case for {place}."
        a = f"The generated fictional {species} example associated with {place} uses ₹{low}–₹{high} per kg on a made-up sample date. It is not a live, historical, retail, or local auction quote."
        add("markets", case_no["markets"], place, f"{species} price", q, a, [species, "price", "market", "rate"])
    for topic, label in env_topics:
        case_no["environment"] += 1
        value = (round(RNG.uniform(0.2, 4.8), 1) if topic in {"turbidity", "dissolved oxygen", "chlorophyll", "sea temperature", "wave height"}
                 else round(RNG.uniform(0.1, 2.8), 1) if topic == "shoreline erosion"
                 else round(RNG.uniform(3.0, 35.0), 1) if topic == "mangrove cover"
                 else RNG.randint(20, 95))
        units = {"turbidity": "NTU", "dissolved oxygen": "mg/L", "chlorophyll": "mg/m³", "sea temperature": "°C", "wave height": "m", "shoreline erosion": "m/year", "mangrove cover": "km²", "water quality index": "index points"}
        unit = units.get(topic, "example units")
        q = f"Show a synthetic demo {topic} case for {place}."
        a = f"The invented {label} associated with {place} is {value} {unit}. It is not a field sample, mapped measurement, present-day condition, pollution confirmation, or safety assessment."
        add("environment", case_no["environment"], place, topic, q, a, ["coastal environment", "environment"])

assert len(cases) == 500, len(cases)
OUT.write_text(json.dumps({
    "metadata": {
        "kind": "synthetic-demo-only", "case_count": len(cases),
        "label": "FICTIONAL TEST DATA — NOT REAL PALGHAR CONDITIONS",
        "description": "500 generated case records across Weather, Disaster, Fisheries, Fish markets, and Environment. Every case has provenance=synthetic and citation=SYNTHETIC. These examples are for interface and retrieval testing only.",
        "useInRag": False,
    },
    "cases": cases,
}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Wrote {len(cases)} explicitly synthetic cases to {OUT}")
print(json.dumps(case_no, sort_keys=True))

