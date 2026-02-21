$ErrorActionPreference = 'Stop'

$target = Join-Path $PSScriptRoot '..\build\windows\x64\_deps\nuget-subbuild\nuget-populate-prefix\src\nuget.exe'
$target = (Resolve-Path -LiteralPath $target -ErrorAction SilentlyContinue) -as [string]
if (-not $target) {
    $target = Join-Path $PSScriptRoot '..\build\windows\x64\_deps\nuget-subbuild\nuget-populate-prefix\src\nuget.exe'
}

$dir = Split-Path $target -Parent
if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

$url = 'https://dist.nuget.org/win-x86-commandline/v6.0.0/nuget.exe'
Write-Host "Downloading nuget.exe from $url to $dir"
try {
    Invoke-WebRequest -Uri $url -OutFile $target -UseBasicParsing -ErrorAction Stop
    Write-Host 'nuget.exe downloaded successfully.'
} catch {
    Write-Error "Failed to download nuget.exe: $_"
    exit 1
}
