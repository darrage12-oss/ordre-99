# Serveur Web Local pour Ordre de Mission SRM TTA
# Fonctionne sur toutes les versions de Windows sans installer aucun logiciel tiers

$port = 8080
$root = $PSScriptRoot

# Detection de l'adresse IP locale Wi-Fi
$wifiIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -like "*Wi-Fi*" -and $_.IPAddress -notlike "169.254*" }).IPAddress
if (-not $wifiIp) {
    $wifiIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -notlike "169.254*" } | Select-Object -First 1).IPAddress
}
if (-not $wifiIp) { $wifiIp = "127.0.0.1" }

$localUrl = "http://localhost:$port"
$phoneUrl = "http://$($wifiIp):$port"

Clear-Host
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "     APPLICATION ORDRE DE MISSION SRM TTA - SERVEUR ACTIF       " -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " [1] LIEN POUR VOTRE PC :" -ForegroundColor Green
Write-Host "     $localUrl" -ForegroundColor White
Write-Host ""
Write-Host " [2] LIEN POUR VOTRE TELEPHONE PORTABLE :" -ForegroundColor Green
Write-Host "     $phoneUrl" -ForegroundColor Yellow
Write-Host ""
Write-Host "     * Assurez-vous que le telephone est connecte au Wi-Fi." -ForegroundColor Gray
Write-Host "     * La synchronisation s'effectue automatiquement en direct !" -ForegroundColor Cyan
Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host " Serveur en cours d'execution... (Ne fermez PAS cette fenetre)" -ForegroundColor DarkGray
Write-Host "================================================================" -ForegroundColor Cyan

# Ouvrir le navigateur PC automatiquement
Start-Process $localUrl

# Demarrage du serveur HTTP TcpListener
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $port)
$listener.Start()

$mimeMap = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".svg"  = "image/svg+xml"
    ".woff" = "font/woff"
    ".woff2"= "font/woff2"
    ".ttf"  = "font/ttf"
}

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        [System.Threading.Tasks.Task]::Run({
            param($tcp)
            try {
                $stream = $tcp.GetStream()
                $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::UTF8)
                $firstLine = $reader.ReadLine()
                if (-not $firstLine) { $tcp.Close(); return }

                $parts = $firstLine.Split(" ")
                if ($parts.Length -lt 2) { $tcp.Close(); return }
                $reqPath = $parts[1].Split("?")[0]
                if ($reqPath -eq "/" -or $reqPath -eq "") { $reqPath = "/index.html" }

                $filePath = [System.IO.Path]::Combine($root, $reqPath.TrimStart("/").Replace("/", [System.IO.Path]::DirectorySeparatorChar))

                if ([System.IO.File]::Exists($filePath)) {
                    $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                    $contentType = if ($mimeMap.ContainsKey($ext)) { $mimeMap[$ext] } else { "application/octet-stream" }
                    $bytes = [System.IO.File]::ReadAllBytes($filePath)

                    $header = "HTTP/1.1 200 OK`r`nContent-Type: $contentType`r`nContent-Length: $($bytes.Length)`r`nAccess-Control-Allow-Origin: *`r`nConnection: close`r`n`r`n"
                    $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($header)

                    $stream.Write($headerBytes, 0, $headerBytes.Length)
                    $stream.Write($bytes, 0, $bytes.Length)
                } else {
                    $notFound = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain`r`nContent-Length: 9`r`nConnection: close`r`n`r`nNot Found"
                    $nBytes = [System.Text.Encoding]::UTF8.GetBytes($notFound)
                    $stream.Write($nBytes, 0, $nBytes.Length)
                }
                $stream.Flush()
            } catch {
            } finally {
                $tcp.Close()
            }
        }.GetNewClosure(), $client) | Out-Null
    }
} finally {
    $listener.Stop()
}
