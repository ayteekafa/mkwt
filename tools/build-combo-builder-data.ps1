param(
  [string]$OutputPath = (Join-Path $PSScriptRoot "..\\combo_builder_data.json")
)

$ErrorActionPreference = "Stop"

$SpreadsheetId = "1EQd2XYGlB3EFFNE-35hFLaBzJo4cipU9DZT4MRSjBlc"
$SheetBase = "https://docs.google.com/spreadsheets/d/$SpreadsheetId/gviz/tq?tqx=out:json&sheet="

$CharacterAliases = @{
  "Swooper"  = "Swoop"
  "Fishbone" = "Fish Bone"
}

$VehicleAliases = @{
  "B-Dasher" = "B Dasher"
}

function Get-CellText($cell) {
  if ($null -eq $cell) { return "" }
  if ($null -ne $cell.f -and [string]::IsNullOrWhiteSpace([string]$cell.f) -eq $false) { return [string]$cell.f }
  if ($null -ne $cell.v -and [string]::IsNullOrWhiteSpace([string]$cell.v) -eq $false) { return [string]$cell.v }
  return ""
}

function Get-RowValues($row) {
  $values = @()
  foreach ($cell in ($row.c | ForEach-Object { $_ })) {
    $values += (Get-CellText $cell)
  }
  return ,$values
}

function Get-GvizJson([string]$SheetName) {
  $url = $SheetBase + [uri]::EscapeDataString($SheetName)
  $text = (Invoke-WebRequest $url -UseBasicParsing).Content
  $start = $text.IndexOf("{")
  $end = $text.LastIndexOf("}")
  if ($start -lt 0 -or $end -le $start) {
    throw "Could not parse GViz response for sheet '$SheetName'."
  }
  return ($text.Substring($start, $end - $start + 1) | ConvertFrom-Json)
}

function Normalize-Text([string]$Value) {
  return (($Value -replace "\s+", " ").Trim())
}

function Canonicalize-Name([string]$Value, [hashtable]$AliasMap) {
  $text = Normalize-Text $Value
  if ([string]::IsNullOrWhiteSpace($text)) { return "" }
  if ($AliasMap.ContainsKey($text)) { return $AliasMap[$text] }
  return $text
}

function Normalize-Tag([string]$Value) {
  return (Normalize-Text $Value) -replace "`n", " "
}

function Make-Slug([string]$Value) {
  $text = (Normalize-Text $Value).ToLowerInvariant()
  $text = $text -replace "[^a-z0-9]+", "-"
  return ($text -replace "^-+|-+$", "")
}

function To-IntValue([string]$Value) {
  $text = Normalize-Text $Value
  if ([string]::IsNullOrWhiteSpace($text)) { return $null }
  return [int][double]::Parse($text, [System.Globalization.CultureInfo]::InvariantCulture)
}

function To-DoubleValue([string]$Value) {
  $text = Normalize-Text $Value
  if ([string]::IsNullOrWhiteSpace($text)) { return $null }
  $text = $text -replace "%", "" -replace ",", "."
  return [double]::Parse($text, [System.Globalization.CultureInfo]::InvariantCulture)
}

function New-StatObject($Values, [int]$StartIndex) {
  return [ordered]@{
    onRoadSpeed = (To-IntValue $Values[$StartIndex + 0])
    offRoadSpeed = (To-IntValue $Values[$StartIndex + 1])
    waterSpeed = (To-IntValue $Values[$StartIndex + 2])
    acceleration = (To-IntValue $Values[$StartIndex + 3])
    miniTurbo = (To-IntValue $Values[$StartIndex + 4])
    weight = (To-IntValue $Values[$StartIndex + 5])
    coinCurve = (To-IntValue $Values[$StartIndex + 6])
    onRoadHandling = (To-IntValue $Values[$StartIndex + 7])
    offRoadHandling = (To-IntValue $Values[$StartIndex + 8])
    waterHandling = (To-IntValue $Values[$StartIndex + 9])
    invincibility = (To-IntValue $Values[$StartIndex + 10])
  }
}

function Convert-StatsToAverage($StatsList) {
  if (-not $StatsList -or $StatsList.Count -eq 0) { return $null }
  $keys = $StatsList[0].Keys
  $result = [ordered]@{}
  foreach ($key in $keys) {
    $values = @($StatsList | ForEach-Object { [double]($_[$key]) })
    $avg = ($values | Measure-Object -Average).Average
    $result[$key] = [math]::Round([double]$avg, 2)
  }
  return $result
}

$statsRaw = Get-GvizJson "Stats [Raw]"
$vehiclesSheet = Get-GvizJson "Vehicles"
$speedSheet = Get-GvizJson "Speed & Coins"

$vehicleClassByTag = @{}
$vehicleClassByName = @{}
$currentVehicleClass = ""
$currentVehicleTag = ""

foreach ($row in $vehiclesSheet.table.rows) {
  $values = Get-RowValues $row
  if ($values.Count -lt 18) { continue }
  $className = Normalize-Tag $values[1]
  $tag = Normalize-Text $values[2]
  if ($className) { $currentVehicleClass = $className }
  if ($tag) {
    $currentVehicleTag = $tag
    if ($currentVehicleClass) {
      $vehicleClassByTag[$currentVehicleTag] = $currentVehicleClass
    }
  }
  foreach ($name in @($values[3], $values[4], $values[5], $values[6])) {
    $vehicleName = Normalize-Text $name
    if ($vehicleName) {
      $vehicleClassByName[$vehicleName] = $currentVehicleClass
    }
  }
}

$characters = [ordered]@{}
$vehicles = [ordered]@{}

foreach ($row in $statsRaw.table.rows) {
  $values = Get-RowValues $row
  if ($values.Count -lt 34) { continue }

  $characterName = Canonicalize-Name $values[5] $CharacterAliases
  if ($characterName -and -not $characters.Contains($characterName)) {
    $characters[$characterName] = [ordered]@{
      name = $characterName
      slug = (Make-Slug $characterName)
      size = Normalize-Text $values[1]
      class = Normalize-Text $values[2]
      specialization = Normalize-Text $values[3]
      fullClass = Normalize-Text $values[4]
      iconKey = (Make-Slug $characterName)
      stats = (New-StatObject $values 7)
    }
  }

  $vehicleName = Canonicalize-Name $values[19] $VehicleAliases
  if ($vehicleName -and -not $vehicles.Contains($vehicleName)) {
    $vehicleTag = Normalize-Text $values[22]
    $vehicleClass = ""
    if ($vehicleClassByTag.ContainsKey($vehicleTag)) {
      $vehicleClass = $vehicleClassByTag[$vehicleTag]
    } elseif ($vehicleClassByName.ContainsKey($vehicleName)) {
      $vehicleClass = $vehicleClassByName[$vehicleName]
    }

    $vehicles[$vehicleName] = [ordered]@{
      name = $vehicleName
      slug = (Make-Slug $vehicleName)
      type = Normalize-Text $values[21]
      tag = $vehicleTag
      vehicleClass = $vehicleClass
      iconKey = (Make-Slug $vehicleName)
      stats = (New-StatObject $values 23)
    }
  }
}

$characterList = @($characters.GetEnumerator() | Sort-Object Name | ForEach-Object { $_.Value })
$vehicleList = @($vehicles.GetEnumerator() | Sort-Object Name | ForEach-Object { $_.Value })

$statLabels = [ordered]@{
  onRoadSpeed = "On-Road Speed"
  offRoadSpeed = "Off-Road Speed"
  waterSpeed = "Water Speed"
  acceleration = "Acceleration"
  miniTurbo = "Mini-Turbo"
  weight = "Weight"
  coinCurve = "Coin Curve"
  onRoadHandling = "On-Road Handling"
  offRoadHandling = "Off-Road Handling"
  waterHandling = "Water Handling"
  invincibility = "Invincibility"
}

$statKeys = @($statLabels.Keys)
$statMaxima = [ordered]@{}
foreach ($key in $statKeys) {
  $characterMax = (@($characterList | ForEach-Object { [int]$_.stats[$key] }) | Measure-Object -Maximum).Maximum
  $vehicleMax = (@($vehicleList | ForEach-Object { [int]$_.stats[$key] }) | Measure-Object -Maximum).Maximum
  $statMaxima[$key] = ([int]$characterMax + [int]$vehicleMax)
}

$groupBucket = @{}
foreach ($character in $characterList) {
  $groupKey = "{0}|{1}" -f $character.class, $character.specialization
  if (-not $groupBucket.ContainsKey($groupKey)) {
    $groupBucket[$groupKey] = [ordered]@{
      characterClass = $character.class
      specialization = $character.specialization
      fullClass = $character.fullClass
      members = @()
      stats = @()
    }
  }
  $groupBucket[$groupKey].members += $character.name
  $groupBucket[$groupKey].stats += $character.stats
}

$characterGroups = @()
foreach ($entry in ($groupBucket.GetEnumerator() | Sort-Object Name)) {
  $value = $entry.Value
  $characterGroups += [ordered]@{
    characterClass = $value.characterClass
    specialization = $value.specialization
    fullClass = $value.fullClass
    members = @($value.members | Sort-Object)
    stats = (Convert-StatsToAverage $value.stats)
  }
}

$classBucket = @{}
foreach ($character in $characterList) {
  if (-not $classBucket.ContainsKey($character.class)) {
    $classBucket[$character.class] = [ordered]@{
      characterClass = $character.class
      members = @()
      stats = @()
    }
  }
  $classBucket[$character.class].members += $character.name
  $classBucket[$character.class].stats += $character.stats
}

$characterClassAverages = @()
foreach ($entry in ($classBucket.GetEnumerator() | Sort-Object Name)) {
  $value = $entry.Value
  $characterClassAverages += [ordered]@{
    characterClass = $value.characterClass
    members = @($value.members | Sort-Object)
    stats = (Convert-StatsToAverage $value.stats)
  }
}

$coinCurveHeaders = Get-RowValues $speedSheet.table.rows[19]
$coinCounts = @(0)
for ($col = 2; $col -le 20; $col++) {
  $heading = Normalize-Text $coinCurveHeaders[$col]
  if ($heading) { $coinCounts += [int]$heading }
}
$coinCounts += 20

$coinCurveByLevel = [ordered]@{}
for ($rowIndex = 20; $rowIndex -le 35; $rowIndex++) {
  $values = Get-RowValues $speedSheet.table.rows[$rowIndex]
  $level = To-IntValue $values[1]
  if ($null -eq $level) { continue }
  $gains = @(0.0)
  for ($col = 2; $col -le 20; $col++) {
    $gains += [math]::Round((To-DoubleValue $values[$col]), 3)
  }
  # The sheet exposes coin steps through 19. The source text states the cap is 20 coins for 5%.
  $gains += 5.0
  $coinCurveByLevel["$level"] = $gains
}

$data = [ordered]@{
  meta = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    sourceSpreadsheet = "https://docs.google.com/spreadsheets/d/$SpreadsheetId/edit?usp=sharing"
    sourceSheets = @("Stats [Raw]", "Vehicles", "Speed & Coins")
    notes = @(
      "Character and vehicle stats are derived from the public Google Sheet provided by the user.",
      "Character and vehicle names are normalized to the Time Trial seed list used elsewhere in MKWT.",
      "Coin curve percentages are sourced from the Speed & Coins sheet.",
      "The sheet exposes coin increments through 19; a 20th point at 5.0% is appended from the sheet's own stated cap."
    )
  }
  statLabels = $statLabels
  statKeys = $statKeys
  statMaxima = $statMaxima
  coinCounts = $coinCounts
  coinCurveByLevel = $coinCurveByLevel
  characters = $characterList
  vehicles = $vehicleList
  characterGroups = $characterGroups
  characterClassAverages = $characterClassAverages
}

$json = $data | ConvertTo-Json -Depth 8
$resolvedOutputPath = (Resolve-Path (Split-Path -Parent $OutputPath)).Path
$target = Join-Path $resolvedOutputPath (Split-Path -Leaf $OutputPath)
[System.IO.File]::WriteAllText($target, $json, [System.Text.UTF8Encoding]::new($false))
Write-Host "Wrote combo builder data to $target"
