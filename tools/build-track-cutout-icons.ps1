Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$sourceDir = Join-Path $root 'Track Icons MKW'
$targetDir = Join-Path $root 'Track Icons MKW Transparent'

if (-not (Test-Path -LiteralPath $sourceDir)) {
  throw "Source folder not found: $sourceDir"
}

New-Item -ItemType Directory -Path $targetDir -Force | Out-Null

function Test-IsBackgroundPixel {
  param(
    [System.Drawing.Color]$Color
  )

  $max = [Math]::Max($Color.R, [Math]::Max($Color.G, $Color.B))
  $min = [Math]::Min($Color.R, [Math]::Min($Color.G, $Color.B))
  $range = $max - $min
  $brightness = $max / 255.0

  if ($Color.A -le 18) { return $true }
  if ($Color.A -le 80 -and $range -le 60) { return $true }
  if ($Color.A -le 140 -and $range -le 36 -and $brightness -le 0.75) { return $true }
  if ($Color.A -le 210 -and $range -le 22 -and $brightness -ge 0.18 -and $brightness -le 0.60) { return $true }

  return $false
}

function Convert-ToCutout {
  param(
    [string]$SourcePath,
    [string]$TargetPath
  )

  $bitmap = [System.Drawing.Bitmap]::FromFile($SourcePath)
  try {
    $width = $bitmap.Width
    $height = $bitmap.Height
    $visited = New-Object 'bool[,]' $width, $height
    $queue = New-Object 'System.Collections.Generic.Queue[System.Drawing.Point]'

    function Add-Seed {
      param([int]$X, [int]$Y)

      if ($X -lt 0 -or $Y -lt 0 -or $X -ge $width -or $Y -ge $height) { return }
      if ($visited[$X, $Y]) { return }

      $pixel = $bitmap.GetPixel($X, $Y)
      if (Test-IsBackgroundPixel $pixel) {
        $visited[$X, $Y] = $true
        $queue.Enqueue([System.Drawing.Point]::new($X, $Y))
      }
    }

    for ($x = 0; $x -lt $width; $x++) {
      Add-Seed -X $x -Y 0
      Add-Seed -X $x -Y ($height - 1)
    }
    for ($y = 0; $y -lt $height; $y++) {
      Add-Seed -X 0 -Y $y
      Add-Seed -X ($width - 1) -Y $y
    }

    while ($queue.Count -gt 0) {
      $point = $queue.Dequeue()
      foreach ($offset in @(@(1,0), @(-1,0), @(0,1), @(0,-1))) {
        Add-Seed -X ($point.X + $offset[0]) -Y ($point.Y + $offset[1])
      }
    }

    for ($x = 0; $x -lt $width; $x++) {
      for ($y = 0; $y -lt $height; $y++) {
        if ($visited[$x, $y]) {
          $bitmap.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
        }
      }
    }

    $minX = $width
    $minY = $height
    $maxX = -1
    $maxY = -1

    for ($x = 0; $x -lt $width; $x++) {
      for ($y = 0; $y -lt $height; $y++) {
        $pixel = $bitmap.GetPixel($x, $y)
        if ($pixel.A -gt 8) {
          if ($x -lt $minX) { $minX = $x }
          if ($y -lt $minY) { $minY = $y }
          if ($x -gt $maxX) { $maxX = $x }
          if ($y -gt $maxY) { $maxY = $y }
        }
      }
    }

    if ($maxX -lt $minX -or $maxY -lt $minY) {
      throw "No visible pixels left after cutout for $SourcePath"
    }

    $padding = 2
    $minX = [Math]::Max(0, $minX - $padding)
    $minY = [Math]::Max(0, $minY - $padding)
    $maxX = [Math]::Min($width - 1, $maxX + $padding)
    $maxY = [Math]::Min($height - 1, $maxY + $padding)

    $rect = [System.Drawing.Rectangle]::new(
      $minX,
      $minY,
      ($maxX - $minX + 1),
      ($maxY - $minY + 1)
    )

    $out = New-Object System.Drawing.Bitmap $rect.Width, $rect.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($out)
      try {
        $graphics.DrawImage(
          $bitmap,
          [System.Drawing.Rectangle]::new(0, 0, $rect.Width, $rect.Height),
          $rect,
          [System.Drawing.GraphicsUnit]::Pixel
        )
      } finally {
        $graphics.Dispose()
      }

      $out.Save($TargetPath, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $out.Dispose()
    }
  } finally {
    $bitmap.Dispose()
  }
}

$files = Get-ChildItem -LiteralPath $sourceDir -Filter *.png | Sort-Object Name
foreach ($file in $files) {
  $target = Join-Path $targetDir $file.Name
  Convert-ToCutout -SourcePath $file.FullName -TargetPath $target
  Write-Output "Cutout created: $($file.Name)"
}

Write-Output "Done. Transparent icons written to: $targetDir"
