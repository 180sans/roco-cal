[CmdletBinding()]
param(
    [string]$PythonVersion = "3.12.10"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectRoot "src-tauri\resources\python"
$pythonExe = Join-Path $runtimeDir "python.exe"

if (Test-Path -LiteralPath $pythonExe) {
    Write-Host "Embedded Python runtime already exists: $pythonExe"
    exit 0
}

$architecture = "amd64"
$archiveName = "python-$PythonVersion-embed-$architecture.zip"
$downloadUrl = "https://www.python.org/ftp/python/$PythonVersion/$archiveName"
$temporaryArchive = Join-Path $env:TEMP $archiveName

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

try {
    Write-Host "Downloading embedded Python $PythonVersion ($architecture)..."
    Invoke-WebRequest -Uri $downloadUrl -OutFile $temporaryArchive
    Expand-Archive -LiteralPath $temporaryArchive -DestinationPath $runtimeDir -Force
}
finally {
    if (Test-Path -LiteralPath $temporaryArchive) {
        Remove-Item -LiteralPath $temporaryArchive -Force
    }
}

if (-not (Test-Path -LiteralPath $pythonExe)) {
    throw "Embedded Python extraction failed: $pythonExe was not created."
}

Write-Host "Embedded Python runtime prepared: $pythonExe"
