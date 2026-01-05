# Quick script to set all Wrangler secrets
Write-Host "================================" -ForegroundColor Cyan
Write-Host "  Setting Wrangler Secrets" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Load from .env file
$envPath = "..\\.env"
if (Test-Path $envPath) {
    Get-Content $envPath | ForEach-Object {
        if ($_ -match '^([^#].+?)=(.+)$') {
            Set-Variable -Name $matches[1] -Value $matches[2]
        }
    }
}

# 1. Telegram Bot Token
Write-Host "1. Setting TELEGRAM_BOT_TOKEN..." -ForegroundColor Yellow
if ($BOT_TOKEN) {
    Write-Host "   Using token from .env: $BOT_TOKEN" -ForegroundColor Gray
    echo $BOT_TOKEN | wrangler secret put TELEGRAM_BOT_TOKEN
} else {
    Write-Host "   Please enter your Telegram bot token:" -ForegroundColor White
    wrangler secret put TELEGRAM_BOT_TOKEN
}

Write-Host ""

# 2. Groq API Key
Write-Host "2. Setting GROQ_API_KEY..." -ForegroundColor Yellow
Write-Host "   Get your free API key from: https://console.groq.com/keys" -ForegroundColor Gray
Write-Host "   Please enter your Groq API key:" -ForegroundColor White
wrangler secret put GROQ_API_KEY

Write-Host ""

# 3. Google Apps Script URL
Write-Host "3. Setting GAS_WEBAPP_URL..." -ForegroundColor Yellow
if ($APPS_SCRIPT_URL) {
    Write-Host "   Using URL from .env: $APPS_SCRIPT_URL" -ForegroundColor Gray
    echo $APPS_SCRIPT_URL | wrangler secret put GAS_WEBAPP_URL
} else {
    Write-Host "   Please enter your Google Apps Script URL:" -ForegroundColor White
    wrangler secret put GAS_WEBAPP_URL
}

Write-Host ""
Write-Host "================================" -ForegroundColor Green
Write-Host "  All secrets set!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next step: wrangler deploy" -ForegroundColor Yellow
