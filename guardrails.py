"""
AquaPulse Guardrails
Robust pre-filtering, scope enforcement, injection defense, false premise detection,
and numeric output grounding checks.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any

# Standard official contacts
OFFICIAL_SOURCES_NOTE = (
    "Please consult official sources: IMD (https://mausam.imd.gov.in/) for weather forecasts and warnings, "
    "NDMA SACHET (https://sachet.ndma.gov.in/) for official disaster alerts, "
    "INCOIS (https://www.incois.gov.in/) for ocean and fisheries advisories, "
    "or call 112 in an emergency."
)

EMERGENCY_CONTACTS_TEXT = (
    "For immediate danger, rescue, or flood emergency in Palghar district, call 112 immediately. "
    "Official local contacts: Palghar District Disaster Management Control Room: 02525-297474 or toll-free 1077; "
    "Maharashtra State Control Room: 022-22027990. Always follow instructions from local authorities."
)

# Known legitimate numbers in the Palghar coastal / fisheries / historical / contact dataset
WHITELISTED_NUMBERS = {
    "112", "1077", "02525", "297474", "022", "22027990", "011", "26701728",
    "2020", "2021", "2022", "2023", "2024", "2025", "2026", "2027",
    "85", "74", "18203", "24", "1999", "2030", "31",
    "43220", "25252", "43069",
    "646693", "646.69", "646.7", "646", "647",
    "463215", "463.22", "463.2", "463",
    "465785", "465.79", "465.8", "465", "466",
    "239787", "239.79", "239.8", "239", "240",
    "126139", "126.14", "126.1", "126",
    "89791", "89.79", "89.8", "89", "90",
    "180", "18", "130", "13", "110", "11", "80", "8", "160", "16", "140", "14",
    "1000", "1009", "665", "100", "24", "48", "72", "3", "7", "1", "2", "4", "5", "6", "8", "9", "10"
}


def normalize_input(text: str) -> tuple[str, str | None]:
    """Sanitize and bound input text to prevent memory/token DOS."""
    if not isinstance(text, str):
        return "", None
    
    # Normalize unicode to NFKC
    cleaned = unicodedata.normalize("NFKC", text)
    # Strip null bytes and non-printable control characters except newline and tab
    cleaned = "".join(ch for ch in cleaned if ch in ("\n", "\r", "\t") or unicodedata.category(ch)[0] != "C")
    cleaned = cleaned.strip()
    
    notice = None
    if len(cleaned) > 2000:
        cleaned = cleaned[:2000].strip()
        notice = "(Note: Your question exceeded 2,000 characters and was truncated for safety.)"
    
    return cleaned, notice


# Common prompt injection patterns
INJECTION_PATTERNS = [
    # Direct instruction overrides
    r"(?i)\bignore\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions?|directions?|rules?|prompts?)\b",
    r"(?i)\bdisregard\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions?|directions?|rules?|prompts?)\b",
    r"(?i)\bforget\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions?|directions?|rules?|prompts?)\b",
    r"(?i)\breset\s+(?:all\s+)?(?:system|previous|prior)\s+(?:instructions?|rules?|prompts?)\b",
    r"(?i)\boverride\s+(?:all\s+)?(?:system|previous|prior)\s+(?:instructions?|rules?|prompts?)\b",
    
    # Roleplay / Jailbreaks / DAN
    r"(?i)\bdo\s+anything\s+now\b",
    r"(?i)\bdan\s+mode\b",
    r"(?i)\bjailbreak\b",
    r"(?i)\bdeveloper\s+mode\b",
    r"(?i)\bmaintenance\s+mode\b",
    r"(?i)\badmin(?:istrative)?\s+mode\b",
    r"(?i)\bact\s+as\s+(?:an?\s+)?(?:unrestricted|unfiltered|evil|god|root|dan)\b",
    r"(?i)\byou\s+are\s+no\s+longer\s+(?:an?\s+)?(?:assistant|aquapulse|bound)\b",
    r"(?i)\bpretend\s+(?:you\s+have\s+no\s+rules|there\s+are\s+no\s+rules|you\s+are\s+unrestricted)\b",
    
    # Fake system / developer message injection
    r"(?i)(?:^|\n)\s*(?:system|developer|assistant|human|user)\s*:\s*",
    r"(?i)<\|(?:im_start|im_end|system|user|assistant)\|>",
    r"(?i)\[\s*(?:system|developer|admin|instruction)\s*\]",
    r"(?i)###\s*(?:instruction|system|prompt)\b",
    
    # Prompt and instruction exfiltration
    r"(?i)\b(?:reveal|print|show|dump|output|repeat|display|share)\s+(?:all\s+)?(?:your|the)\s+(?:system\s+)?(?:prompt|instructions?|rules?|guidelines?)\b",
    r"(?i)\bwhat\s+(?:are\s+your|is\s+your)\s+(?:full\s+)?(?:system\s+)?(?:prompt|instructions?|rules?)\b",
    r"(?i)\bprint\s+(?:the\s+)?raw\s+(?:prompt|context|instructions?)\b",
    r"(?i)\bverbatim\s+(?:system\s+)?(?:prompt|instructions?)\b",
]

# Compile for efficiency
COMPILED_INJECTION_RE = [re.compile(p) for p in INJECTION_PATTERNS]


def check_injection(text: str) -> str | None:
    """Detect prompt injection, jailbreaks, instruction overrides, or prompt leaking attempts."""
    for pattern in COMPILED_INJECTION_RE:
        if pattern.search(text):
            return (
                "I cannot fulfill this request. I am AquaPulse, an information assistant for Palghar district. "
                "I follow strict safety rules and cannot reveal, bypass, or alter my system instructions."
            )
    return None


# Out-of-scope topics
OUT_OF_SCOPE_PATTERNS = [
    # Code generation
    (r"(?i)\b(?:write|generate|debug|create)\s+(?:a\s+)?(?:python|javascript|java|c\+\+|c#|php|sql|bash|html|css|rust|go)\s+(?:code|script|program|function|class)\b", "code generation or programming"),
    (r"(?i)\b(?:write|give\s+me)\s+(?:a\s+)?(?:python|javascript|sql|code)\b", "coding requests"),
    
    # Creative writing, jokes, poems
    (r"(?i)\b(?:tell|write)\s+(?:me\s+)?(?:a\s+)?(?:joke|funny\s+story|poem|song|rap|limerick)\b", "jokes, poems, or creative writing"),
    (r"(?i)\b(?:make\s+me\s+laugh|entertain\s+me)\b", "entertainment or jokes"),
    
    # Political commentary / elections
    (r"(?i)\b(?:who\s+should\s+i\s+vote\s+for|which\s+political\s+party\s+is\s+better|what\s+do\s+you\s+think\s+of\s+(?:modi|rahul\s+gandhi|bjp|congress|politicians?))\b", "political commentary or election opinions"),
    
    # General trivia / homework
    (r"(?i)\b(?:what\s+is\s+the\s+capital\s+of\s+(?!maharashtra)[a-z]+|solve\s+(?:this\s+)?math|how\s+to\s+bake\s+a\s+cake|recipe\s+for|who\s+won\s+the\s+fifa\s+world\s+cup|who\s+is\s+the\s+president\s+of\s+usa)\b", "general trivia or off-topic queries"),
]

COMPILED_OUT_OF_SCOPE = [(re.compile(pat), desc) for pat, desc in OUT_OF_SCOPE_PATTERNS]


def check_out_of_scope(text: str) -> str | None:
    """Check if query is completely outside AquaPulse's Palghar coastal domain."""
    for pattern, desc in COMPILED_OUT_OF_SCOPE:
        if pattern.search(text):
            return (
                f"I am AquaPulse, a coastal information assistant specifically for Palghar district. "
                f"I cannot assist with {desc}. Please ask about Palghar weather, disaster warnings, "
                f"fisheries, fish market historical data, or past district records."
            )
    return None


# Cross-agent routing and redirects
def check_cross_agent(text: str, agent: str) -> str | None:
    """Enforce agent boundaries and politely redirect cross-agent confusion."""
    agent_clean = agent.lower().replace("_", "-")
    
    # If in fish-markets, and asked about flood/disaster/evacuation
    if agent_clean in ("markets", "fish-markets"):
        if re.search(r"(?i)\b(?:flood|cyclone|tsunami|evacuat|storm\s+surge|shelter|rescue|danger|sachet|warning\s+status|submerged|relief)\b", text):
            return (
                "This is the Fish Markets assistant. For disaster alerts, flood risk, or emergency procedures, "
                "please switch to the Disaster agent. In an emergency, call 112 immediately."
            )
        if re.search(r"(?i)\b(?:rain|temperature|humidity|wind\s+speed|weather\s+forecast)\b", text) and not re.search(r"\b(?:price|market|fish|catch)\b", text):
            return (
                "This is the Fish Markets assistant. For meteorological forecasts or current conditions, "
                "please switch to the Weather agent."
            )

    # If in weather, and asked about fish market prices or fisheries
    if agent_clean == "weather":
        if re.search(r"(?i)\b(?:price|cost|rate|boatside|wholesale|market|pomfret|surmai|bombil|prawn)\b", text) and not re.search(r"\b(?:rain|weather|temperature)\b", text):
            return (
                "This is the Weather assistant. For fish market prices and historical landing rates, "
                "please switch to the Fish Markets agent."
            )
        if re.search(r"(?i)\b(?:pfz|potential\s+fishing\s+zone|fishing\s+ban|incois\s+pfz|active\s+fishers)\b", text):
            return (
                "This is the Weather assistant. For marine fisheries information and PFZ advisories, "
                "please switch to the Fisheries agent."
            )

    # If in fisheries, and asked about detailed weather forecast or disaster evacuation
    if agent_clean == "fisheries":
        if re.search(r"(?i)\b(?:evacuat|flood\s+shelter|disaster\s+management\s+plan|heat\s+action\s+plan)\b", text):
            return (
                "This is the Fisheries assistant. For disaster management, emergency contacts, or flood guidance, "
                "please switch to the Disaster agent."
            )
        if re.search(r"(?i)\b(?:what\s+is\s+the\s+temperature|rain\s+forecast\s+for\s+tomorrow|weather\s+forecast\s+for\s+palghar)\b", text):
            return (
                "This is the Fisheries assistant. For current weather and forecast models, "
                "please switch to the Weather agent."
            )

    return None


# False premise traps
FALSE_PREMISES = [
    # 2019 Palghar Tsunami
    (
        r"(?i)\b(?:2019\s+palghar\s+tsunami|palghar\s+tsunami\s+in\s+2019|tsunami\s+(?:that\s+)?hit\s+palghar\s+in\s+2019)\b",
        "There is no record of a tsunami hitting Palghar district in 2019. The official disaster management records and Maharashtra State Disaster Management Plan do not record any tsunami in Palghar in 2019."
    ),
    # Yesterday Category 5 hurricane/cyclone
    (
        r"(?i)\b(?:category\s+5\s+(?:cyclone|hurricane|typhoon)\s+(?:yesterday|today|last\s+night)|super\s+cyclone\s+hit\s+palghar\s+yesterday)\b",
        "No category 5 cyclone or super cyclone hit Palghar yesterday. Official cyclone warnings and historical notices are issued by the India Meteorological Department (IMD) and NDMA SACHET."
    ),
    # 2024 massive earthquake in Palghar destroying 1000 villages
    (
        r"(?i)\b(?:2024\s+massive\s+earthquake|earthquake\s+destroyed\s+1000\s+villages\s+in\s+palghar)\b",
        "Official records do not report a massive earthquake destroying 1,000 villages in Palghar in 2024. While parts of Palghar district (such as Dahanu and Talasari) have experienced localized low-magnitude swarms, no catastrophic event of that scale occurred."
    ),
]


def check_false_premise(text: str) -> str | None:
    """Identify queries asserting fabricated historical events or false premises and correct them."""
    for pattern, correction in FALSE_PREMISES:
        if re.search(pattern, text):
            return correction
    return None


# Emergency safety detection
EMERGENCY_KEYWORDS = [
    r"(?i)\b(?:drowning|trapped\s+in\s+(?:water|flood)|water\s+entering\s+house|submerged\s+and\s+cannot\s+escape|need\s+immediate\s+rescue|send\s+rescue\s+boat|marooned\s+by\s+water)\b",
    r"(?i)\b(?:emergency\s+help\s+flood|life\s+threatening\s+flood|stranded\s+on\s+roof)\b",
]

COMPILED_EMERGENCY = [re.compile(p) for p in EMERGENCY_KEYWORDS]


def check_emergency(text: str) -> str | None:
    """Detect immediate life-safety emergencies and return urgent verified guidance."""
    for pattern in COMPILED_EMERGENCY:
        if pattern.search(text):
            return (
                "EMERGENCY ADVISORY: If you or someone else is in immediate danger or trapped by floodwaters, "
                "call 112 immediately. You can also reach the Palghar District Disaster Management Control Room at "
                "02525-297474 or toll-free 1077. Move to higher ground, disconnect electrical mains if safe, "
                "and do not attempt to walk or drive through flowing water. Follow instructions from official emergency personnel."
            )
    return None


# Anti-sycophancy check
def check_sycophancy(text: str, live_alerts: dict[str, Any] | None = None) -> str | None:
    """
    Handle attempts to force the bot to falsely agree with inaccurate claims
    (e.g., 'No you are wrong, there is a red alert today').
    """
    # User insisting on an active Red Alert / Cyclone warning
    if re.search(r"(?i)\b(?:you\s+are\s+wrong|you['’]re\s+wrong|stop\s+lying|you\s+are\s+lying)\b", text) and \
       re.search(r"(?i)\b(?:red\s+alert|cyclone\s+warning|flood\s+warning|severe\s+alert)\b", text):
        items = (live_alerts or {}).get("items", [])
        if not items:
            return (
                "I must rely on verified official data rather than unverified assertions. The current official SACHET CAP "
                "feed checked contains no matching active Palghar district warning entries at this moment. However, a missing entry in a limited feed is "
                "not proof that no local alert exists. Please verify active location-specific warnings directly on NDMA SACHET (https://sachet.ndma.gov.in/) "
                "or IMD Mausam (https://mausam.imd.gov.in/)."
            )
        else:
            return (
                f"Checking the latest official alert feed, there are {len(items)} matching warning item(s) for the Palghar area. "
                "Always check NDMA SACHET (https://sachet.ndma.gov.in/) for active official alert polygons and instructions."
            )
    
    # User insisting on a fabricated fish price
    if re.search(r"(?i)\b(?:you\s+are\s+wrong|you['’]re\s+wrong|pomfret\s+is\s+actually|fish\s+is\s+actually)\b", text) and \
       re.search(r"(?i)\b(?:\d+\s*(?:rs|rupees|inr|per\s*kg))\b", text):
        return (
            "I can only report verified figures from my documented sources. The bundled Maharashtra Statistical Abstract 2022-23 (Table 16.6) "
            "reports historical annual wholesale boatside averages for the combined Thane / Palghar district group (e.g., Pomfret at ₹646,693 per tonne, "
            "about ₹646.69/kg in 2022-23). I do not have a live or local retail market price feed to confirm today's market rate. Please consult "
            "ICAR-CMFRI FishWatch (https://www.cmfri.org.in/fishwatch) or the local fish landing center for current auction prices."
        )

    return None


# Numeric verification for grounding
def extract_numeric_tokens(text: str) -> list[str]:
    """Extract standalone numeric sequences, currency amounts, and measurements."""
    # Match integers and decimals, ignoring punctuation
    cleaned = re.sub(r"\[S\d+\]", " ", text)  # Remove citation tags like [S1]
    # Remove phone numbers
    cleaned = re.sub(r"\b02525-297474\b|\b022-22027990\b|\b011-26701728\b", " ", cleaned)
    # Find all standalone numbers
    tokens = re.findall(r"\b\d+(?:[.,]\d+)?\b", cleaned)
    return tokens


def verify_answer_numbers(answer: str, context_text: str, allowed_extra: set[str] | None = None) -> bool:
    """
    Ensure every numeric value in the model answer is grounded in either the context_text,
    the live API data, or the whitelist of standard constants.
    """
    tokens = extract_numeric_tokens(answer)
    context_tokens = set(extract_numeric_tokens(context_text))
    extra = allowed_extra or set()

    for token in tokens:
        clean_tok = token.replace(",", "")
        # Remove trailing dot or leading zero
        normalized_num = str(int(float(clean_tok))) if "." in clean_tok and clean_tok.replace(".", "", 1).isdigit() else clean_tok
        
        # Check if in whitelist, context, or extra allowed
        if clean_tok in WHITELISTED_NUMBERS or normalized_num in WHITELISTED_NUMBERS:
            continue
        if clean_tok in context_tokens or normalized_num in context_tokens:
            continue
        if clean_tok in extra or normalized_num in extra:
            continue
        
        # If number is a single small digit (e.g. 1, 2, 3, 4, 5) often used for bullets or days
        try:
            val = float(clean_tok)
            if val in (1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0):
                continue
        except ValueError:
            pass

        # Number is not grounded in context!
        return False

    return True
