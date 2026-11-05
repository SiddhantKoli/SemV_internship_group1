const $ = (selector) => document.querySelector(selector);
const form = $('#chatForm');
const input = $('#questionInput');
const sendButton = $('#sendButton');
const conversation = $('#conversation');
const history = [];
let toastTimer;
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
    return {
      available:true,source:'Open-Meteo',source_url:'https://open-meteo.com/en/docs',
      attribution:'Weather data by Open-Meteo · CC BY 4.0',location:target.name || 'Palghar',taluka:target.taluka || '',
      coordinates:{latitude:raw.latitude,longitude:raw.longitude},timezone:raw.timezone || 'Asia/Kolkata',
      current:raw.current || {},current_units:raw.current_units || {},hourly:raw.hourly || {},daily:raw.daily || {},
      fetched_at:new Date().toISOString(),note:`Forecast model guidance for ${target.name || 'Palghar'} area, not an official warning or a flood prediction.`
    };
  } catch (error) {
    return {available:false,source:'Open-Meteo',source_url:'https://open-meteo.com/en/docs',location:target.name || 'Palghar',error:String(error),note:'Weather service could not be reached from this browser. Check the connection and retry.'};
  }
}

async function weatherPlaceForQuestion(question) {
  if (selectedPlace) return selectedPlace;
  const match = question.match(/\b(?:in|near|around|for)\s+([A-Za-z][A-Za-z .'-]{1,50}?)(?=\s+(?:region|area|district|taluka|town|village|today|tomorrow|this|what|how|will|is|should|during|next|days|forecast|weather)\b|[?.!,]|$)/i);
  if (match) {
    try {
      const result = await api(`/api/places/suggest?q=${encodeURIComponent(match[1].trim())}`);
      const place = result.results?.find(item => item.name?.toLowerCase() === match[1].trim().toLowerCase()) || result.results?.[0];
      if (place) return place;
    } catch { }
  }
  return palgharForecastPoint;
}

function updateLocationBadge(place = selectedPlace) {
  $('#locationBadgeName').textContent = place?.currentLocation ? 'My location' : (place?.name || 'Palghar');
  $('#locationBadgeRegion').textContent = place?.currentLocation ? 'nearby' : (place?.district || 'Maharashtra');
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
  label.textContent = role === 'user' ? 'You' : 'Palghar Disaster Desk';
  const body = document.createElement('div');
  body.className = 'message-body';
  body.textContent = text;
  message.append(label, body);
  if (sources.length) {
    const links = document.createElement('div');
    links.className = 'message-sources';
    for (const source of sources) {
      if (!source.url) continue;
      const link = document.createElement('a');
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = `[${source.citation}] ${source.title} ↗`;
      links.append(link);
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
    return;
  }
  $('#weatherError').hidden = true;
  $('#weatherContent').hidden = false;
  $('#temperature').textContent = formatNum(data.current?.temperature_2m);
  $('#humidity').textContent = `${formatNum(data.current?.relative_humidity_2m)}%`;
  $('#wind').textContent = `${formatNum(data.current?.wind_speed_10m)} km/h`;
  $('#rainNow').textContent = `${formatNum(data.current?.precipitation,1)} mm`;
  const times = data.daily?.time || [];
  const values = data.daily?.precipitation_sum || [];
  const chances = data.daily?.precipitation_probability_max || [];
  const max = Math.max(1, ...values.map(Number).filter(Number.isFinite));
  const rows = $('#forecastRows');
  rows.replaceChildren();
  times.forEach((day, index) => {
    const date = new Date(`${day}T12:00:00+05:30`);
    const label = index === 0 ? 'Today' : new Intl.DateTimeFormat('en-IN',{weekday:'short',day:'numeric',timeZone:'Asia/Kolkata'}).format(date);
    const row = document.createElement('div');
    row.className = 'forecast-row';
    const dayLabel = document.createElement('span');
    dayLabel.className = 'forecast-day';
    dayLabel.textContent = label;
    const track = document.createElement('span');
    track.className = 'rain-track';
    const bar = document.createElement('i');
    const amount = Number(values[index]) || 0;
    bar.style.width = `${Math.max(amount > 0 ? 3 : 0, Math.min(100, amount / max * 100))}%`;
    track.append(bar);
    const total = document.createElement('span');
    total.className = 'rain-total';
    total.textContent = `${amount.toFixed(1)} mm`;
    total.title = `Maximum precipitation probability: ${chances[index] ?? 'not provided'}%`;
    row.append(dayLabel, track, total);
    rows.append(row);
  });
  const fetched = data.fetched_at ? new Date(data.fetched_at) : null;
  $('#weatherStamp').textContent = fetched && !Number.isNaN(fetched.getTime())
    ? `Updated ${new Intl.DateTimeFormat('en-IN',{hour:'2-digit',minute:'2-digit',day:'numeric',month:'short',timeZone:'Asia/Kolkata'}).format(fetched)} IST`
    : 'Update time unavailable';
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
  $('#welcomeBlock').hidden = true;
  addMessage('user', clean);
  history.push({role:'user',content:clean});
  input.value = '';
  sendButton.disabled = true;
  sendButton.querySelector('span').textContent = 'Thinking';
  const pending = addMessage('assistant','Searching Palghar references and checking the latest weather context…',[],true);
  try {
    const weatherPlace = await weatherPlaceForQuestion(clean);
    const weather = await weatherFromBrowser(weatherPlace);
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
  tabPanels.forEach((panel) => { panel.hidden = panel.id !== link.getAttribute('aria-controls'); });
  if (writeHash && location.hash !== link.hash) history.replaceState(null, '', link.hash);
  if (focus) link.focus();
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
  button.textContent=card.hidden?'Preview sample warning · demo':'Hide sample warning · demo';
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

loadDashboard();
renderHistory();
