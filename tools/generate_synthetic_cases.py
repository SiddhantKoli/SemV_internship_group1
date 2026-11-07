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

context_topics = {
    "weather": [
        ("overview", ["weather", "section", "dashboard"], "This section combines air-weather forecasts with marine model context. A sample card might show 29 °C air temperature and 12 km/h wind."),
        ("air temperature", ["temperature", "air", "degrees"], "Air temperature is a forecast-model value for a nearby grid point; an example placeholder is 29 °C."),
        ("rainfall", ["rain", "rainfall", "precipitation"], "Rainfall totals summarize a forecast period; an example placeholder is 4 mm, not a gauge reading."),
        ("wind", ["wind", "gust", "speed"], "Wind speed and gusts describe modelled conditions at the forecast point; an example placeholder is 12 km/h."),
        ("forecast probability", ["chance", "probability", "forecast"], "A precipitation probability is the model's chance of measurable rain for the stated period; an example placeholder is 40%."),
        ("forecast point", ["point", "location", "grid", "place"], "A forecast point is a model grid location used to summarize nearby conditions; it is not a street-level sensor."),
        ("marine conditions", ["wave", "sea", "marine", "swell"], "Wave height and sea-surface temperature are marine-model outputs from a sea grid cell, not buoy observations or navigation advice."),
        ("forecast versus warning", ["warning", "official", "alert", "difference"], "A forecast describes modelled conditions. An official warning must come from an authorized agency such as IMD or NDMA SACHET."),
    ],
    "disaster": [
        ("overview", ["disaster", "alerts", "section"], "This section helps review official alert-feed status and preparedness references; a sample card is only a layout illustration."),
        ("alert card", ["alert", "card", "notice"], "An alert card should identify the issuing authority, affected places, validity period, and official instructions. This sample is not an issued alert."),
        ("alert status", ["status", "watch", "warning", "severity"], "A status label describes an issuer's alert category only when it comes from the verified notice; this sample label is not current status."),
        ("feed timestamp", ["time", "updated", "timestamp", "feed"], "The feed timestamp shows when the source feed was updated; an old timestamp cannot confirm current conditions."),
        ("location match", ["location", "area", "village", "match"], "A place-name match in a limited feed is only a search result. No match does not prove that no local warning exists."),
        ("flood depth", ["flood", "depth", "water"], "This panel cannot measure street-level flood depth; a flood map or verified field report would be required."),
        ("high tide context", ["tide", "coastal", "surge"], "A tide or coastal-hazard panel can summarize a dated forecast or notice; this sample does not predict inundation or safety."),
        ("forecast versus warning", ["forecast", "warning", "official", "difference"], "Weather forecasts are model guidance. Only the relevant government authority issues an official warning."),
    ],
    "fisheries": [
        ("overview", ["fisheries", "fishing", "section"], "This section explains district fisheries references and points to official INCOIS advisory products; it does not promise a catch."),
        ("PFZ meaning", ["pfz", "potential", "zone", "map"], "A Potential Fishing Zone advisory identifies conditions associated with possible fish aggregation; it is not a catch guarantee or safety clearance."),
        ("validity date", ["validity", "date", "issued", "advisory"], "The issue and validity dates tell you how recently an official advisory applies; check the dates on the INCOIS product itself."),
        ("landing centre", ["landing", "centre", "harbour", "port"], "A landing-centre entry names a place where fish are landed; a district directory does not report today's catch there."),
        ("species profile", ["species", "fish", "variety"], "A species list is background information, not a live stock estimate, seasonal guarantee, or catch forecast."),
        ("season guidance", ["season", "monsoon", "closure", "ban"], "Season guidance should be checked against the current official fishing-ban notice; this sample is not a regulation."),
        ("marine safety", ["safety", "weather", "sea", "conditions"], "Fishing decisions require current official marine and weather advisories; this sample is not vessel-safety clearance."),
        ("advisory map", ["map", "marker", "coordinates", "location"], "An advisory map marker must come from the dated official product; this example contains no real coordinates."),
    ],
    "markets": [
        ("overview", ["market", "markets", "section"], "This section distinguishes historical price references from current harbour auction data; a sample row is only for explaining the layout."),
        ("price row", ["price", "rate", "row", "quote"], "A useful market-price row includes fish species, harbour, date, unit, and whether the price is an auction estimate or historical average."),
        ("sample range", ["range", "low", "high", "auction"], "A displayed low-to-high range summarizes a stated sample period and market; this placeholder is not a real quote."),
        ("unit", ["unit", "kilogram", "tonne", "convert"], "Price units matter: rupees per tonne and rupees per kilogram are different scales and should be labelled explicitly."),
        ("harbour and date", ["harbour", "market", "date", "where"], "A price is meaningful only with its market or harbour and observation date; a district average is not a village retail price."),
        ("historical versus current", ["historical", "current", "today", "difference"], "A historical annual average describes its published period; it is not today's local retail or auction rate."),
        ("species label", ["species", "fish", "name"], "The species label identifies the fish category used by the source; similar local names can refer to different categories."),
        ("coverage", ["coverage", "sample", "data", "available"], "Market-source coverage may include only selected harbours and dates; a missing price is not a zero price."),
    ],
    "environment": [
        ("overview", ["environment", "coastal", "section"], "This section combines dated environmental studies with modelled nearshore conditions. Historical records and marine forecasts describe different evidence."),
        ("water quality", ["water", "quality", "pollution", "wqi"], "A water-quality study applies only to its sampled places and dates; a sample index is not a current beach-safety result."),
        ("wave height", ["wave", "height", "marine"], "Wave height is an Open-Meteo marine-model estimate for a sea grid point, not a buoy reading or navigation warning."),
        ("sea temperature", ["sea", "temperature", "sst"], "Sea-surface temperature is a model or satellite-derived surface value, not drinking-water temperature or a pollution test."),
        ("shoreline change", ["shoreline", "erosion", "coast", "change"], "A shoreline-change rate must retain the study period and mapped coast segment; it cannot be generalized to every village."),
        ("mangrove record", ["mangrove", "forest", "cover"], "A mangrove assessment reports mapped cover for its stated year and area; it is not a live condition report for this locality."),
        ("chlorophyll indicator", ["chlorophyll", "bloom", "ocean colour"], "Chlorophyll is a satellite ocean-colour indicator; it is not a laboratory pollution result or confirmation of a harmful bloom at a beach."),
        ("study date", ["date", "period", "study", "sample"], "The study date and sampling area determine what a historical environmental result can support; it does not describe today's conditions."),
    ],
}
context_question_patterns = [
    "What is this here for {place}?", "What am I looking at in {place}?",
    "What does this panel show for {place}?", "Can you explain this section for {place}?",
    "What does this chart mean for {place}?", "How do I read this card near {place}?",
    "Explain the display for {place}.", "What is being shown here around {place}?",
    "What is this section for in {place}?", "What should I understand from this panel for {place}?",
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

context_cases = []
section_titles = {"weather": "Weather", "disaster": "Official alerts", "fisheries": "Fisheries", "markets": "Fish markets", "environment": "Environment"}
for agent, topics in context_topics.items():
    for topic, topic_keywords, explanation in topics:
        for place_index, pattern in enumerate(context_question_patterns):
            place = PLACES[place_index]
            case_number = len(context_cases) + 1
            question = pattern.format(place=place)
            tokens = {w.casefold() for w in question.replace("?", " ").replace(",", " ").split() if len(w) > 2}
            tokens.update({agent, section_titles[agent].casefold(), topic.casefold()})
            tokens.update(word.casefold() for word in topic_keywords)
            context_cases.append({
                "case_id": f"{agent.upper()}-CONTEXT-{case_number:03d}",
                "agent": agent,
                "case_type": "section_explainer",
                "topic": topic,
                "topic_keywords": topic_keywords,
                "place": place,
                "place_scope": "Any Palghar district locality; place name is display context only",
                "question": question,
                "keywords": sorted(tokens),
                "answer": (
                    f"SYNTHETIC EXAMPLE · For the {{place}} {section_titles[agent]} section: {explanation} "
                    "The locality name only selects display context; this example is not a measurement, report, price, advisory, or warning from that place."
                ),
                "provenance": "synthetic",
                "citation": "SYNTHETIC",
                "source_title": "AquaPulse generated section explainer",
                "source_note": "Synthetic interface explanation. Any sample value is invented; location is a display label, not evidence about local conditions.",
            })

assert len(cases) == 500, len(cases)
assert len(context_cases) == 400, len(context_cases)
cases.extend(context_cases)
assert len(cases) == 900, len(cases)
OUT.write_text(json.dumps({
    "metadata": {
        "kind": "synthetic-demo-only", "case_count": len(cases),
        "explicit_demo_case_count": 500,
        "section_explainer_case_count": 400,
        "label": "SYNTHETIC EXAMPLES — NOT REAL PALGHAR CONDITIONS",
        "description": "900 generated case records: 500 explicit demo scenarios plus 400 natural-language section explainers, across Weather, Disaster, Fisheries, Fish markets, and Environment. Every case has provenance=synthetic and citation=SYNTHETIC. Section explainers accept any selected Palghar locality as display context only; they do not make locality-specific claims.",
        "useInRag": False,
    },
    "cases": cases,
}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Wrote {len(cases)} synthetic cases ({len(context_cases)} section explainers) to {OUT}")
print(json.dumps(case_no, sort_keys=True))

