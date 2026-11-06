Title: Palghar coastal environment source guide and live-data limits
Source: MPCB, National Centre for Coastal Research, Government of Maharashtra, INCOIS, Open-Meteo
Document: Curated source guide for the AquaPulse Environment assistant
Checked: 2026-11-06

This guide points to the focused, source-linked records used by the Palghar Environment assistant. Historical government findings are split into separate notes so retrieval can preserve each report's dates and geographic coverage:
- MPCB water sampling at Dahanu and Tarapur in 2015–2016: `palghar-environment-water-quality.md`.
- NCCR shoreline assessment from 1990–2016, including the combined Palghar-and-Thane table: `palghar-shoreline-assessment.md`.
- Government of Maharashtra mangrove assessment context for 2023: `maharashtra-mangrove-assessment.md`.

NEAR-REAL-TIME SATELLITE PRODUCTS
INCOIS publishes dated ABIS/ocean-colour products including chlorophyll-a, sea-surface temperature, suspended matter, bloom index, and anomaly maps. The products are derived from satellite observations and are useful as regional indicators. AquaPulse links to the current INCOIS pages but does not download, analyze, or display INCOIS satellite pixel values. A bloom index is not a chemical pollution test, a bathing-water certification, or proof of a harmful bloom at a named beach.
Ocean-colour products: https://incois.gov.in/site/services/ChloroGIN.jsp
ABIS latest product date and downloads: https://incois.gov.in/site/services/hab_products.jsp

LIVE MODELLED MARINE CONDITIONS
The Environment dashboard and assistant can fetch Open-Meteo Marine model outputs for significant wave height, wave period, and sea-surface temperature. Requests select a sea grid cell and display its model coordinates and timestamp. This endpoint needs no key for non-commercial use; the service combines ocean models from providers including Copernicus Marine, ECMWF, NOAA, and DWD.
Source and variable definitions: https://open-meteo.com/en/docs/marine-weather-api

These outputs are numerical model estimates, not a local buoy reading. Grid resolution and coastal accuracy are limited. They do not confirm pollution, beach or swimming safety, an algal bloom, a local incident, or an official warning. They are not navigation advice. A missing or unavailable model result does not imply safe conditions.

WHAT THIS PILOT CAN ANSWER
- Explain the exact study findings and their dates from the focused MPCB, NCCR, and mangrove notes.
- Report the latest marine model output returned for waves and sea-surface temperature, with the selected model grid point and timestamp.
- Explain what INCOIS ocean-colour products measure and link to the dated official product page.

WHAT IT CANNOT CONFIRM
- Current chemical or microbial water quality, whether a specific beach is safe for bathing, or whether a pollution incident is occurring.
- Palghar village-level erosion, mangrove change, or exposure when the source reports only a larger region or district share.
- INCOIS pixel-level values within AquaPulse; users must inspect the official product and date directly.
