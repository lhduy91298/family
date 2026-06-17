$keys = @{}
Get-Content "keys.txt" | ForEach-Object {
    if ($_ -match "^([^=]+)=(.*)$") {
        $keys[$matches[1].Trim()] = $matches[2].Trim()
    }
}

# ⚠️ Luôn dùng API Token từ keys.txt — không dùng OAuth session của account khác
$env:CLOUDFLARE_API_TOKEN = $keys["CF_API_TOKEN"]
$env:CLOUDFLARE_ACCOUNT_ID = $keys["CF_ACCOUNT_ID"]

Write-Host "--- DEPLOYING WORKER (account: lhduy91298) ---"
cd worker
npm install

$secretNames = @("SUPABASE_URL", "SUPABASE_SERVICE_KEY", "TELEGRAM_BOT_TOKEN", "HUSBAND_ID", "APPSCRIPT_WEBHOOK_URL", "WIFE_EMAIL")
foreach ($name in $secretNames) {
    $val = $keys[$name]
    Write-Host "Setting secret: $name"
    Write-Output $val | npx wrangler secret put $name
}

Write-Host "Deploying Worker..."
npx wrangler deploy
cd ..

Write-Host "--- SETTING WEBHOOK ---"
$accountName = $keys["CF_ACCOUNT_NAME"] -replace '\.workers\.dev$', ''
$workerUrl = "https://family-expense-bot.$accountName.workers.dev"
$token = $keys["TELEGRAM_BOT_TOKEN"]
$webhookUrl = "https://api.telegram.org/bot$token/setWebhook?url=$workerUrl"
$resp = Invoke-RestMethod -Uri $webhookUrl -Method Get
Write-Host "Webhook Response: " ($resp | ConvertTo-Json)

Write-Host "--- DEPLOYING WEB DASHBOARD (account: lhduy91298) ---"
cd web
npm install
$env:VITE_SUPABASE_URL = $keys["SUPABASE_URL"]
$env:VITE_SUPABASE_ANON_KEY = $keys["SUPABASE_ANON_KEY"]
$env:CLOUDFLARE_API_TOKEN = $keys["CF_API_TOKEN"]
$env:CLOUDFLARE_ACCOUNT_ID = $keys["CF_ACCOUNT_ID"]
npm run build
npx wrangler pages project create xay-chuong --production-branch main 2>$null
npx wrangler pages deploy dist --project-name xay-chuong --branch main
cd ..
