# PS 5.1 UTF-8 JSON-body regression check for AquaPulse
$degree = [char]0x00B0
$payloadObject = @{
    message = 'Tell me what is happening in the ocean near Palghar.'
    agent = 'fisheries'
    history = @(
        @{ role = 'user'; content = 'What is the temperature in Palghar?' },
        @{ role = 'assistant'; content = ('26.2' + $degree + 'C at the Palghar forecast point.') }
    )
}
$payloadJson = $payloadObject | ConvertTo-Json -Depth 8
$payloadBytes = [System.Text.Encoding]::UTF8.GetBytes($payloadJson)
$result = Invoke-RestMethod -Uri 'http://127.0.0.1:8001/api/chat' -Method Post -ContentType 'application/json; charset=utf-8' -Body $payloadBytes -TimeoutSec 60
"HTTP request succeeded; model route: $($result.model)"
"Answer: $($result.answer)"

