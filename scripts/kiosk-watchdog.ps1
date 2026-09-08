<#
.SYNOPSIS
  DocuCenter Kiosk watchdog. Keeps the Node backend and the Flutter kiosk app
  running, and reports an incident to the dashboard whenever it has to recover
  one of them.

.DESCRIPTION
  Run this instead of the plain restart loop in start-kiosk.bat. Register it as
  the "DocuCenter Kiosk" scheduled task (see setup-kiosk-os.ps1) or launch it
  from a shortcut in shell:startup.

  Every $PollSeconds it checks:
    * backend  — TCP connect to localhost:$BackendPort
    * frontend — a process named $FlutterProcess is alive
  If either is down it (re)starts it and POSTs a structured incident to
  /api/kiosk/incidents with error_code APP_RECOVERED / BACKEND_RECOVERED.

.NOTES
  First launch after a clean boot is treated as a normal start, not a recovery.
#>

param(
  [int]    $PollSeconds    = 10,
  [int]    $BackendPort    = 5000,
  [string] $FlutterProcess = 'web_doc',
  [string] $ProjectRoot    = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Continue'

$BackendDir  = Join-Path $ProjectRoot 'backend'
$FlutterExe  = Join-Path $ProjectRoot 'build\windows\x64\runner\Release\web_doc.exe'
$IncidentUrl = "http://localhost:$BackendPort/api/kiosk/incidents"

function Write-Log([string]$msg) {
  Write-Host ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $msg)
}

function Test-Backend {
  try {
    $c = New-Object Net.Sockets.TcpClient
    $c.Connect('localhost', $BackendPort)
    $c.Close()
    return $true
  } catch { return $false }
}

function Test-Frontend {
  return [bool](Get-Process -Name $FlutterProcess -ErrorAction SilentlyContinue)
}

function Report-Incident([string]$device, [string]$code, [string]$message) {
  $body = @{
    device     = $device
    error_code = $code
    severity   = 'warning'
    message    = $message
    metadata   = @{ host = $env:COMPUTERNAME; by = 'kiosk-watchdog' }
  } | ConvertTo-Json -Compress

  for ($i = 0; $i -lt 5; $i++) {
    try {
      Invoke-RestMethod -Uri $IncidentUrl -Method Post -Body $body `
        -ContentType 'application/json' -TimeoutSec 6 | Out-Null
      Write-Log "reported: $code"
      return
    } catch {
      Start-Sleep -Seconds 3   # backend may still be coming up
    }
  }
  Write-Log "could not report $code (backend unreachable)"
}

function Start-Backend {
  Write-Log 'starting backend...'
  Start-Process node -ArgumentList 'dist/index.js' -WorkingDirectory $BackendDir -WindowStyle Hidden
}

function Start-Frontend {
  Write-Log 'starting kiosk app...'
  if (Test-Path $FlutterExe) {
    Start-Process $FlutterExe
  } else {
    Write-Log "kiosk exe not found at $FlutterExe"
  }
}

Write-Log "watchdog online — root=$ProjectRoot poll=${PollSeconds}s"

# Cold start: bring both up without calling it a recovery.
$firstLoop = $true

while ($true) {
  $backendUp  = Test-Backend
  $frontendUp = Test-Frontend

  if (-not $backendUp) {
    Start-Backend
    Start-Sleep -Seconds 8
    if (-not $firstLoop -and (Test-Backend)) {
      Report-Incident 'app' 'BACKEND_RECOVERED' 'Backend process was down and has been restarted by the watchdog'
    }
  }

  if (-not $frontendUp) {
    Start-Frontend
    Start-Sleep -Seconds 5
    if (-not $firstLoop -and (Test-Frontend)) {
      Report-Incident 'app' 'APP_RECOVERED' 'Kiosk application was not running and has been restarted by the watchdog'
    }
  }

  $firstLoop = $false
  Start-Sleep -Seconds $PollSeconds
}
