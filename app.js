const $ = (selector) => document.querySelector(selector);
const form = $('#chatForm');
const input = $('#questionInput');
const sendButton = $('#sendButton');
const conversation = $('#conversation');
const history = [];
let toastTimer;
const demoModeToggle = $('#demoModeToggle');
const demoModeBanner = $('#demoModeBanner');
const demoPanels = [...document.querySelectorAll('[data-demo-panel]')];
let selectedPlace = null;
let placeSuggestTimer;
let placeSuggestRequest = 0;
let placeSuggestions = [];
let activePlaceIndex = -1;

function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 3200);
}

function setDemoMode(enabled) {
  const active = Boolean(enabled);
  demoModeToggle.setAttribute('aria-pressed', String(active));
  demoModeToggle.textContent = `DEMO MODE · ${active ? 'ON' : 'OFF'}`;
  demoModeBanner.hidden = !active;
  demoPanels.forEach((panel) => { panel.hidden = !active; });
  try { localStorage.setItem('aquapulse-demo-mode', active ? 'on' : 'off'); } catch { }
}

async function loadDemoScenarios() {
  try {
    const response = await fetch('/assets/demo-scenarios.json');
    if (!response.ok) throw new Error(`Demo examples returned ${response.status}`);
    const data = await response.json();
    document.querySelectorAll('[data-demo-path]').forEach((node) => {
      const value = node.dataset.demoPath.split('.').reduce((item, key) => item?.[key], data);
      node.textContent = value == null ? 'Sample data unavailable.' : String(value);
    });
    const marketList = $('[data-demo-market-list]');
    marketList.replaceChildren();
    for (const price of data.markets?.prices || []) {
      const item = document.createElement('div');
      item.className = 'demo-market-item';
      const species = document.createElement('b');
      species.textContent = price.species;
      const range = document.createElement('span');
      range.textContent = `₹${price.low_inr_kg}–₹${price.high_inr_kg} / kg`;
      item.append(species, range);
      marketList.append(item);
    }
  } catch {
    document.querySelectorAll('[data-demo-path]').forEach((node) => { node.textContent = 'The separate demo sample file could not be loaded. Live data is unaffected.'; });
    const marketList = $('[data-demo-market-list]');
    if (marketList) marketList.textContent = 'Synthetic sample rows unavailable.';
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.detail || `Request failed (${response.status})`);
  return body;
}

const palgharForecastPoint = {name:'Palghar',latitude:19.6967,longitude:72.7699,taluka:'Palghar',district:'Palghar'};

async function weatherFromBrowser(place = null) {
  const target = place ? {...place} : {...palgharForecastPoint};
  try {
    if (!Number.isFinite(Number(target.latitude)) || !Number.isFinite(Number(target.longitude))) {
      const geoParams = new URLSearchParams({name:target.name,count:'100',language:'en',format:'json',countryCode:'IN'});
      const geoResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${geoParams}`);
      if (!geoResponse.ok) throw new Error(`Place lookup returned ${geoResponse.status}`);
      const geoData = await geoResponse.json();
      const geo = (geoData.results || []).find(item => item.country_code === 'IN' && item.admin1?.toLowerCase() === 'maharashtra' && item.admin2?.toLowerCase() === 'palghar');
      if (!geo) throw new Error(`No verified forecast point was found for ${target.name}.`);
      target.latitude=geo.latitude; target.longitude=geo.longitude; target.taluka=target.taluka || geo.admin3 || '';
    }
    const params = new URLSearchParams({
      latitude:String(target.latitude),longitude:String(target.longitude),
      current:'temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,surface_pressure',
      hourly:'precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m,temperature_2m',
      daily:'precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,temperature_2m_max,temperature_2m_min,weather_code',
      forecast_days:'7',timezone:'Asia/Kolkata'
    });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!response.ok) throw new Error(`Forecast service returned ${response.status}`);
    const raw = await response.json();
    let marine = null;
    try {
      const marineParams = new URLSearchParams({
        latitude:String(target.latitude),longitude:String(target.longitude),
        hourly:'wave_height,wave_period,sea_surface_temperature',forecast_days:'3',timezone:'Asia/Kolkata',cell_selection:'sea'
      });
      const marineResponse = await fetch(`https://marine-api.open-meteo.com/v1/marine?${marineParams}`);
      if (marineResponse.ok) marine = await marineResponse.json();
    } catch { }
    return {
      available:true,source:'Open-Meteo',source_url:'https://open-meteo.com/en/docs',
      attribution:'Weather data by Open-Meteo · CC BY 4.0',location:target.name || 'Palghar',taluka:target.taluka || '',
      coordinates:{latitude:raw.latitude,longitude:raw.longitude},timezone:raw.timezone || 'Asia/Kolkata',
      current:raw.current || {},current_units:raw.current_units || {},hourly:raw.hourly || {},daily:raw.daily || {},marine:marine?.hourly ? {available:true,hourly:marine.hourly,units:marine.hourly_units || {},coordinates:{latitude:marine.latitude,longitude:marine.longitude}} : {available:false},
      fetched_at:new Date().toISOString(),note:`Forecast model guidance for ${target.name || 'Palghar'} area, not an official warning or a flood prediction.`
    };
  } catch (error) {
    return {available:false,source:'Open-Meteo',source_url:'https://open-meteo.com/en/docs',location:target.name || 'Palghar',error:String(error),note:'Weather service could not be reached from this browser. Check the connection and retry.'};
  }
}

async function weatherPlaceForQuestion(question) {
  const match = question.match(/\b(?:in|near|around|for|at|of)\s+([A-Za-z][A-Za-z .'-]{1,50}?)(?=\s+(?:region|area|district|taluka|town|village|rn|right now|currently|now|today|tomorrow|this|what|how|will|is|should|during|next|days|forecast|weather|temperature|temp)\b|[?.!,]|$)/i);
  if (match) {
    try {
      const result = await api(`/api/places/suggest?q=${encodeURIComponent(match[1].trim())}`);
      const place = result.results?.find(item => item.name?.toLowerCase() === match[1].trim().toLowerCase()) || result.results?.[0];
      if (place) return place;
    } catch { }
  }
  if (selectedPlace) return selectedPlace;
  return palgharForecastPoint;
}

function updateLocationBadge(place = selectedPlace) {
  $('#locationBadgeName').textContent = place?.currentLocation ? 'My location' : (place?.name || 'Palghar');
  $('#locationBadgeRegion').textContent = place?.currentLocation ? 'nearby' : (place?.district || 'Maharashtra');
  const homeLocation = $('#homeLocationName');
  if (homeLocation) homeLocation.textContent = place?.currentLocation ? 'Near your location' : `${place?.name || 'Palghar'}, ${place?.district || 'Maharashtra'}`;
}

function closeLocationMenu(restoreFocus = false) {
  $('#locationMenu').hidden = true;
  $('#locationToggle').setAttribute('aria-expanded','false');
  if (restoreFocus) $('#locationToggle').focus();
}

$('#locationToggle').addEventListener('click',()=>{
  const menu=$('#locationMenu');
  const opening=menu.hidden;
  menu.hidden=!opening;
  $('#locationToggle').setAttribute('aria-expanded',String(opening));
  if (opening) $('#placeSearch').focus();
});
$('#locationClose').addEventListener('click',()=>closeLocationMenu(true));
document.addEventListener('pointerdown',(event)=>{
  if (!event.target.closest('.location-control')) closeLocationMenu();
});
document.addEventListener('keydown',(event)=>{
  if (event.key==='Escape' && !$('#locationMenu').hidden) closeLocationMenu(true);
});

$('#skipCurrentLocation').addEventListener('click',()=>{
  closeLocationMenu(true);
});

$('#useCurrentLocation').addEventListener('click',()=>{
  const button=$('#useCurrentLocation');
  const message=$('#locationPromptMessage');
  if (!navigator.geolocation) {
    message.textContent='This browser cannot provide device location. Continue with Palghar or use the location search.';
    button.disabled=true;
    return;
  }
  button.disabled=true;
  $('#skipCurrentLocation').disabled=true;
  button.textContent='Finding location…';
  message.textContent='Your browser may ask permission. Your coordinates go to Open‑Meteo for a forecast and stay in this page session only.';
  navigator.geolocation.getCurrentPosition(async(position)=>{
    const {latitude,longitude}=position.coords;
    selectedPlace={name:'your location',taluka:'',district:'',latitude,longitude,currentLocation:true};
    updateLocationBadge();
    $('#weatherTitle').textContent='Weather near your location';
    $('#placeCoverage').textContent='Your device location · approximate forecast grid (session only)';
    $('#placeSearch').value='';
    $('#clearPlace').hidden=false;
    button.disabled=false;
    $('#skipCurrentLocation').disabled=false;
    button.textContent='Use my location';
    closeLocationMenu();
    loadDashboard(true);
  },(error)=>{
    button.disabled=false;
    $('#skipCurrentLocation').disabled=false;
    button.textContent='Try location again';
    message.textContent=error.code===1
      ? 'Location permission was not granted. You can still use Palghar weather or choose a town or village.'
      : 'We could not get your location. Check browser location permission, then try again or continue with Palghar.';
  },{enableHighAccuracy:false,maximumAge:0,timeout:15000});
});

function addMessage(role, text, sources = [], pending = false) {
  const message = document.createElement('article');
  message.className = `message ${role}${pending ? ' pending' : ''}`;
  const label = document.createElement('div');
  label.className = 'message-label';
  label.textContent = role === 'user' ? 'You' : 'AquaPulse';
  const body = document.createElement('div');
  body.className = 'message-body';
  body.textContent = text;
  message.append(label, body);
  if (sources.length) {
    const links = document.createElement('div');
    links.className = 'message-sources';
    for (const source of sources) {
      const provenance = source.provenance === 'synthetic' ? 'SYNTHETIC' : 'REAL SOURCE';
      if (source.url) {
        const link = document.createElement('a');
        link.href = source.url;
        link.target = '_blank';
        link.rel = 'noreferrer';
        link.textContent = `[${provenance} · ${source.citation || 'reference'}] ${source.title} ↗`;
        links.append(link);
      } else {
        const label = document.createElement('span');
        label.textContent = `[${provenance} · ${source.citation || 'reference'}] ${source.title}`;
        links.append(label);
      }
    }
    if (links.childElementCount) message.append(links);
  }
  conversation.append(message);
  message.scrollIntoView({block:'nearest',behavior:'smooth'});
  return message;
}

function formatNum(value, digits = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : '—';
}

function renderWeather(data) {
  if (!data?.available) {
    $('#weatherContent').hidden = true;
    $('#weatherError').hidden = false;
    $('#weatherError').textContent = data?.note || 'Forecast data could not be loaded.';
    renderEnvironmentMarine(null, data?.location || selectedPlace?.name || 'Palghar');
    return;
  }
  $('#weatherError').hidden = true;
  $('#weatherContent').hidden = false;
  $('#temperature').textContent = formatNum(data.current?.temperature_2m);
  $('#humidity').textContent = `${formatNum(data.current?.relative_humidity_2m)}%`;
  $('#wind').textContent = `${formatNum(data.current?.wind_speed_10m)} km/h`;
  $('#rainNow').textContent = `${formatNum(data.current?.precipitation,1)} mm`;
  const marine = data.marine;
  renderEnvironmentMarine(marine, data.location || 'Palghar');
  const marineState = $('#marineState');
  if (marine?.available) {
    const times = marine.hourly.time || [];
    const localHour = new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0,13);
    let index = times.findIndex((value) => value.slice(0,13) >= localHour);
    if (index < 0) index = times.length - 1;
    const wave = marine.hourly.wave_height?.[index];
    const period = marine.hourly.wave_period?.[index];
    const seaTemp = marine.hourly.sea_surface_temperature?.[index];
    $('#waveHeight').textContent = wave !== null && wave !== undefined && Number.isFinite(Number(wave)) ? `${formatNum(wave,1)} m` : 'Unavailable';
    $('#wavePeriod').textContent = period !== null && period !== undefined && Number.isFinite(Number(period)) ? `${formatNum(period,0)} s` : 'Unavailable';
    $('#seaTemperature').textContent = seaTemp !== null && seaTemp !== undefined && Number.isFinite(Number(seaTemp)) ? `${formatNum(seaTemp,1)} °C` : 'Unavailable';
    marineState.textContent = `Marine model forecast · updated with the weather request · ${data.location || 'Palghar'}`;
  } else {
    $('#waveHeight').textContent = '—'; $('#wavePeriod').textContent = '—'; $('#seaTemperature').textContent = '—';
    marineState.textContent = 'Marine forecast is temporarily unavailable. General weather data may still be shown above.';
  }
  const daily = data.daily || {};
  let forecast = (daily.time || []).slice(0,7).map((date,index)=>({
    date,rain:daily.precipitation_sum?.[index] ?? null,chance:daily.precipitation_probability_max?.[index] ?? null,
    high:daily.temperature_2m_max?.[index] ?? null,low:daily.temperature_2m_min?.[index] ?? null,wind:daily.wind_speed_10m_max?.[index] ?? null
  }));
  if (!forecast.length && data.hourly?.time?.length) {
    const buckets = new Map();
    data.hourly.time.forEach((time,index)=>{
      const date=time.slice(0,10);
      if (!buckets.has(date)) buckets.set(date,{date,rain:0,chance:null,high:null,low:null,wind:null,hasRain:false});
      const day=buckets.get(date);
      const rainValue=data.hourly.precipitation?.[index];
      const chanceValue=data.hourly.precipitation_probability?.[index];
      const tempValue=data.hourly.temperature_2m?.[index];
      const windValue=data.hourly.wind_speed_10m?.[index];
      const rain=rainValue===null||rainValue===undefined?NaN:Number(rainValue);
      const chance=chanceValue===null||chanceValue===undefined?NaN:Number(chanceValue);
      const temp=tempValue===null||tempValue===undefined?NaN:Number(tempValue);
      const wind=windValue===null||windValue===undefined?NaN:Number(windValue);
      if (Number.isFinite(rain)) { day.rain+=rain; day.hasRain=true; }
      if (Number.isFinite(chance)) day.chance=Math.max(day.chance ?? 0,chance);
      if (Number.isFinite(temp)) { day.high=Math.max(day.high ?? -Infinity,temp); day.low=Math.min(day.low ?? Infinity,temp); }
      if (Number.isFinite(wind)) day.wind=Math.max(day.wind ?? 0,wind);
    });
    forecast=[...buckets.values()].slice(0,7).map(day=>({...day,rain:day.hasRain?day.rain:null}));
  }
  const rows = $('#forecastRows');
  rows.replaceChildren();
  const amounts=forecast.map(day=>day.rain===null||day.rain===undefined?NaN:Number(day.rain)).filter(Number.isFinite);
  const max=Math.max(1,...amounts);
  forecast.forEach((day,index)=>{
    const date = new Date(`${day.date}T12:00:00+05:30`);
    const label = index === 0 ? 'Today' : new Intl.DateTimeFormat('en-IN',{weekday:'short',day:'numeric',timeZone:'Asia/Kolkata'}).format(date);
    const row = document.createElement('div');
    row.className = 'forecast-row';
    const dayLabel = document.createElement('span');
    dayLabel.className = 'forecast-day';
    dayLabel.textContent = label;
    const temperature=document.createElement('span');
    temperature.className='forecast-temp';
    const high=day.high===null||day.high===undefined?NaN:Number(day.high);
    const low=day.low===null||day.low===undefined?NaN:Number(day.low);
    temperature.textContent=Number.isFinite(high)&&Number.isFinite(low)?`${Math.round(high)}° / ${Math.round(low)}°`:'—';
    temperature.title='Forecast high / low temperature';
    const track = document.createElement('span');
    track.className = 'rain-track';
    const bar = document.createElement('i');
    const amount=day.rain===null||day.rain===undefined?NaN:Number(day.rain);
    bar.style.width=Number.isFinite(amount)?`${Math.max(amount>0?3:0,Math.min(100,amount/max*100))}%`:'0%';
    track.append(bar);
    const total = document.createElement('span');
    total.className = 'rain-total';
    const rainfall=document.createElement('b');
    rainfall.textContent=Number.isFinite(amount)?`${amount.toFixed(1)} mm`:'Rain —';
    const chance=document.createElement('small');
    chance.textContent=day.chance!==null&&day.chance!==undefined&&Number.isFinite(Number(day.chance))?`${Math.round(Number(day.chance))}% chance`:'chance —';
    total.append(rainfall,chance);
    row.title=day.wind!==null&&day.wind!==undefined&&Number.isFinite(Number(day.wind))?`Maximum wind: ${Math.round(Number(day.wind))} km/h`:'';
    row.append(dayLabel,temperature,track,total);
    rows.append(row);
  });
  if (!forecast.length) {
    const empty=document.createElement('p');
    empty.className='forecast-empty';
    empty.textContent='Short-term forecast details are temporarily unavailable. Current weather above is still available.';
    rows.append(empty);
  }
  const fetched = data.fetched_at ? new Date(data.fetched_at) : null;
  $('#weatherStamp').textContent = fetched && !Number.isNaN(fetched.getTime())
    ? `Updated ${new Intl.DateTimeFormat('en-IN',{hour:'2-digit',minute:'2-digit',day:'numeric',month:'short',timeZone:'Asia/Kolkata'}).format(fetched)} IST`
    : 'Update time unavailable';
}

function renderEnvironmentMarine(marine, locationName = 'Palghar') {
  const note = $('#environmentLiveNote');
  if (!note) return;
  if (!marine?.available) {
    $('#environmentWave').textContent = '—';
    $('#environmentSeaTemp').textContent = '—';
    $('#environmentWavePeriod').textContent = '—';
    note.textContent = 'Live marine model is temporarily unavailable. Historical environmental records and official source links remain available.';
    return;
  }
  const series = marine.hourly || {};
  const times = series.time || [];
  const localHour = new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Kolkata', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', hourCycle:'h23'}).format(new Date()).replace(' ', 'T').slice(0,13);
  let index = times.findIndex((value) => value.slice(0,13) >= localHour);
  if (index < 0) index = 0;
  const value = (key) => series[key]?.[index];
  const display = (key, digits, unit) => {
    const raw = value(key);
    return raw === null || raw === undefined || !Number.isFinite(Number(raw)) ? 'Unavailable' : `${Number(raw).toFixed(digits)} ${unit}`;
  };
  $('#environmentWave').textContent = display('wave_height', 1, 'm');
  $('#environmentSeaTemp').textContent = display('sea_surface_temperature', 1, '°C');
  $('#environmentWavePeriod').textContent = display('wave_period', 0, 's');
  const modelTime = times[index] || '';
  const coords = marine.coordinates?.latitude !== undefined && marine.coordinates?.longitude !== undefined
    ? ` · sea grid ${Number(marine.coordinates.latitude).toFixed(2)}, ${Number(marine.coordinates.longitude).toFixed(2)}` : '';
  note.textContent = `Open-Meteo Marine model · ${locationName}${coords} · ${modelTime || 'latest forecast'} (IST). No API key required.`;
}

function renderAlerts(data) {
  const state = $('#alertState');
  const items = $('#alertItems');
  items.replaceChildren();
  state.className = 'alert-state';
  if (!data?.available) {
    state.classList.add('unavailable');
    state.textContent = data?.scope_note || 'Could not refresh the official alert feed. This does not mean there are no active warnings. Open SACHET or IMD to verify.';
    return;
  }
  const updated = data.last_updated ? new Date(data.last_updated) : null;
  const stamp = updated && !Number.isNaN(updated.getTime())
    ? new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}).format(updated) + ' IST'
    : 'time unavailable';
  if (data.stale) {
    state.classList.add('stale');
    state.textContent = `${data.feed_name || 'Official feed'} last updated ${stamp}. It is stale, so this page cannot confirm current official warnings. Check SACHET or IMD directly.`;
  } else if (data.items?.length) {
    state.classList.add('active');
    state.textContent = `${data.items.length} Palghar-area match(es) in ${data.feed_name || 'the official feed'} · updated ${stamp}. Confirm the affected area and validity on SACHET.`;
  } else {
    state.textContent = `${data.feed_name || 'SACHET feed'} updated ${stamp}. ${data.scope_note || 'No Palghar-area matches appeared in the items checked; verify location-specific alerts on SACHET.'}`;
  }
  for (const item of (data.items || []).slice(0,4)) {
    const row = document.createElement(item.link ? 'a' : 'div');
    row.className = 'alert-item';
    if (item.link) { row.href=item.link; row.target='_blank'; row.rel='noreferrer'; }
    row.textContent = `${item.title}${item.description ? ` — ${item.description}` : ''}`;
    items.append(row);
  }
}

async function renderSources() {
  const data = await api('/api/knowledge');
  $('#docCount').textContent = `${data.documents.length} SOURCES`;
  const list = $('#sourceList');
  list.replaceChildren();
  for (const source of data.documents) {
    const row = document.createElement('div');
    row.className = 'source-entry';
    const textBlock = document.createElement('div');
    const link = document.createElement('a');
    link.href = source.url || source.document || '#';
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = source.title;
    const meta = document.createElement('span');
    meta.textContent = source.source;
    textBlock.append(link, meta);
    const open = document.createElement('span');
    open.className = 'source-open';
    open.textContent = '↗';
    row.append(textBlock, open);
    list.append(row);
  }
}

async function renderHistory(query = '', kind = '') {
  const target = $('#historyResults');
  target.replaceChildren(Object.assign(document.createElement('span'), {textContent:'Searching past records…', className:'muted'}));
  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query.trim());
  if (kind) params.set('kind', kind);
  try {
    const data = await api(`/api/history?${params}`);
    $('#historyCount').textContent = `${data.total} RECORD${data.total === 1 ? '' : 'S'}`;
    target.replaceChildren();
    if (!data.records.length) {
      target.append(Object.assign(document.createElement('span'), {textContent:'No records match that search.', className:'muted'}));
      return;
    }
    for (const record of data.records) {
      const article = document.createElement('article');
      article.className = 'history-record';
      const meta = document.createElement('div');
      meta.className = 'history-meta';
      const date = document.createElement('time');
      date.dateTime = record.date;
      date.textContent = new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(`${record.date}T12:00:00Z`));
      const type = document.createElement('span'); type.textContent = record.type;
      meta.append(date,type);
      const title = document.createElement('h3'); title.textContent = record.title;
      const locality = document.createElement('div'); locality.className='history-locality'; locality.textContent = `${record.locality}${record.taluka && record.taluka !== record.locality ? ` · ${record.taluka} taluka` : ''}`;
      const summary = document.createElement('p'); summary.textContent = record.summary;
      const details = document.createElement('p'); details.className='history-details'; details.textContent=record.details;
      const source = document.createElement('a'); source.href=record.source_url; source.target='_blank'; source.rel='noreferrer'; source.textContent=`${record.source_title} ↗`;
      article.append(meta,title,locality);
      if (record.amount_mm !== null && record.amount_mm !== undefined) {
        const amount = document.createElement('span'); amount.className='history-amount'; amount.textContent=`${record.amount_mm} mm / 24 h`; article.append(amount);
      }
      article.append(summary,details,source);
      target.append(article);
    }
  } catch (error) {
    target.replaceChildren(Object.assign(document.createElement('span'), {textContent:error.message || 'Past records could not be loaded.', className:'muted'}));
    $('#historyCount').textContent='UNAVAILABLE';
  }
}

async function loadDashboard(force = false) {
  $('#refreshData').disabled = true;
  try {
    const query = force ? '?force=true' : '';
    const results = await Promise.allSettled([
      api('/api/health'),
      weatherFromBrowser(selectedPlace),
      api(`/api/alerts${query}`),
      renderSources(),
    ]);
    const [health, weather, alerts] = results;
    const status = $('#assistantStatus');
    const agentModelLabel = health.status === 'fulfilled' && health.value.assistant?.available
      ? (health.value.assistant.provider === 'gemini' ? 'GEMINI · CLOUD' : `LOCAL · ${health.value.assistant.chat_model || 'LLM'}`)
      : 'MODEL UNAVAILABLE';
    $('#fisheriesModelChip').textContent = agentModelLabel;
    $('#marketsModelChip').textContent = agentModelLabel;
    $('#environmentModelChip').textContent = agentModelLabel;
    $('#weatherModelChip').textContent = agentModelLabel;
    $('#disasterModelChip').textContent = agentModelLabel;
    if (health.status === 'fulfilled' && health.value.assistant?.available) {
      status.className = 'assistant-status ok';
      const isGemini = health.value.assistant.provider === 'gemini';
      status.replaceChildren();
      const dot = document.createElement('i');
      dot.className = 'status-dot';
      const label = document.createElement('span');
      label.textContent = isGemini ? 'Gemini API ready · local references' : 'Local LLM ready · RAG library connected';
      status.append(dot,label);
      $('#modelChip').textContent = `${isGemini ? 'GEMINI' : 'LOCAL'} · ${health.value.assistant.chat_model}`;
      $('#runtimeLabel').innerHTML = isGemini
        ? '<i class="local-led"></i> Gemini cloud · question and retrieved context sent to Google'
        : '<i class="local-led"></i> Runs on this computer · Llama 3.2';
      $('#indexStatus').textContent = `Local document retrieval · ${health.value.knowledge_documents} source files · citations included in answers`;
    } else {
      status.className = 'assistant-status bad';
      status.replaceChildren();
      const dot = document.createElement('i');
      dot.className = 'status-dot';
      const label = document.createElement('span');
      const missingGeminiKey = health.status === 'fulfilled' && health.value.assistant?.provider === 'gemini' && !health.value.assistant?.key_configured;
      label.textContent = missingGeminiKey ? 'Gemini selected · add GEMINI_API_KEY' : 'Local assistant unavailable · start Ollama';
      status.append(dot,label);
      if (health.status === 'fulfilled') $('#modelChip').textContent = missingGeminiKey ? 'GEMINI KEY NEEDED' : `NEEDS ${health.value.assistant?.chat_model || 'LLM'}`;
    }
    if (weather.status === 'fulfilled') renderWeather(weather.value);
    else renderWeather({available:false,note:'Could not reach the no-key weather forecast service.'});
    if (alerts.status === 'fulfilled') renderAlerts(alerts.value);
    else renderAlerts({available:false});
  } catch (error) {
    toast(error.message || 'Could not refresh dashboard data.');
  } finally {
    $('#refreshData').disabled = false;
  }
}

async function ask(question) {
  const clean = question.trim();
  if (!clean || sendButton.disabled) return;
  const environmentalQuestion = /\b(environment|pollution|contamination|water quality|water pollution|shoreline|erosion|mangroves?|chlorophyll|ocean colou?r|sea surface temperature|sea temperature|ocean temperature|water temperature|coastal habitat|marine litter|oil spill|effluent|sewage|beach|bathing|swimming|waves?(?: height| period)?|swell|tide height|ocean currents?|marine conditions|sea conditions)\b/i.test(clean);
  $('#welcomeBlock').hidden = true;
  addMessage('user', clean);
  history.push({role:'user',content:clean});
  input.value = '';
  sendButton.disabled = true;
  sendButton.querySelector('span').textContent = 'Thinking';
  const pending = addMessage('assistant',environmentalQuestion ? 'Searching dated Palghar environment references…' : 'Searching Palghar references and checking the latest weather context…',[],true);
  try {
    const weatherPlace = await weatherPlaceForQuestion(clean);
    const weather = environmentalQuestion
      ? {available:false,note:'Weather context is not used for environmental references.'}
      : await weatherFromBrowser(weatherPlace);
    const chatLocation={...weatherPlace};
    delete chatLocation.latitude; delete chatLocation.longitude; delete chatLocation.currentLocation;
    if (weatherPlace.currentLocation) { chatLocation.name='nearby area'; chatLocation.taluka=''; chatLocation.district=''; }
    const chatWeather={...weather};
    delete chatWeather.coordinates;
    const result = await api('/api/chat',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:clean,history:history.slice(0,-1),location:chatLocation,weather:chatWeather}),
    });
    pending.remove();
    addMessage('assistant',result.answer || 'The assistant returned an empty answer.',result.sources || []);
    history.push({role:'assistant',content:result.answer || ''});
    if (result.weather) {
      renderWeather(result.weather);
      if (!selectedPlace && result.weather.location && result.weather.location !== 'Palghar') {
        $('#weatherTitle').textContent = `${result.weather.location} conditions`;
        $('#placeCoverage').textContent = `${result.weather.location}${result.weather.taluka ? ` · ${result.weather.taluka} taluka` : ''} · forecast point`;
        if (result.weather.available && result.weather.coordinates) {
          selectedPlace = {name:result.weather.location,latitude:result.weather.coordinates.latitude,longitude:result.weather.coordinates.longitude,taluka:result.weather.taluka || '',district:'Palghar'};
          updateLocationBadge(selectedPlace);
        }
      }
      if (selectedPlace) {
        if (selectedPlace.currentLocation) {
          $('#weatherTitle').textContent = `Weather near ${selectedPlace.name}`;
          $('#placeCoverage').textContent = `${selectedPlace.name}${selectedPlace.taluka ? ` · ${selectedPlace.taluka}` : ''} · device location (session only)`;
        } else {
          $('#weatherTitle').textContent = `${selectedPlace.name} conditions`;
          $('#placeCoverage').textContent = `${selectedPlace.name}${selectedPlace.taluka ? ` · ${selectedPlace.taluka} taluka` : ''} · selected locality`;
        }
      }
    }
    if (result.alerts) renderAlerts(result.alerts);
  } catch (error) {
    pending.remove();
    addMessage('assistant',error.message || 'The assistant could not answer. Check its configuration and try again.');
    toast('Could not get an answer from the local assistant.');
  } finally {
    sendButton.disabled = false;
    sendButton.querySelector('span').textContent = 'Ask';
    input.focus();
  }
}

function choosePlace(place) {
  const input = $('#placeSearch');
  if (input) input.value = place.name;
  selectedPlace = {name:place.name,taluka:place.taluka || '',district:place.district || 'Palghar'};
  if (Number.isFinite(Number(place.latitude)) && Number.isFinite(Number(place.longitude))) {
    selectedPlace.latitude=Number(place.latitude);
    selectedPlace.longitude=Number(place.longitude);
  }
  updateLocationBadge(selectedPlace);
  $('#weatherTitle').textContent = `${place.name} conditions`;
  $('#placeCoverage').textContent = `${place.name}${place.taluka ? ` · ${place.taluka} taluka` : ''} · settlement-level forecast`;
  $('#clearPlace').hidden = false;
  closePlaceSuggestions();
  closeLocationMenu();
  $('#placeSearchStatus').textContent = `${place.name} selected. Forecast uses the nearest available settlement point.`;
  loadDashboard(true);
  $('#questionInput').focus();
}

function closePlaceSuggestions() {
  const results = $('#placeResults');
  results.hidden = true;
  results.replaceChildren();
  $('#placeSearch').setAttribute('aria-expanded','false');
  $('#placeSearch').removeAttribute('aria-activedescendant');
  placeSuggestions = [];
  activePlaceIndex = -1;
}

function showPlaceSuggestions(places, query) {
  const results = $('#placeResults');
  const input = $('#placeSearch');
  results.replaceChildren();
  placeSuggestions = places;
  activePlaceIndex = -1;
  if (!places.length) {
    const empty = document.createElement('div');
    empty.className='place-empty'; empty.textContent=`No Palghar village matches “${query}”. Try a different spelling or select the district overview.`;
    results.append(empty);
    results.hidden=false;
    input.setAttribute('aria-expanded','false');
    input.removeAttribute('aria-activedescendant');
    $('#placeSearchStatus').textContent=empty.textContent;
    return;
  }
  places.forEach((place,index)=>{
    const option=document.createElement('button');
    option.type='button'; option.className='place-result'; option.id=`place-option-${index}`;
    option.setAttribute('role','option'); option.setAttribute('aria-selected','false');
    const name=document.createElement('span'); name.textContent=place.name;
    const meta=document.createElement('small'); meta.textContent=`${place.taluka} taluka`;
    option.append(name,meta);
    option.addEventListener('mousedown',(event)=>event.preventDefault());
    option.addEventListener('click',()=>choosePlace(place));
    results.append(option);
  });
  results.hidden=false;
  input.setAttribute('aria-expanded','true');
  $('#placeSearchStatus').textContent=`${places.length} Palghar ${places.length===1?'location':'locations'} found. Use the arrow keys to choose one.`;
}

async function loadPlaceSuggestions(query, requestId = ++placeSuggestRequest) {
  try {
    const directoryRequest=api(`/api/places/suggest?q=${encodeURIComponent(query)}`);
    const geocodeRequest=(async()=>{
      const params=new URLSearchParams({name:query,count:'100',language:'en',format:'json',countryCode:'IN'});
      const response=await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
      if (!response.ok) return [];
      const data=await response.json();
      return (data.results || []).filter(item=>item.country_code==='IN' && item.admin1?.toLowerCase()==='maharashtra' && item.admin2?.toLowerCase()==='palghar').map(item=>({
        name:item.name,localName:'',latitude:item.latitude,longitude:item.longitude,district:item.admin2 || 'Palghar',taluka:item.admin3 || '',feature:item.feature,
        label:[item.name,item.admin3,item.admin2].filter(Boolean).join(' · '),source:'Open-Meteo / GeoNames'
      }));
    })().catch(()=>[]);
    const [data,geocoded]=await Promise.all([directoryRequest,geocodeRequest]);
    if (requestId!==placeSuggestRequest || $('#placeSearch').value.trim()!==query) return;
    const combined=[...(data.results || [])];
    const seen=new Set(combined.map(place=>place.name.toLocaleLowerCase()));
    for (const place of geocoded) {
      const key=place.name.toLocaleLowerCase();
      if (!seen.has(key)) { combined.push(place); seen.add(key); }
      else {
        const existing=combined.find(item=>item.name.toLocaleLowerCase()===key);
        if (existing && existing.latitude==null) { existing.latitude=place.latitude; existing.longitude=place.longitude; }
      }
    }
    combined.sort((a,b)=>{
      const rank=place=>place.name.toLocaleLowerCase()===query.toLocaleLowerCase()?0:place.name.toLocaleLowerCase().startsWith(query.toLocaleLowerCase())?1:2;
      return rank(a)-rank(b) || a.name.localeCompare(b.name);
    });
    showPlaceSuggestions(combined.slice(0,8),query);
  } catch(error) {
    if (requestId!==placeSuggestRequest) return;
    closePlaceSuggestions();
    $('#placeSearchStatus').textContent=error.message || 'Location suggestions could not be loaded.';
  }
}

$('#placeSearch').addEventListener('input',()=>{
  const query=$('#placeSearch').value.trim();
  if (selectedPlace) {
    selectedPlace=null;
    updateLocationBadge();
    $('#weatherTitle').textContent='Palghar conditions';
    $('#placeCoverage').textContent='Palghar district · all 1,009 listed revenue villages';
    $('#clearPlace').hidden=true;
    loadDashboard(true);
  }
  clearTimeout(placeSuggestTimer);
  const requestId=++placeSuggestRequest;
  if (query.length<2) {
    closePlaceSuggestions();
    $('#placeSearchStatus').textContent=query ? 'Type at least two letters to search.' : '';
    return;
  }
  $('#placeSearchStatus').textContent='Searching Palghar locations…';
  placeSuggestTimer=setTimeout(()=>loadPlaceSuggestions(query,requestId),220);
});

$('#placeSearch').addEventListener('keydown',(event)=>{
  if (!placeSuggestions.length) {
    if (event.key==='Escape') closePlaceSuggestions();
    return;
  }
  if (event.key==='ArrowDown' || event.key==='ArrowUp') {
    event.preventDefault();
    const direction=event.key==='ArrowDown' ? 1 : -1;
    activePlaceIndex=(activePlaceIndex+direction+placeSuggestions.length)%placeSuggestions.length;
    $('#placeResults').querySelectorAll('[role="option"]').forEach((option,index)=>{
      const active=index===activePlaceIndex;
      option.classList.toggle('active',active);
      option.setAttribute('aria-selected',String(active));
    });
    const active=$(`#place-option-${activePlaceIndex}`);
    $('#placeSearch').setAttribute('aria-activedescendant',active.id);
    active.scrollIntoView({block:'nearest'});
  } else if (event.key==='Enter' && activePlaceIndex>=0) {
    event.preventDefault();
    choosePlace(placeSuggestions[activePlaceIndex]);
  } else if (event.key==='Escape') {
    event.preventDefault();
    closePlaceSuggestions();
  }
});

$('#placeSearchForm').addEventListener('submit',async(event)=>{
  event.preventDefault();
  const query=$('#placeSearch').value.trim();
  if (query.length<2) {
    $('#placeSearchStatus').textContent='Type at least two letters to search.';
    return;
  }
  clearTimeout(placeSuggestTimer);
  await loadPlaceSuggestions(query,++placeSuggestRequest);
  const exact=placeSuggestions.find(place=>place.name.toLocaleLowerCase()===query.toLocaleLowerCase() || place.localName?.toLocaleLowerCase()===query.toLocaleLowerCase());
  if (exact) choosePlace(exact);
});

document.addEventListener('pointerdown',(event)=>{
  if (!event.target.closest('.place-autocomplete')) closePlaceSuggestions();
});

$('#clearPlace').addEventListener('click', () => {
  selectedPlace = null;
  updateLocationBadge();
  $('#weatherTitle').textContent = 'Palghar conditions';
  $('#placeCoverage').textContent = 'Palghar district · settlement-level forecast';
  $('#clearPlace').hidden = true;
  $('#placeSearch').value='';
  $('#placeCoverage').textContent='Palghar district · all 1,009 listed revenue villages';
  $('#weatherTitle').textContent='Palghar conditions';
  loadDashboard(true);
});

const sectionNavLinks = [...document.querySelectorAll('.section-nav [role="tab"]')];
const tabPanels = sectionNavLinks.map((link) => document.getElementById(link.getAttribute('aria-controls'))).filter(Boolean);
function activateTab(link, {writeHash=true, focus=false}={}) {
  sectionNavLinks.forEach((item) => {
    const selected = item === link;
    item.classList.toggle('active', selected);
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
  });
  const targetId = link ? link.getAttribute('aria-controls') : 'tab-home';
  tabPanels.forEach((panel) => { panel.hidden = panel.id !== targetId; });
  
  // Highlight topbar icons
  const headerHome = document.getElementById('headerHomeBtn');
  const headerAsk = document.getElementById('headerAskBtn');
  if (headerHome) headerHome.classList.toggle('active', targetId === 'tab-home');
  if (headerAsk) headerAsk.classList.toggle('active', targetId === 'tab-ask');

  if (writeHash && location.hash !== link?.hash) history.replaceState(null, '', link?.hash || '#home');
  if (focus && link) link.focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
sectionNavLinks.forEach((link, index) => {
  link.addEventListener('click', (event) => { event.preventDefault(); activateTab(link); });
  link.addEventListener('keydown', (event) => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % sectionNavLinks.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + sectionNavLinks.length) % sectionNavLinks.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = sectionNavLinks.length - 1;
    else return;
    event.preventDefault();
    activateTab(sectionNavLinks[next], {focus:true});
  });
});
document.querySelectorAll('[data-open-section]').forEach((button) => {
  const trigger = () => {
    const targetId = button.dataset.openSection;
    const panel = document.getElementById(targetId);
    const link = sectionNavLinks.find((item) => item.getAttribute('aria-controls') === targetId);
    if (link) activateTab(link);
    else if (panel) {
      tabPanels.forEach(p => p.hidden = p.id !== targetId);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };
  button.addEventListener('click', trigger);
  button.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      trigger();
    }
  });
});

function connectAgentQuestion(formId, inputId, answerId, agent) {
  const form = document.getElementById(formId);
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.getElementById(inputId);
    const answer = document.getElementById(answerId);
    const button = form.querySelector('button[type="submit"]');
    const question = input.value.trim();
    if (!question) return;
    button.disabled = true;
    answer.textContent = 'Searching local and live sources…';
    try {
      const result = await api('/api/chat', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({message:question,agent,location:selectedPlace})
      });
      answer.replaceChildren();
      const responseText = document.createElement('p');
      responseText.textContent = result.answer || 'The local assistant returned no answer.';
      answer.append(responseText);
      if (result.sources?.length) {
        const links = document.createElement('div');
        links.className = 'agent-answer-sources';
        result.sources.forEach((source, index) => {
          const provenance = source.provenance === 'synthetic' ? 'SYNTHETIC' : 'REAL SOURCE';
          const citation = `[${provenance} · ${source.citation || `S${index + 1}`}] ${source.title}`;
          if (source.url) {
            const link = document.createElement('a');
            link.href = source.url;
            link.target = '_blank';
            link.rel = 'noreferrer';
            link.textContent = `${citation} ↗`;
            links.append(link);
          } else {
            const label = document.createElement('span');
            label.textContent = citation;
            links.append(label);
          }
        });
        if (links.childElementCount) answer.append(links);
      }
    } catch (error) {
      answer.textContent = `The local assistant could not answer right now. ${error.message || 'Check that the local model is running.'}`;
    } finally {
      button.disabled = false;
    }
  });
}
connectAgentQuestion('weatherAskForm','weatherQuestion','weatherAnswer','weather');
connectAgentQuestion('disasterAskForm','disasterQuestion','disasterAnswer','disaster');
connectAgentQuestion('fisheriesAskForm','fisheriesQuestion','fisheriesAnswer','fisheries');
connectAgentQuestion('marketsAskForm','marketsQuestion','marketsAnswer','markets');
connectAgentQuestion('environmentAskForm','environmentQuestion','environmentAnswer','environment');
connectAgentQuestion('recordsAskForm','recordsQuestion','recordsAnswer','records');
connectAgentQuestion('sourcesAskForm','sourcesQuestion','sourcesAnswer','sources');

function activateTabFromHash() {
  const targetId = decodeURIComponent(location.hash.slice(1));
  const panel = targetId ? tabPanels.find((item) => item.id === targetId || item.querySelector(`#${CSS.escape(targetId)}`)) : null;
  activateTab(sectionNavLinks.find((link) => link.getAttribute('aria-controls') === panel?.id) || sectionNavLinks[0], {writeHash:false});
}
activateTabFromHash();
window.addEventListener('hashchange', activateTabFromHash);

form.addEventListener('submit',(event)=>{event.preventDefault();ask(input.value);});
input.addEventListener('keydown',(event)=>{
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); }
});
document.querySelectorAll('.suggestion').forEach((button)=>button.addEventListener('click',()=>ask(button.dataset.question || '')));
$('#refreshData').addEventListener('click',()=>loadDashboard(true));
$('#demoAlertToggle').addEventListener('click',()=>{
  const button=$('#demoAlertToggle');
  const card=$('#demoAlertCard');
  card.hidden=!card.hidden;
  button.setAttribute('aria-expanded',String(!card.hidden));
  button.textContent=card.hidden?'Show sample warning · demo':'Hide sample warning · demo';
});
$('#historySearchForm').addEventListener('submit',(event)=>{event.preventDefault();renderHistory($('#historyQuery').value,$('#historyType').value);});
$('#historyType').addEventListener('change',()=>renderHistory($('#historyQuery').value,$('#historyType').value));
$('#reindexButton').addEventListener('click',async()=>{
  const button=$('#reindexButton');
  button.disabled=true;
  $('#indexStatus').textContent='Embedding local references…';
  try {
    const result=await api('/api/knowledge/reindex',{method:'POST'});
    $('#indexStatus').textContent=`Index ready · ${result.documents} documents · ${result.chunks} searchable passages`;
    toast('Reference library refreshed.');
  } catch(error) {
    $('#indexStatus').textContent=error.message;
    toast('Could not refresh the reference index.');
  } finally { button.disabled=false; }
});

demoModeToggle.addEventListener('click', () => setDemoMode(demoModeToggle.getAttribute('aria-pressed') !== 'true'));
let savedDemoPreference = null;
try { savedDemoPreference = localStorage.getItem('aquapulse-demo-mode'); } catch { }
setDemoMode(savedDemoPreference === null ? true : savedDemoPreference === 'on');
loadDemoScenarios();

loadDashboard();
renderHistory();


// Fisherman Portal Interactive Enhancements
// 1. Quick locality chips
document.querySelectorAll('.loc-chip-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const placeName = btn.dataset.place;
    try {
      const data = await api(/api/places/suggest?q=);
      const exact = (data.results || []).find(p => p.name.toLowerCase() === placeName.toLowerCase()) || (data.results || [])[0];
      if (exact) {
        choosePlace(exact);
      } else {
        choosePlace({ name: placeName, taluka: placeName, district: 'Palghar' });
      }
    } catch {
      choosePlace({ name: placeName, taluka: placeName, district: 'Palghar' });
    }
  });
});

// 2. Topbar navigation
const headerHomeBtn = document.getElementById('headerHomeBtn');
const brandHomeLink = document.getElementById('brandHomeLink');
const headerAskBtn = document.getElementById('headerAskBtn');
const headerLogoutBtn = document.getElementById('headerLogoutBtn');

if (headerHomeBtn) headerHomeBtn.addEventListener('click', () => {
  const homeTab = sectionNavLinks.find(l => l.getAttribute('aria-controls') === 'tab-home');
  if (homeTab) activateTab(homeTab);
});
if (brandHomeLink) brandHomeLink.addEventListener('click', (e) => {
  e.preventDefault();
  const homeTab = sectionNavLinks.find(l => l.getAttribute('aria-controls') === 'tab-home');
  if (homeTab) activateTab(homeTab);
});
if (headerAskBtn) headerAskBtn.addEventListener('click', () => {
  const askTab = sectionNavLinks.find(l => l.getAttribute('aria-controls') === 'tab-ask');
  if (askTab) activateTab(askTab);
});
if (headerLogoutBtn) headerLogoutBtn.addEventListener('click', () => {
  selectedPlace = null;
  updateLocationBadge();
  #weatherTitle.textContent = 'Palghar conditions';
  #placeCoverage.textContent = 'Palghar district · all 1,009 listed revenue villages';
  #clearPlace.hidden = true;
  loadDashboard(true);
  toast('Session reset to Palghar District overview.');
});

// 3. Language Switcher (English <-> Marathi)
let currentLang = 'en';
const translations = {
  en: {
    heroTitle: 'Welcome, Fisherman!',
    heroSub: 'Get the latest information about the sea and your fishing area.',
    cardWeather: 'Weather & Sea Conditions',
    descWeather: 'Check today\'s weather, wind and sea status.',
    cardDisaster: 'Disaster Alerts',
    descDisaster: 'Get instant alerts for storms, high waves and more.',
    cardFisheries: 'Fishing Areas',
    descFisheries: 'Find the best fishing zones near you.',
    cardMarkets: 'Fish Market Prices',
    descMarkets: 'Know the latest prices for your catch.',
    askAqua: 'Ask AquaPulse',
    home: 'Home',
    logout: 'Logout',
    langBtn: 'मराठी'
  },
  mr: {
    heroTitle: 'मच्छीमार बांधवांचे स्वागत आहे!',
    heroSub: 'समुद्र आणि तुमच्या मासेमारी क्षेत्राची ताजी माहिती येथे मिळवा.',
    cardWeather: 'हवामान आणि समुद्राची स्थिती',
    descWeather: 'आजचे हवामान, वारे आणि समुद्राच्या उसळीची स्थिती तपासा.',
    cardDisaster: 'आपत्ती आणि वादळाचा इशारा',
    descDisaster: 'वादळ, उंच लाटा आणि आपत्कालीन इशारे त्वरित मिळवा.',
    cardFisheries: 'मासेमारी क्षेत्रे (PFZ)',
    descFisheries: 'तुमच्या जवळचे संभाव्य मासेमारी क्षेत्र शोधा.',
    cardMarkets: 'मत्स्य बाजार भाव',
    descMarkets: 'तुमच्या मासळीचे अधिकृत लिलाव व घाऊक दर जाणून घ्या.',
    askAqua: 'ॲक्वापल्सला विचारा',
    home: 'मुख्य पान',
    logout: 'रीसेट',
    langBtn: 'English'
  }
};

const langToggleBtn = document.getElementById('langToggleBtn');
if (langToggleBtn) {
  langToggleBtn.addEventListener('click', () => {
    currentLang = currentLang === 'en' ? 'mr' : 'en';
    const t = translations[currentLang];
    
    const hTitle = document.getElementById('heroTitle');
    const hSub = document.getElementById('heroSubtitle');
    const cWeather = document.getElementById('cardTitleWeather');
    const dWeather = document.getElementById('cardDescWeather');
    const cDisaster = document.getElementById('cardTitleDisaster');
    const dDisaster = document.getElementById('cardDescDisaster');
    const cFisheries = document.getElementById('cardTitleFisheries');
    const dFisheries = document.getElementById('cardDescFisheries');
    const cMarkets = document.getElementById('cardTitleMarkets');
    const dMarkets = document.getElementById('cardDescMarkets');
    const lAsk = document.getElementById('labelAskAqua');
    const lHome = document.getElementById('labelHome');
    const lLogout = document.getElementById('labelLogout');
    
    if (hTitle) hTitle.textContent = t.heroTitle;
    if (hSub) hSub.textContent = t.heroSub;
    if (cWeather) cWeather.textContent = t.cardWeather;
    if (dWeather) dWeather.textContent = t.descWeather;
    if (cDisaster) cDisaster.textContent = t.cardDisaster;
    if (dDisaster) dDisaster.textContent = t.descDisaster;
    if (cFisheries) cFisheries.textContent = t.cardFisheries;
    if (dFisheries) dFisheries.textContent = t.descFisheries;
    if (cMarkets) cMarkets.textContent = t.cardMarkets;
    if (dMarkets) dMarkets.textContent = t.descMarkets;
    if (lAsk) lAsk.textContent = t.askAqua;
    if (lHome) lHome.textContent = t.home;
    if (lLogout) lLogout.textContent = t.logout;
    
    langToggleBtn.querySelector('.lang-indicator').textContent = t.langBtn;
    toast(currentLang === 'mr' ? 'भाषा: मराठी सक्रिय केली.' : 'Language: English activated.');
  });
}

// 4. Voice Speech-to-Text Input for Fishermen
const voiceBtn = document.getElementById('voiceInputBtn');
if (voiceBtn && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  
  voiceBtn.addEventListener('click', () => {
    if (voiceBtn.classList.contains('recording')) {
      recognition.stop();
      voiceBtn.classList.remove('recording');
    } else {
      recognition.lang = currentLang === 'mr' ? 'mr-IN' : 'en-IN';
      recognition.start();
      voiceBtn.classList.add('recording');
      toast(currentLang === 'mr' ? 'ऐकत आहे... कृपया बोला' : 'Listening… Speak your question');
    }
  });
  
  recognition.onresult = (event) => {
    const text = event.results[0][0].transcript;
    const input = document.getElementById('questionInput');
    if (input) {
      input.value = text;
      input.focus();
    }
    voiceBtn.classList.remove('recording');
    toast('Captured: ' + text);
  };
  recognition.onerror = () => {
    voiceBtn.classList.remove('recording');
    toast('Could not recognize voice. Please try again or type.');
  };
  recognition.onend = () => {
    voiceBtn.classList.remove('recording');
  };
} else if (voiceBtn) {
  voiceBtn.title = 'Voice input available in Chrome/Edge';
}
