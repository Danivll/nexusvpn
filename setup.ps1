# NexusVPN - Setup Script
# Downloads and installs OpenVPN Community silently
# Run as Administrator: powershell -ExecutionPolicy Bypass -File setup.ps1

param([switch]$Uninstall)

$ErrorActionPreference = "Stop"
$OpenVPNVersion = "2.6.12"
$InstallerUrl = "https://swupdate.openvpn.org/community/releases/OpenVPN-$OpenVPNVersion-I001-amd64.msi"
$InstallerPath = "$env:TEMP\OpenVPN-Setup.msi"
$OpenVPNBin = "C:\Program Files\OpenVPN\bin\openvpn.exe"

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p  = [Security.Principal.WindowsPrincipal]$id
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

Write-Host ""
Write-Host "  NexusVPN - Setup Script" -ForegroundColor Cyan
Write-Host "  ========================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Admin)) {
    Write-Host "  WARNING: This script requires Administrator privileges." -ForegroundColor Yellow
    Write-Host "  Right-click on setup.ps1 and choose Run as Administrator." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

if ($Uninstall) {
    Write-Host "  Uninstalling OpenVPN..." -ForegroundColor Yellow
    $app = Get-WmiObject -Class Win32_Product | Where-Object { $_.Name -like "*OpenVPN*" }
    if ($app) {
        $app.Uninstall() | Out-Null
        Write-Host "  OpenVPN uninstalled." -ForegroundColor Green
    } else {
        Write-Host "  OpenVPN not found, nothing to remove." -ForegroundColor Gray
    }
    exit 0
}

# Check if already installed
if (Test-Path $OpenVPNBin) {
    Write-Host "  OpenVPN is already installed at:" -ForegroundColor Green
    Write-Host "    $OpenVPNBin" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Setup complete! You can now run: npm run dev" -ForegroundColor Green
    Write-Host ""
    exit 0
}

Write-Host "  Downloading OpenVPN $OpenVPNVersion..." -ForegroundColor Cyan
Write-Host "    $InstallerUrl" -ForegroundColor Gray
Write-Host ""

$ProgressPreference = 'SilentlyContinue'

try {
    Invoke-WebRequest -Uri $InstallerUrl -OutFile $InstallerPath -UseBasicParsing
    Write-Host "  Download complete." -ForegroundColor Green
} catch {
    Write-Host "  Download failed: $_" -ForegroundColor Red
    Write-Host "  Download manually from: https://openvpn.net/community-downloads/" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "  Installing OpenVPN silently (may take a minute)..." -ForegroundColor Cyan

try {
    $msiArgs = @('/i', $InstallerPath, '/quiet', '/norestart', 'ADDLOCAL=OpenVPN,OpenVPN.Service,Drivers,Drivers.TAPWindows6')
    Start-Process msiexec.exe -ArgumentList $msiArgs -Wait -NoNewWindow
    Write-Host "  OpenVPN installed successfully." -ForegroundColor Green
} catch {
    Write-Host "  Installation failed: $_" -ForegroundColor Red
    exit 1
}

# Verify
if (Test-Path $OpenVPNBin) {
    Write-Host ""
    Write-Host "  ====================================" -ForegroundColor Green
    Write-Host "    Setup completed successfully!" -ForegroundColor Green
    Write-Host "  ====================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Run the app with:  npm run dev" -ForegroundColor Cyan
    Write-Host ""
} else {
    Write-Host "  OpenVPN binary not found after install. Please check manually." -ForegroundColor Red
    exit 1
}

Remove-Item $InstallerPath -Force -ErrorAction SilentlyContinue
