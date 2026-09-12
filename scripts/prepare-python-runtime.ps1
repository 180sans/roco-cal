[CmdletBinding()]
param(
    [string]$PythonVersion = "3.11.9"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$resourcesDir = Join-Path $projectRoot "src-tauri\resources"
$runtimeDir = Join-Path $resourcesDir "python"
$stagingDir = Join-Path $resourcesDir "python-staging"
$backupDir = Join-Path $resourcesDir "python-backup"
$packages = @(
    "numpy==1.26.4",
    "onnxruntime==1.20.1",
    "Pillow==11.1.0",
    "opencv-python-headless==4.11.0.86"
)
$runtimeSignature = (@(
    "runtime-layout=3",
    "python=$PythonVersion"
) + $packages) -join "`n"

function Test-PreparedRuntime {
    param([string]$Path)

    $pythonExe = Join-Path $Path "python.exe"
    $markerFile = Join-Path $Path ".runtime-signature"
    if (-not (Test-Path -LiteralPath $pythonExe) -or -not (Test-Path -LiteralPath $markerFile)) {
        return $false
    }

    $savedSignature = (Get-Content -LiteralPath $markerFile -Raw -Encoding UTF8).Trim()
    if ($savedSignature -ne $runtimeSignature) {
        return $false
    }

    & $pythonExe -c "import cv2, numpy, onnxruntime; from PIL import Image"
    return $LASTEXITCODE -eq 0
}

if (Test-PreparedRuntime -Path $runtimeDir) {
    Write-Host "Embedded Python OCR runtime is already prepared: $(Join-Path $runtimeDir 'python.exe')"
    return
}

foreach ($temporaryDir in @($stagingDir, $backupDir)) {
    if (Test-Path -LiteralPath $temporaryDir) {
        Remove-Item -LiteralPath $temporaryDir -Recurse -Force
    }
}

$architecture = "amd64"
$archiveName = "python-$PythonVersion-embed-$architecture.zip"
$downloadUrl = "https://www.python.org/ftp/python/$PythonVersion/$archiveName"
$temporaryArchive = Join-Path $env:TEMP $archiveName
$getPip = Join-Path $env:TEMP "get-pip.py"

try {
    Write-Host "Preparing a clean embedded Python $PythonVersion ($architecture) runtime..."
    Invoke-WebRequest -Uri $downloadUrl -OutFile $temporaryArchive
    Expand-Archive -LiteralPath $temporaryArchive -DestinationPath $stagingDir -Force

    $stagingPython = Join-Path $stagingDir "python.exe"
    if (-not (Test-Path -LiteralPath $stagingPython)) {
        throw "Embedded Python extraction failed: $stagingPython was not created."
    }

    $pthFile = Join-Path $stagingDir "python311._pth"
    @(
        "python311.zip",
        ".",
        "Lib\site-packages"
    ) | Set-Content -LiteralPath $pthFile -Encoding ascii

    Invoke-WebRequest -Uri "https://bootstrap.pypa.io/get-pip.py" -OutFile $getPip
    & $stagingPython $getPip --no-warn-script-location
    if ($LASTEXITCODE -ne 0) {
        throw "pip bootstrap failed."
    }

    $packagesDir = Join-Path $stagingDir "Lib\site-packages"
    & $stagingPython -m pip install --no-warn-script-location --no-deps --target $packagesDir @packages
    if ($LASTEXITCODE -ne 0) {
        throw "Embedded Python dependency installation failed."
    }

    $modelsDir = Join-Path $resourcesDir "ocr-models"
    $classifierModel = Join-Path $resourcesDir "image-classifier\model.onnx"
    $smokeTest = @'
import sys
from pathlib import Path
import cv2
import numpy
import onnxruntime as ort
from PIL import Image

models = Path(sys.argv[1])
for model in (models / "det" / "model.onnx", models / "rec" / "model.onnx", Path(sys.argv[2])):
    ort.InferenceSession(str(model), providers=["CPUExecutionProvider"])
print(f"Runtime verified: Python {sys.version_info.major}.{sys.version_info.minor}, OpenCV {cv2.__version__}, NumPy {numpy.__version__}, ONNX Runtime {ort.__version__}, Pillow {Image.__version__}")
'@
    $smokeTestPath = Join-Path $stagingDir "_runtime_smoke_test.py"
    Set-Content -LiteralPath $smokeTestPath -Value $smokeTest -Encoding UTF8
    & $stagingPython $smokeTestPath $modelsDir $classifierModel
    if ($LASTEXITCODE -ne 0) {
        throw "Embedded Python OCR runtime validation failed."
    }

    # Remove build tooling and optional library features that the desktop API
    # never imports. Paths are explicit so cleanup cannot escape site-packages.
    $unusedRuntimePaths = @(
        (Join-Path $packagesDir "pip"),
        (Join-Path $packagesDir "setuptools"),
        (Join-Path $packagesDir "wheel"),
        (Join-Path $packagesDir "pkg_resources"),
        (Join-Path $packagesDir "_distutils_hack"),
        (Join-Path $packagesDir "bin"),
        (Join-Path $packagesDir "cv2\data"),
        (Join-Path $packagesDir "cv2\opencv_videoio_ffmpeg4110_64.dll"),
        (Join-Path $packagesDir "onnxruntime\backend"),
        (Join-Path $packagesDir "onnxruntime\datasets"),
        (Join-Path $packagesDir "onnxruntime\quantization"),
        (Join-Path $packagesDir "onnxruntime\tools"),
        (Join-Path $packagesDir "onnxruntime\transformers")
    )
    foreach ($unusedPath in $unusedRuntimePaths) {
        if (Test-Path -LiteralPath $unusedPath) {
            Remove-Item -LiteralPath $unusedPath -Recurse -Force
        }
    }

    & $stagingPython $smokeTestPath $modelsDir $classifierModel
    if ($LASTEXITCODE -ne 0) {
        throw "Embedded Python OCR runtime validation failed after trimming."
    }
    Remove-Item -LiteralPath $smokeTestPath -Force

    Set-Content -LiteralPath (Join-Path $stagingDir ".runtime-signature") -Value $runtimeSignature -Encoding UTF8

    if (Test-Path -LiteralPath $runtimeDir) {
        Move-Item -LiteralPath $runtimeDir -Destination $backupDir
    }
    try {
        Move-Item -LiteralPath $stagingDir -Destination $runtimeDir
    }
    catch {
        if (Test-Path -LiteralPath $backupDir) {
            Move-Item -LiteralPath $backupDir -Destination $runtimeDir
        }
        throw
    }
    if (Test-Path -LiteralPath $backupDir) {
        Remove-Item -LiteralPath $backupDir -Recurse -Force
    }
}
finally {
    foreach ($temporaryFile in @($temporaryArchive, $getPip)) {
        if (Test-Path -LiteralPath $temporaryFile) {
            Remove-Item -LiteralPath $temporaryFile -Force
        }
    }
    if (Test-Path -LiteralPath $stagingDir) {
        Remove-Item -LiteralPath $stagingDir -Recurse -Force
    }
}

$runtimeSize = (Get-ChildItem -LiteralPath $runtimeDir -File -Recurse | Measure-Object Length -Sum).Sum
Write-Host ("Embedded Python OCR runtime prepared: {0:N1} MB" -f ($runtimeSize / 1MB))
