$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$pythonPath = Join-Path $env:USERPROFILE 'miniforge3\envs\delta-watch\python.exe'
$ollamaPath = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) {
    throw "Delta Watch Python environment not found at $pythonPath."
}
if (-not (Test-Path -LiteralPath $ollamaPath)) {
    throw "Ollama was not found at $ollamaPath. Install/start Ollama, then run this file again."
}

$envPath = Split-Path -Parent $pythonPath
$env:GDAL_DATA = Join-Path $envPath 'Library\share\gdal'
$env:PROJ_LIB = Join-Path $envPath 'Library\share\proj'
$env:PATH = (Join-Path $envPath 'Library\bin') + ';' + $env:PATH
$env:CHAT_MODEL = 'llama3.2:3b'
$env:EMBED_MODEL = 'mxbai-embed-large'
$port = 8765
if ($env:AQUAPULSE_PORT) {
    try { $port = [int]$env:AQUAPULSE_PORT } catch { throw 'AQUAPULSE_PORT must be a number between 1 and 65535.' }
    if ($port -lt 1 -or $port -gt 65535) { throw 'AQUAPULSE_PORT must be a number between 1 and 65535.' }
}
if (-not $env:CHAT_PROVIDER) {
    $env:CHAT_PROVIDER = if ($env:GEMINI_API_KEY) { 'gemini' } else { 'local' }
}

$ollamaReady = $false
try {
    Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2 | Out-Null
    $ollamaReady = $true
} catch { }

if (-not $ollamaReady) {
    Start-Process -FilePath $ollamaPath -ArgumentList 'serve' -WindowStyle Hidden
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Seconds 1
        try {
            Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2 | Out-Null
            $ollamaReady = $true
            break
        } catch { }
    }
}

if (-not $ollamaReady) {
    throw 'Ollama did not start. Open the Ollama app and run this file again.'
}

& $pythonPath -m uvicorn assistant_app:app --host 127.0.0.1 --port $port --reload
