#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Run once as Administrator on the kiosk PC.
  Applies 4 OS-level locks for DocuCenter Kiosk autostart.
#>

$ErrorActionPreference = 'Stop'
$projectPath = $PSScriptRoot   # directory that contains this script

Write-Host ""
Write-Host "=== DocuCenter Kiosk — OS Setup ===" -ForegroundColor Cyan
Write-Host "Project path: $projectPath"
Write-Host ""

# ─── 1. Hide taskbar (auto-hide, so it stays out of view) ─────────────────────
Write-Host "[1/4] Hiding taskbar..." -ForegroundColor Yellow
try {
    $regPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StuckRects3'
    if (Test-Path $regPath) {
        $settings = (Get-ItemProperty -Path $regPath -Name Settings).Settings
        $settings[8] = 3   # bit 0 set = auto-hide enabled
        Set-ItemProperty -Path $regPath -Name Settings -Value $settings
        # Restart Explorer to apply the change
        Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        Write-Host "  OK — taskbar set to auto-hide, Explorer restarted." -ForegroundColor Green
    } else {
        Write-Warning "  StuckRects3 key not found. Skipping taskbar hide."
    }
} catch {
    Write-Warning "  Taskbar hide failed: $_"
}

# ─── 2. Block Win key via Scancode Map ────────────────────────────────────────
Write-Host ""
Write-Host "[2/4] Blocking Win key via Scancode Map..." -ForegroundColor Yellow
try {
    # Header (8 bytes) + count=3 (4 bytes) + 2 mappings (8 bytes) + null (4 bytes)
    # Left Win  (0xE05B) -> null (0x0000)
    # Right Win (0xE05C) -> null (0x0000)
    [byte[]]$map = @(
        0x00, 0x00, 0x00, 0x00,  # header version
        0x00, 0x00, 0x00, 0x00,  # header flags
        0x03, 0x00, 0x00, 0x00,  # 3 entries (2 mappings + null terminator)
        0x00, 0x00, 0x5B, 0xE0,  # Left Win  -> disabled
        0x00, 0x00, 0x5C, 0xE0,  # Right Win -> disabled
        0x00, 0x00, 0x00, 0x00   # null terminator
    )
    $kbPath = 'HKLM:\SYSTEM\CurrentControlSet\Control\Keyboard Layout'
    Set-ItemProperty -Path $kbPath -Name 'Scancode Map' -Value $map -Type Binary
    Write-Host "  OK — Win key blocked. A reboot is required for this to take effect." -ForegroundColor Green
} catch {
    Write-Warning "  Scancode Map failed: $_"
}

# ─── 3. Register Task Scheduler task ─────────────────────────────────────────
Write-Host ""
Write-Host "[3/4] Registering Task Scheduler task 'DocuCenter Kiosk'..." -ForegroundColor Yellow
try {
    $taskName = 'DocuCenter Kiosk'
    $batPath  = Join-Path $projectPath 'start-kiosk.bat'

    if (-not (Test-Path $batPath)) {
        throw "start-kiosk.bat not found at: $batPath"
    }

    # The action runs the bat hidden via PowerShell so no console window appears
    $action = New-ScheduledTaskAction `
        -Execute 'powershell.exe' `
        -Argument "-WindowStyle Hidden -NonInteractive -ExecutionPolicy Bypass -Command `"Start-Process cmd -ArgumentList '/c \`"$batPath\`"' -WorkingDirectory '$projectPath' -WindowStyle Hidden`""

    # Trigger: at logon of the Kiosk user
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User 'Kiosk'

    # Settings: restart on failure every 1 min, up to 999 times; no execution time limit
    $settings = New-ScheduledTaskSettingsSet `
        -RestartCount 999 `
        -RestartInterval (New-TimeSpan -Minutes 1) `
        -ExecutionTimeLimit ([TimeSpan]::Zero) `
        -MultipleInstances IgnoreNew `
        -StartWhenAvailable

    # Run as the Kiosk user with their interactive desktop session
    $principal = New-ScheduledTaskPrincipal `
        -UserId 'Kiosk' `
        -LogonType Interactive `
        -RunLevel Limited

    Register-ScheduledTask `
        -TaskName $taskName `
        -Action   $action `
        -Trigger  $trigger `
        -Settings $settings `
        -Principal $principal `
        -Force | Out-Null

    Write-Host "  OK — task '$taskName' registered (trigger: logon of Kiosk, restart every 1 min, 999 retries)." -ForegroundColor Green
} catch {
    Write-Warning "  Task Scheduler registration failed: $_"
}

# ─── 4. Confirm summary ───────────────────────────────────────────────────────
Write-Host ""
Write-Host "[4/4] Verifying configuration..." -ForegroundColor Yellow

# Taskbar
$regPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StuckRects3'
if (Test-Path $regPath) {
    $byte8 = (Get-ItemProperty -Path $regPath -Name Settings).Settings[8]
    $taskbarStatus = if ($byte8 -band 1) { "auto-hide ON (byte8=0x{0:X2})" -f $byte8 } else { "auto-hide OFF (byte8=0x{0:X2})" -f $byte8 }
} else {
    $taskbarStatus = "key not found"
}
Write-Host "  Taskbar       : $taskbarStatus"

# Scancode map
$kbPath = 'HKLM:\SYSTEM\CurrentControlSet\Control\Keyboard Layout'
$scancodeExists = (Get-ItemProperty -Path $kbPath -Name 'Scancode Map' -ErrorAction SilentlyContinue) -ne $null
Write-Host "  Win key block : $(if ($scancodeExists) { 'Scancode Map present (reboot needed)' } else { 'NOT set' })"

# Task Scheduler
$task = Get-ScheduledTask -TaskName 'DocuCenter Kiosk' -ErrorAction SilentlyContinue
Write-Host "  Scheduled task: $(if ($task) { "Registered — State: $($task.State)" } else { 'NOT found' })"

Write-Host ""
Write-Host "=== Setup complete ===" -ForegroundColor Cyan
Write-Host "IMPORTANT: Reboot this PC for the Win-key block to take effect." -ForegroundColor Yellow
Write-Host ""
