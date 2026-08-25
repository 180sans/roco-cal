[CmdletBinding()]
param(
    [string]$PythonVersion = "3.11.9"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectRoot "src-tauri\resources\python"
$pythonExe = Join-Path $runtimeDir "python.exe"
$packagesDir = Join-Path $runtimeDir "Lib\site-packages"
$onnxRuntimePackage = Join-Path $packagesDir "onnxruntime\__init__.py"
$pillowPackage = Join-Path $packagesDir "PIL\__init__.py"
$opencvPackage = Join-Path $packagesDir "cv2\cv2.pyd"

if (Test-Path -LiteralPath $pythonExe) {
    $runtimeVersion = & $pythonExe -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
    if ($LASTEXITCODE -eq 0 -and $runtimeVersion -eq "3.11" -and (Test-Path -LiteralPath $onnxRuntimePackage) -and (Test-Path -LiteralPath $pillowPackage) -and (Test-Path -LiteralPath $opencvPackage)) {
        Write-Host "Embedded Python OCR runtime is already prepared: $pythonExe"
        return
    }
    if ($runtimeVersion -ne "3.11") {
        Remove-Item -LiteralPath $runtimeDir -Recurse -Force
    }
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

$pthFile = Join-Path $runtimeDir "python311._pth"
@(
    "python311.zip",
    ".",
    "Lib\site-packages"
) | Set-Content -LiteralPath $pthFile -Encoding ascii

if (-not (Test-Path -LiteralPath (Join-Path $runtimeDir "Lib\site-packages\pip\__init__.py"))) {
    $getPip = Join-Path $env:TEMP "get-pip.py"
    try {
        Invoke-WebRequest -Uri "https://bootstrap.pypa.io/get-pip.py" -OutFile $getPip
        & $pythonExe $getPip --no-warn-script-location
    }
    finally {
        if (Test-Path -LiteralPath $getPip) {
            Remove-Item -LiteralPath $getPip -Force
        }
    }
}

$missingPackages = @()
if (-not (Test-Path -LiteralPath $onnxRuntimePackage)) { $missingPackages += "onnxruntime==1.20.1" }
if (-not (Test-Path -LiteralPath $pillowPackage)) { $missingPackages += "Pillow==11.1.0" }
if (-not (Test-Path -LiteralPath $opencvPackage)) { $missingPackages += "opencv-python-headless==4.11.0.86" }
if ($missingPackages.Count -gt 0) {
    $missingPackages += "numpy==1.26.4"
    $missingPackages += "protobuf==3.20.2"
    & $pythonExe -m pip install --no-warn-script-location --upgrade --target $packagesDir @missingPackages
    if ($LASTEXITCODE -ne 0) {
        throw "Embedded Python dependency installation failed."
    }
}

Write-Host "Embedded Python OCR runtime prepared: $pythonExe"
