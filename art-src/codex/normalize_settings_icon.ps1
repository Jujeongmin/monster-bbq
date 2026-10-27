param(
    [Parameter(Mandatory = $true)][string]$InputPath,
    [Parameter(Mandatory = $true)][string]$OutputPath
)

Add-Type -AssemblyName System.Drawing

$source = [System.Drawing.Bitmap]::FromFile($InputPath)
$logical = New-Object System.Drawing.Bitmap 30, 30, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$sample = [System.Drawing.Graphics]::FromImage($logical)
$sample.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$sample.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$sample.DrawImage($source, 0, 0, 30, 30)
$sample.Dispose()
$source.Dispose()

$foreground = New-Object 'bool[,]' 30, 30
for ($y = 0; $y -lt 30; $y++) {
    for ($x = 0; $x -lt 30; $x++) {
        $c = $logical.GetPixel($x, $y)
        $foreground[$x, $y] = -not ($c.R -gt 210 -and $c.B -gt 180 -and $c.G -lt 90)
    }
}

$magenta = [System.Drawing.Color]::FromArgb(255, 255, 0, 255)
$outline = [System.Drawing.Color]::FromArgb(255, 43, 20, 8)
$walnut = [System.Drawing.Color]::FromArgb(255, 106, 58, 34)
$darkBrass = [System.Drawing.Color]::FromArgb(255, 177, 117, 22)
$brass = [System.Drawing.Color]::FromArgb(255, 222, 169, 48)
$highlight = [System.Drawing.Color]::FromArgb(255, 255, 227, 106)

for ($y = 0; $y -lt 30; $y++) {
    for ($x = 0; $x -lt 30; $x++) {
        $c = $logical.GetPixel($x, $y)
        if (-not $foreground[$x, $y]) {
            $mapped = $magenta
        } else {
            $boundary = $false
            foreach ($dy in -1..1) {
                foreach ($dx in -1..1) {
                    if ($dx -eq 0 -and $dy -eq 0) { continue }
                    $nx = $x + $dx
                    $ny = $y + $dy
                    if ($nx -lt 0 -or $nx -ge 30 -or $ny -lt 0 -or $ny -ge 30 -or -not $foreground[$nx, $ny]) {
                        $boundary = $true
                    }
                }
            }
            if ($boundary -or ($c.R -lt 75 -and $c.G -lt 65 -and $c.B -lt 55)) {
                $mapped = $outline
            } elseif ($c.R -lt 150 -and $c.G -lt 100 -and $c.B -lt 75) {
                $mapped = $walnut
            } else {
                $luma = (0.299 * $c.R) + (0.587 * $c.G) + (0.114 * $c.B)
                if ($luma -gt 235) { $mapped = $highlight }
                elseif ($luma -lt 150) { $mapped = $darkBrass }
                else { $mapped = $brass }
            }
        }
        $logical.SetPixel($x, $y, $mapped)
    }
}

$final = New-Object System.Drawing.Bitmap 480, 480, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$render = [System.Drawing.Graphics]::FromImage($final)
$render.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$render.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$render.DrawImage($logical, 0, 0, 480, 480)
$render.Dispose()
$logical.Dispose()

$dir = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
$final.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
$final.Dispose()
