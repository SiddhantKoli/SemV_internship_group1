param(
    [int]$Port = 0,
    [ValidateSet('ask', 'weather', 'disaster', 'fisheries', 'markets', 'environment')]
    [string]$Agent = 'ask',
    [string]$Location = 'Palghar'
)

$ErrorActionPreference = 'Stop'

if ($Port -gt 0) {
    $candidatePorts = @($Port)
} else {
    $candidatePorts = @(8767, 8766, 8765, 8000)
}

$baseUrl = $null
foreach ($candidatePort in $candidatePorts) {
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:$candidatePort/api/health" -TimeoutSec 3
        $baseUrl = "http://127.0.0.1:$candidatePort"
        break
    } catch { }
}

if (-not $baseUrl) {
    throw 'AquaPulse is not running. In another PowerShell window, start it with .\run.ps1, then run .\chat.ps1 here.'
}

if (-not $health.assistant.available) {
    throw 'The AquaPulse server is running, but its chat model is unavailable. Check Ollama and try again.'
}

$history = [System.Collections.Generic.List[object]]::new()
$lastWeather = $null
$agentNames = @{ ask = 'AquaPulse'; weather = 'Weather'; disaster = 'Disaster'; fisheries = 'Fisheries'; markets = 'Fish markets'; environment = 'Environment' }
$lastAutoAgent = $Agent

function Get-WeatherContext {
    param([string]$PlaceName)

    $name = [uri]::EscapeDataString($PlaceName)
    $geoUrl = "https://geocoding-api.open-meteo.com/v1/search?name=$name&count=100&language=en&format=json&countryCode=IN"
    try {
        $geoData = Invoke-RestMethod -Uri $geoUrl -TimeoutSec 15
        $place = @($geoData.results) | Where-Object {
            $_.country_code -eq 'IN' -and $_.admin1 -eq 'Maharashtra' -and $_.admin2 -eq 'Palghar'
        } | Select-Object -First 1
        if (-not $place) {
            return @{ available = $false; source = 'Open-Meteo'; location = $PlaceName; note = "No Palghar district forecast point was found for $PlaceName." }
        }

        $weatherParams = @{
            latitude = [string]$place.latitude
            longitude = [string]$place.longitude
            current = 'temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,surface_pressure'
            hourly = 'precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m,temperature_2m'
            daily = 'precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,temperature_2m_max,temperature_2m_min,weather_code'
            forecast_days = '7'
            timezone = 'Asia/Kolkata'
        }
        $query = ($weatherParams.GetEnumerator() | ForEach-Object { "$([uri]::EscapeDataString($_.Key))=$([uri]::EscapeDataString($_.Value))" }) -join '&'
        $raw = Invoke-RestMethod -Uri "https://api.open-meteo.com/v1/forecast?$query" -TimeoutSec 20
        return @{
            available = $true
            source = 'Open-Meteo'
            source_url = 'https://open-meteo.com/en/docs'
            attribution = 'Weather data by Open-Meteo · CC BY 4.0'
            location = $place.name
            taluka = $place.admin3
            coordinates = @{ latitude = $raw.latitude; longitude = $raw.longitude }
            timezone = $raw.timezone
            current = $raw.current
            current_units = $raw.current_units
            hourly = $raw.hourly
            daily = $raw.daily
            fetched_at = [DateTime]::UtcNow.ToString('o')
            note = "Open-Meteo model forecast for $($place.name), not an official warning or street-level reading."
        }
    } catch {
        return @{ available = $false; source = 'Open-Meteo'; location = $PlaceName; note = "Weather could not be fetched for ${PlaceName}: $($_.Exception.Message)" }
    }
}

Write-Host "AquaPulse terminal chat · $($health.assistant.chat_model) · $baseUrl" -ForegroundColor Cyan
Write-Host "Agent: $($agentNames[$Agent]) · Location: $Location"
Write-Host 'Type a message and press Enter. AquaPulse routes questions automatically. Commands: /agent ask|weather|disaster|fisheries|markets|environment, /location <name>, /clear, /help, /exit' -ForegroundColor DarkGray
Write-Host ''

while ($true) {
    $line = Read-Host 'You'
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $line = $line.Trim()

    if ($line -match '^/exit$') { break }
    if ($line -match '^/help$') {
        Write-Host 'Commands:'
        Write-Host '  /agent ask            Use common chat with automatic topic routing'
        Write-Host '  /agent weather        Use the current-conditions and forecast assistant'
        Write-Host '  /agent disaster       Use the disaster information assistant'
        Write-Host '  /agent fisheries      Use the fisheries information assistant'
        Write-Host '  /agent markets        Use the fish-market assistant'
        Write-Host '  /agent environment    Use the Palghar coastal environment assistant'
        Write-Host '  /location Palghar     Set the place context'
        Write-Host '  /clear                Clear conversation context'
        Write-Host '  /exit                 End the chat'
        continue
    }
    if ($line -match '^/clear$') {
        $history.Clear()
        $lastWeather = $null
        $lastAutoAgent = $Agent
        Write-Host 'Conversation context cleared.' -ForegroundColor DarkGray
        continue
    }
    if ($line -match '^/agent\s+(ask|weather|disaster|fisheries|markets|environment)$') {
        $Agent = $Matches[1]
        $history.Clear()
        $lastWeather = $null
        $lastAutoAgent = $Agent
        Write-Host "Switched to $($agentNames[$Agent]); conversation context cleared." -ForegroundColor DarkGray
        continue
    }
    if ($line -match '^/location\s+(.+)$') {
        $Location = $Matches[1].Trim()
        $history.Clear()
        $lastWeather = $null
        $lastAutoAgent = $Agent
        Write-Host "Location set to $Location; conversation context cleared." -ForegroundColor DarkGray
        continue
    }
    if ($line.StartsWith('/')) {
        Write-Host 'Unknown command. Type /help for available commands.' -ForegroundColor Yellow
        continue
    }

    $weatherMatch = [regex]::Match($line, '(?i)\b(?:in|near|around|for|at|of)\s+(?<place>[A-Za-z][A-Za-z .''-]*?)(?=\s+(?:rn|right now|currently|now|today|tomorrow|weather|wheather|temperature|temprature|temp|forecast)\b|[?.!,]|$)')
    $weatherQuestion = $line -match '(?i)\b(wh?eather|temperature|temprature|temp|humidity|wind|rain(?:fall)?)\b'
    $weatherPlace = if ($weatherMatch.Success) { $weatherMatch.Groups['place'].Value.Trim() } else { $Location }
    if ($weatherPlace -match '^chichani$') { $weatherPlace = 'Chinchani' }
    $marketQuestion = $line -match '(?i)\b(price|prices|market|markets|rate|rates|cost|auction|mackerel|mackrel|pomfret|prawn|shrimp|crab|sardine|surmai)\b'
    $fisheriesQuestion = $line -match '(?i)\b(fish|fisher|fisheries|fishing|pfz|catch|landing centre|landing center|closed[- ]season|fishing ban)\b'
    $environmentQuestion = $line -match '(?i)\b(environment|pollution|contamination|water quality|water pollution|shoreline|erosion|mangroves?|chlorophyll|ocean colou?r|sea surface temperature|sea temperature|ocean temperature|water temperature|coastal habitat|marine litter|oil spill|effluent|sewage|beach|bathing|swimming|wave(?:s)?(?: height| period)?|swell|tide height|ocean currents?|marine conditions|sea conditions)\b'
    $disasterQuestion = $line -match '(?i)\b(alert|warning|flood|cyclone|storm|high tide|disaster(?:s)?|evacuat|surge|coastal hazard|incident reports?)\b'
    if ($environmentQuestion) { $requestAgent = 'environment' }
    elseif ($weatherQuestion) { $requestAgent = 'weather' }
    elseif ($marketQuestion) { $requestAgent = 'markets' }
    elseif ($fisheriesQuestion) { $requestAgent = 'fisheries' }
    elseif ($disasterQuestion) { $requestAgent = 'disaster' }
    elseif ($history.Count -gt 0) { $requestAgent = $lastAutoAgent }
    else { $requestAgent = $Agent }
    $lastAutoAgent = $requestAgent
    $payloadObject = @{
        message = $line
        agent = $requestAgent
        location = @{ name = $weatherPlace; district = 'Palghar' }
        history = @($history.ToArray())
    }
    if ($weatherQuestion) {
        Write-Host "Checking current forecast data for $weatherPlace…" -ForegroundColor DarkGray
        $lastWeather = Get-WeatherContext -PlaceName $weatherPlace
        $payloadObject.weather = $lastWeather
        if ($lastWeather.available -and $null -ne $lastWeather.current.temperature_2m) {
            $temperature = $lastWeather.current.temperature_2m
            $unit = $lastWeather.current_units.temperature_2m
            $timestamp = $lastWeather.current.time
            $details = @("$temperature$unit at the $($lastWeather.location) forecast point as of $timestamp ($($lastWeather.timezone))")
            if ($null -ne $lastWeather.current.relative_humidity_2m) { $details += "humidity $($lastWeather.current.relative_humidity_2m)%" }
            if ($null -ne $lastWeather.current.wind_speed_10m) { $details += "wind $($lastWeather.current.wind_speed_10m) km/h" }
            $answer = "Open-Meteo reports $($details -join ', '). This is modelled weather data, not a street-level thermometer reading or an official warning."
            if ($line -match '(?i)\b(forecast|outlook|tomorrow|next\s+\d+\s+days?)\b') {
                $daily = $lastWeather.daily
                $forecastLines = @()
                for ($dayIndex = 0; $dayIndex -lt [Math]::Min(3, @($daily.time).Count); $dayIndex++) {
                    $parts = @()
                    if ($null -ne $daily.temperature_2m_max[$dayIndex]) { $parts += "high $($daily.temperature_2m_max[$dayIndex])°C" }
                    if ($null -ne $daily.temperature_2m_min[$dayIndex]) { $parts += "low $($daily.temperature_2m_min[$dayIndex])°C" }
                    if ($null -ne $daily.precipitation_probability_max[$dayIndex]) { $parts += "rain chance $($daily.precipitation_probability_max[$dayIndex])%" }
                    if ($parts.Count -gt 0) { $forecastLines += "$($daily.time[$dayIndex]): $($parts -join ', ')" }
                }
                if ($forecastLines.Count -gt 0) { $answer += " Next days: $($forecastLines -join '; ')." }
            }
        } else {
            $answer = "I couldn't retrieve weather for $weatherPlace. $($lastWeather.note)"
        }
        Write-Host "`nAquaPulse (Weather)" -ForegroundColor Cyan
        Write-Host $answer
        Write-Host 'Source: Open-Meteo · https://open-meteo.com/en/docs' -ForegroundColor DarkGray
        $history.Add(@{ role = 'user'; content = $line })
        $history.Add(@{ role = 'assistant'; content = $answer })
        Write-Host ''
        continue
    } elseif ($lastWeather -and $requestAgent -eq 'weather') {
        $payloadObject.weather = $lastWeather
    }

    $historicalReportQuestion = ($requestAgent -eq 'disaster') -and ($line -match '(?i)\b(report|reports|record|records|history|historical|occurred|happened|past|previous)\b')
    if ($historicalReportQuestion) {
        try {
            Write-Host 'Searching Palghar historical records…' -ForegroundColor DarkGray
            $recordsUri = "$baseUrl/api/history?q=Palghar"
            $recordResponse = Invoke-RestMethod -Uri $recordsUri -TimeoutSec 30
            $districtRecords = @($recordResponse.records | Where-Object {
                $_.type -match '(?i)rainfall|cyclone|flood|storm|disaster|coastal'
            } | Sort-Object date -Descending)
            Write-Host "`nAquaPulse (Disaster · Past records)" -ForegroundColor Cyan
            if ($districtRecords.Count -eq 0) {
                Write-Host 'No matching historical Palghar disaster or rainfall records were found in the bundled records.'
            } else {
                Write-Host 'Historical source records for Palghar district (these are not current alerts):'
                foreach ($record in $districtRecords) {
                    Write-Host "`n$($record.date) · $($record.locality) · $($record.title)"
                    Write-Host $record.summary
                    if ($record.source_url) { Write-Host "Source: $($record.source_title) · $($record.source_url)" -ForegroundColor DarkGray }
                }
            }
            Write-Host "`nHistorical records describe past observations/notices. For current warnings, check NDMA SACHET or IMD."
            $history.Add(@{ role = 'user'; content = $line })
            $history.Add(@{ role = 'assistant'; content = 'Displayed source-checked historical Palghar rainfall and cyclone records; these are not current warnings.' })
            Write-Host ''
        } catch {
            Write-Host ('Could not retrieve historical records: ' + $_.Exception.Message) -ForegroundColor Red
        }
        continue
    }
    $payload = $payloadObject | ConvertTo-Json -Depth 8
    # Windows PowerShell 5.1 can encode a JSON string body using a legacy
    # code page when the content type omits its charset. Weather history often
    # contains °C/degree symbols; send explicit UTF-8 bytes to prevent HTTP 400.
    $payloadBytes = [System.Text.Encoding]::UTF8.GetBytes($payload)

    try {
        Write-Host 'AquaPulse is thinking…' -ForegroundColor DarkGray
        $result = Invoke-RestMethod -Uri "$baseUrl/api/chat" -Method Post -ContentType 'application/json; charset=utf-8' -Body $payloadBytes -TimeoutSec 300
        Write-Host "`nAquaPulse ($($agentNames[$requestAgent]))" -ForegroundColor Cyan
        Write-Host $result.answer
        if ($result.sources) {
            Write-Host "`nSources:" -ForegroundColor DarkGray
            foreach ($source in $result.sources) {
                if ($source.url) { Write-Host "  [$($source.citation)] $($source.title) — $($source.url)" -ForegroundColor DarkGray }
            }
        }
        $history.Add(@{ role = 'user'; content = $line })
        $history.Add(@{ role = 'assistant'; content = [string]$result.answer })
        Write-Host ''
    } catch {
        $errorText = $_.Exception.Message
        if ($_.Exception.Response) {
            try {
                $responseStream = $_.Exception.Response.GetResponseStream()
                $responseReader = [System.IO.StreamReader]::new($responseStream)
                $responseBody = $responseReader.ReadToEnd()
                if ($responseBody) {
                    try {
                        $errorObject = $responseBody | ConvertFrom-Json
                        if ($errorObject.detail) { $errorText = [string]$errorObject.detail } else { $errorText = $responseBody }
                    } catch { $errorText = $responseBody }
                }
            } catch { }
        }
        Write-Host ('Could not get an answer: ' + $errorText) -ForegroundColor Red
        Write-Host 'You can retry the question, or type /exit to leave.' -ForegroundColor DarkGray
    }
}

Write-Host 'AquaPulse chat ended.' -ForegroundColor DarkGray
