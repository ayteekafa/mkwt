param(
  [string]$DataPath = (Join-Path $PSScriptRoot "..\\combo_builder_data.json"),
  [string]$OutputRoot = (Join-Path $PSScriptRoot "..\\combo-icons"),
  [string]$ManifestPath = (Join-Path $PSScriptRoot "..\\combo_icon_map.json"),
  [string]$WorkbookUrl = "https://docs.google.com/spreadsheets/d/1EQd2XYGlB3EFFNE-35hFLaBzJo4cipU9DZT4MRSjBlc/export?format=xlsx",
  [string]$TempWorkbookPath = (Join-Path ([System.IO.Path]::GetTempPath()) "mkwt_tmp_combo_sheet_download.xlsx")
)

$ErrorActionPreference = "Stop"

$CharacterAliasMap = @{
  "Swooper"  = "Swoop"
  "Fishbone" = "Fish Bone"
}

$VehicleAliasMap = @{
  "B-Dasher" = "B Dasher"
}

function Canonicalize-Name([string]$Name, $AliasMap) {
  $text = ([string]$Name).Trim()
  if (-not $text) { return "" }
  if ($AliasMap.ContainsKey($text)) { return $AliasMap[$text] }
  return $text
}

function Get-ColumnName([int]$ZeroBasedIndex) {
  $n = $ZeroBasedIndex + 1
  $result = ""
  while ($n -gt 0) {
    $remainder = ($n - 1) % 26
    $result = [char](65 + $remainder) + $result
    $n = [Math]::Floor(($n - 1) / 26)
  }
  return $result
}

function Get-CellMap($Zip, [string]$WorksheetPath, $SharedStrings) {
  $entry = $Zip.GetEntry($WorksheetPath)
  if (-not $entry) { throw "Worksheet not found: $WorksheetPath" }
  $reader = New-Object System.IO.StreamReader($entry.Open())
  [xml]$sheetXml = $reader.ReadToEnd()
  $reader.Close()

  $map = @{}
  foreach ($row in $sheetXml.worksheet.sheetData.row) {
    foreach ($cell in $row.c) {
      $ref = [string]$cell.r
      if (-not $ref) { continue }
      $value = ""
      if ([string]$cell.t -eq "s" -and $cell.v -ne $null) {
        $index = [int]$cell.v
        if ($index -ge 0 -and $index -lt $SharedStrings.Count) {
          $value = [string]$SharedStrings[$index]
        }
      } elseif ($cell.is -and $cell.is.t) {
        $value = [string]$cell.is.t
      } elseif ($cell.v -ne $null) {
        $value = [string]$cell.v
      }
      if ($value) {
        $map[$ref] = $value.Trim()
      }
    }
  }
  return $map
}

function Get-DrawingRelationMap($Zip, [string]$DrawingRelsPath) {
  $entry = $Zip.GetEntry($DrawingRelsPath)
  if (-not $entry) { throw "Drawing rels not found: $DrawingRelsPath" }
  $reader = New-Object System.IO.StreamReader($entry.Open())
  [xml]$relsXml = $reader.ReadToEnd()
  $reader.Close()

  $rels = @{}
  foreach ($rel in $relsXml.Relationships.Relationship) {
    $target = [string]$rel.Target
    $resolved = $target -replace '^\.\./media/', 'xl/media/'
    if ($resolved -notlike 'xl/*') {
      $resolved = "xl/drawings/$resolved"
    }
    $rels[[string]$rel.Id] = $resolved
  }
  return $rels
}

function Get-DrawingAnchors($Zip, [string]$DrawingPath) {
  $entry = $Zip.GetEntry($DrawingPath)
  if (-not $entry) { throw "Drawing not found: $DrawingPath" }
  $reader = New-Object System.IO.StreamReader($entry.Open())
  $xmlText = $reader.ReadToEnd()
  $reader.Close()

  $pattern = '<xdr:oneCellAnchor>.*?<xdr:from><xdr:col>(\d+)</xdr:col>.*?<xdr:row>(\d+)</xdr:row>.*?r:embed="([^"]+)".*?</xdr:oneCellAnchor>'
  $matches = [regex]::Matches($xmlText, $pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
  $anchors = @()
  foreach ($match in $matches) {
    $anchors += [pscustomobject]@{
      ColIndex = [int]$match.Groups[1].Value
      RowIndex = [int]$match.Groups[2].Value
      RelId    = [string]$match.Groups[3].Value
    }
  }
  return $anchors
}

function Download-Workbook([string]$Url, [string]$OutPath) {
  Add-Type -AssemblyName System.Net.Http
  $handler = New-Object System.Net.Http.HttpClientHandler
  $client = New-Object System.Net.Http.HttpClient($handler)
  $client.Timeout = [TimeSpan]::FromMinutes(5)
  try {
    $response = $client.GetAsync($Url).Result
    if (-not $response.IsSuccessStatusCode) {
      throw "Workbook download failed with HTTP $([int]$response.StatusCode)"
    }
    $bytes = $response.Content.ReadAsByteArrayAsync().Result
    [System.IO.File]::WriteAllBytes($OutPath, $bytes)
  } finally {
    $client.Dispose()
  }
}

if (-not (Test-Path $DataPath)) {
  throw "Data file not found: $DataPath"
}

$data = Get-Content -LiteralPath $DataPath -Raw | ConvertFrom-Json

$characterDir = Join-Path $OutputRoot "characters"
$vehicleDir = Join-Path $OutputRoot "vehicles"
New-Item -ItemType Directory -Force -Path $characterDir | Out-Null
New-Item -ItemType Directory -Force -Path $vehicleDir | Out-Null
Get-ChildItem -Path $characterDir -ErrorAction SilentlyContinue | Remove-Item -Force
Get-ChildItem -Path $vehicleDir -ErrorAction SilentlyContinue | Remove-Item -Force

Download-Workbook -Url $WorkbookUrl -OutPath $TempWorkbookPath

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($TempWorkbookPath)
try {
  $sharedEntry = $zip.GetEntry("xl/sharedStrings.xml")
  $reader = New-Object System.IO.StreamReader($sharedEntry.Open())
  [xml]$sharedXml = $reader.ReadToEnd()
  $reader.Close()

  $sharedStrings = @(
    $sharedXml.sst.si | ForEach-Object {
      if ($_.t) { [string]$_.t }
      elseif ($_.r) { (@($_.r | ForEach-Object { [string]$_.t }) -join "") }
      else { "" }
    }
  )

  $characterByName = @{}
  foreach ($entry in $data.characters) {
    $characterByName[[string]$entry.name] = $entry
  }
  $vehicleByName = @{}
  foreach ($entry in $data.vehicles) {
    $vehicleByName[[string]$entry.name] = $entry
  }

  $jobs = @(
    [pscustomobject]@{
      Type          = "character"
      WorksheetPath = "xl/worksheets/sheet2.xml"
      DrawingPath   = "xl/drawings/drawing2.xml"
      DrawingRels   = "xl/drawings/_rels/drawing2.xml.rels"
      AliasMap      = $CharacterAliasMap
      KnownMap      = $characterByName
      OutputDir     = $characterDir
    },
    [pscustomobject]@{
      Type          = "vehicle"
      WorksheetPath = "xl/worksheets/sheet3.xml"
      DrawingPath   = "xl/drawings/drawing3.xml"
      DrawingRels   = "xl/drawings/_rels/drawing3.xml.rels"
      AliasMap      = $VehicleAliasMap
      KnownMap      = $vehicleByName
      OutputDir     = $vehicleDir
    }
  )

  $manifest = [ordered]@{
    generatedAt = [DateTime]::UtcNow.ToString("o")
    sourceData = "combo_builder_data.json"
    sourceWorkbook = $WorkbookUrl
    characters = [ordered]@{}
    vehicles = [ordered]@{}
  }

  foreach ($job in $jobs) {
    $cellMap = Get-CellMap -Zip $zip -WorksheetPath $job.WorksheetPath -SharedStrings $sharedStrings
    $drawingMap = Get-DrawingRelationMap -Zip $zip -DrawingRelsPath $job.DrawingRels
    $anchors = Get-DrawingAnchors -Zip $zip -DrawingPath $job.DrawingPath

    foreach ($anchor in $anchors) {
      $cellRef = "{0}{1}" -f (Get-ColumnName $anchor.ColIndex), ($anchor.RowIndex + 2)
      $rawName = [string]($cellMap[$cellRef])
      if (-not $rawName) { continue }
      $canonicalName = Canonicalize-Name -Name $rawName -AliasMap $job.AliasMap
      if (-not $job.KnownMap.ContainsKey($canonicalName)) { continue }

      $entity = $job.KnownMap[$canonicalName]
      $slug = [string]$entity.slug
      if (-not $slug) { continue }

      $mediaEntryPath = $drawingMap[$anchor.RelId]
      if (-not $mediaEntryPath) { continue }
      $mediaEntry = $zip.GetEntry($mediaEntryPath)
      if (-not $mediaEntry) { continue }

      $ext = [System.IO.Path]::GetExtension($mediaEntry.Name)
      if (-not $ext) { $ext = ".png" }
      $dest = Join-Path $job.OutputDir ($slug + $ext)
      [System.IO.Compression.ZipFileExtensions]::ExtractToFile($mediaEntry, $dest, $true)

      $record = [ordered]@{
        name = [string]$entity.name
        slug = $slug
        path = "combo-icons/$($job.Type)s/$slug$ext"
      }
      if ($job.Type -eq "character") {
        $manifest.characters[$slug] = $record
      } else {
        $manifest.vehicles[$slug] = $record
      }
    }
  }

  $manifestJson = $manifest | ConvertTo-Json -Depth 10
  [System.IO.File]::WriteAllText($ManifestPath, $manifestJson, [System.Text.UTF8Encoding]::new($false))
}
finally {
  $zip.Dispose()
  if (Test-Path -LiteralPath $TempWorkbookPath) {
    Remove-Item -LiteralPath $TempWorkbookPath -Force -ErrorAction SilentlyContinue
  }
}

Write-Output "Generated real combo icons from workbook media."
Write-Output "Characters: $((Get-ChildItem $characterDir | Measure-Object).Count)"
Write-Output "Vehicles: $((Get-ChildItem $vehicleDir | Measure-Object).Count)"
Write-Output "Manifest: $ManifestPath"
