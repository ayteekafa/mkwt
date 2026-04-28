param(
  [int]$Port = 8788
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Write-JsonResponse {
  param(
    [System.Net.HttpListenerResponse]$Response,
    [int]$StatusCode,
    [object]$Payload
  )

  $json = $Payload | ConvertTo-Json -Depth 8 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $Response.StatusCode = $StatusCode
  $Response.ContentType = "application/json; charset=utf-8"
  $Response.ContentLength64 = $bytes.Length
  $Response.Headers["Access-Control-Allow-Origin"] = "*"
  $Response.Headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
  $Response.Headers["Access-Control-Allow-Headers"] = "content-type"
  $Response.Headers["Cache-Control"] = "no-store"
  $Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $Response.Close()
}

$listener = [System.Net.HttpListener]::new()
$prefix = "http://127.0.0.1:$Port/"
$listener.Prefixes.Add($prefix)
$listener.Start()

Write-Host "MKWT local proxy running at $prefix"
Write-Host "Open your Live Server page and press Update data. Press Ctrl+C here to stop."

function Clean-Text {
  param([string]$Value)
  return (($Value -replace "<[^>]+>", " ") -replace "\s+", " ").Trim()
}

function Get-MkcentralOptions {
  $indexUrl = "https://lounge.mkcentral.com/mkworld?season=2&p=12"
  $indexHtml = (Invoke-WebRequest -Uri $indexUrl -Headers @{
    "User-Agent" = "MKWT local Lounge Stats sync"
    "Accept" = "text/html,application/xhtml+xml"
  } -UseBasicParsing).Content

  $seasonMap = [ordered]@{}
  foreach ($match in [regex]::Matches($indexHtml, 'href="/mkworld\?season=(\d+)"[^>]*>([\s\S]*?)</a>', 'IgnoreCase')) {
    $season = $match.Groups[1].Value
    $label = Clean-Text $match.Groups[2].Value
    if (-not $label) { $label = if ($season -eq "0") { "Preseason" } else { "Season $season" } }
    $seasonMap[$season] = $label
  }
  if ($seasonMap.Count -eq 0) {
    $seasonMap["0"] = "Preseason"
    $seasonMap["1"] = "Season 1"
    $seasonMap["2"] = "Season 2"
  }

  $options = @()
  foreach ($season in ($seasonMap.Keys | Sort-Object {[int]$_})) {
    $html = $indexHtml
    if ($season -ne "2") {
      $html = (Invoke-WebRequest -Uri "https://lounge.mkcentral.com/mkworld?season=$season" -Headers @{
        "User-Agent" = "MKWT local Lounge Stats sync"
        "Accept" = "text/html,application/xhtml+xml"
      } -UseBasicParsing).Content
    }
    $counts = @()
    foreach ($m in [regex]::Matches($html, "href=""/mkworld\?season=$season(?:&amp;|&)p=(12|24)""", 'IgnoreCase')) {
      $counts += $m.Groups[1].Value
    }
    $counts = $counts | Select-Object -Unique | Sort-Object {[int]$_}
    if ($counts.Count -gt 0) {
      foreach ($count in $counts) {
        $options += @{ season = $season; seasonName = $seasonMap[$season]; playerCount = $count; split = $true }
      }
    } else {
      $options += @{ season = $season; seasonName = $seasonMap[$season]; playerCount = "12"; split = $false }
    }
  }

  return $options
}

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response

    if ($req.HttpMethod -eq "OPTIONS") {
      $res.StatusCode = 204
      $res.Headers["Access-Control-Allow-Origin"] = "*"
      $res.Headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
      $res.Headers["Access-Control-Allow-Headers"] = "content-type"
      $res.Close()
      continue
    }

    if (
      $req.Url.AbsolutePath -ne "/api/mkcentral-player" -and
      $req.Url.AbsolutePath -ne "/api/mkcentral-table" -and
      $req.Url.AbsolutePath -ne "/api/mkcentral-options" -and
      $req.Url.AbsolutePath -ne "/api/time-trial-index" -and
      $req.Url.AbsolutePath -ne "/api/time-trial-track"
    ) {
      Write-JsonResponse -Response $res -StatusCode 404 -Payload @{ ok = $false; error = "Not found." }
      continue
    }

    if ($req.Url.AbsolutePath -eq "/api/mkcentral-options") {
      try {
        Write-JsonResponse -Response $res -StatusCode 200 -Payload @{ ok = $true; options = @(Get-MkcentralOptions) }
      } catch {
        Write-JsonResponse -Response $res -StatusCode 502 -Payload @{ ok = $false; error = $_.Exception.Message }
      }
      continue
    }

    if ($req.Url.AbsolutePath -eq "/api/time-trial-index") {
      $target = "https://mkwrs.com/mkworld/"
      try {
        $html = (Invoke-WebRequest -Uri $target -Headers @{
          "User-Agent" = "MKWT local Time Trial sync"
          "Accept" = "text/html,application/xhtml+xml"
        } -UseBasicParsing).Content

        Write-JsonResponse -Response $res -StatusCode 200 -Payload @{
          ok = $true
          url = $target
          fetched_at = (Get-Date).ToUniversalTime().ToString("o")
          html = $html
        }
      } catch {
        Write-JsonResponse -Response $res -StatusCode 502 -Payload @{
          ok = $false
          error = $_.Exception.Message
          url = $target
        }
      }
      continue
    }

    if ($req.Url.AbsolutePath -eq "/api/time-trial-track") {
      $track = [string]$req.QueryString["track"]
      if ([string]::IsNullOrWhiteSpace($track) -or $track.Length -gt 120) {
        Write-JsonResponse -Response $res -StatusCode 400 -Payload @{ ok = $false; error = "Invalid track name." }
        continue
      }

      $encodedTrack = [System.Uri]::EscapeDataString($track)
      $target = "https://mkwrs.com/mkworld/display.php?track=$encodedTrack"
      try {
        $html = (Invoke-WebRequest -Uri $target -Headers @{
          "User-Agent" = "MKWT local Time Trial sync"
          "Accept" = "text/html,application/xhtml+xml"
        } -UseBasicParsing).Content

        Write-JsonResponse -Response $res -StatusCode 200 -Payload @{
          ok = $true
          url = $target
          fetched_at = (Get-Date).ToUniversalTime().ToString("o")
          html = $html
        }
      } catch {
        Write-JsonResponse -Response $res -StatusCode 502 -Payload @{
          ok = $false
          error = $_.Exception.Message
          url = $target
        }
      }
      continue
    }

    if ($req.Url.AbsolutePath -eq "/api/mkcentral-player") {
      $playerId = [string]$req.QueryString["playerId"]
      $seasonParam = [string]$req.QueryString["season"]
      $pParam = [string]$req.QueryString["p"]
      $season = if ([string]::IsNullOrWhiteSpace($seasonParam)) { "2" } else { $seasonParam }
      $p = if ([string]::IsNullOrWhiteSpace($pParam)) { "" } else { $pParam }

      if ($playerId -notmatch "^\d{1,10}$") {
        Write-JsonResponse -Response $res -StatusCode 400 -Payload @{ ok = $false; error = "Invalid MKCentral player ID." }
        continue
      }
      if ($season -notmatch "^\d{1,4}$") {
        Write-JsonResponse -Response $res -StatusCode 400 -Payload @{ ok = $false; error = "Invalid MKCentral season." }
        continue
      }
      if ($p -and $p -ne "12" -and $p -ne "24") {
        Write-JsonResponse -Response $res -StatusCode 400 -Payload @{ ok = $false; error = "Invalid MKCentral player count." }
        continue
      }

      $target = "https://lounge.mkcentral.com/mkworld/PlayerDetails/$playerId`?season=$season"
      if ($p) { $target += "&p=$p" }
    } else {
      $tableId = [string]$req.QueryString["tableId"]
      if ($tableId -notmatch "^\d{1,12}$") {
        Write-JsonResponse -Response $res -StatusCode 400 -Payload @{ ok = $false; error = "Invalid MKCentral table ID." }
        continue
      }

      $target = "https://lounge.mkcentral.com/mkworld/TableDetails/$tableId"
    }

    try {
      $html = (Invoke-WebRequest -Uri $target -Headers @{
        "User-Agent" = "MKWT local Lounge Stats sync"
        "Accept" = "text/html,application/xhtml+xml"
      } -UseBasicParsing).Content

      Write-JsonResponse -Response $res -StatusCode 200 -Payload @{
        ok = $true
        url = $target
        fetched_at = (Get-Date).ToUniversalTime().ToString("o")
        html = $html
      }
    } catch {
      Write-JsonResponse -Response $res -StatusCode 502 -Payload @{
        ok = $false
        error = $_.Exception.Message
        url = $target
      }
    }
  }
} finally {
  if ($listener.IsListening) {
    $listener.Stop()
  }
  $listener.Close()
}
