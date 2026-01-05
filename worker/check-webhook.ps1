# Check and set Telegram webhook

Write-Host "================================" -ForegroundColor Cyan
Write-Host "  Telegram Webhook Checker" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Get bot token
Write-Host "Please enter your TELEGRAM_BOT_TOKEN:" -ForegroundColor Yellow
$token = Read-Host

if ([string]::IsNullOrEmpty($token)) {
    Write-Host "Error: No token provided" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Checking webhook status..." -ForegroundColor Cyan

try {
    $webhookInfo = Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/getWebhookInfo"
    
    Write-Host ""
    Write-Host "Webhook URL: " -NoNewline
    if ([string]::IsNullOrEmpty($webhookInfo.result.url)) {
        Write-Host "NOT SET" -ForegroundColor Red
    } else {
        Write-Host "$($webhookInfo.result.url)" -ForegroundColor Green
    }
    
    Write-Host "Pending update count: $($webhookInfo.result.pending_update_count)" -ForegroundColor Yellow
    Write-Host "Max connections: $($webhookInfo.result.max_connections)" -ForegroundColor Gray
    
    if ($webhookInfo.result.last_error_message) {
        Write-Host "Last error: $($webhookInfo.result.last_error_message)" -ForegroundColor Red
        Write-Host "Last error date: $(Get-Date -UnixTimeSeconds $webhookInfo.result.last_error_date)" -ForegroundColor Red
    } else {
        Write-Host "No errors!" -ForegroundColor Green
    }
    
    Write-Host ""
    
    # If webhook not set, offer to set it
    if ([string]::IsNullOrEmpty($webhookInfo.result.url)) {
        Write-Host "Would you like to set the webhook now? (Y/N): " -ForegroundColor Yellow -NoNewline
        $response = Read-Host
        
        if ($response -eq "Y" -or $response -eq "y") {
            $workerUrl = "https://c4lendar-worker.calendar-bot.workers.dev/telegram-webhook"
            Write-Host "Setting webhook to: $workerUrl" -ForegroundColor Cyan
            
            $body = @{
                url = $workerUrl
            } | ConvertTo-Json
            
            $result = Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/setWebhook" `
                                       -Method Post `
                                       -ContentType "application/json" `
                                       -Body $body
            
            if ($result.ok) {
                Write-Host "Webhook set successfully!" -ForegroundColor Green
            } else {
                Write-Host "Failed to set webhook: $($result.description)" -ForegroundColor Red
            }
        }
    }
    
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
    Write-Host "Make sure your bot token is correct." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
