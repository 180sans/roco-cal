[CmdletBinding()]
param([string]$PythonVersion = "3.11.9")
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$resourcesDir = Join-Path $projectRoot "src-tauri\resources"
$runtimeDir = Join-Path $resourcesDir "python"
$stagingDir = Join-Path $resourcesDir "python-staging"
$backupDir = Join-Path $resourcesDir "python-backup"
$runtimeSignature = "runtime-layout=4`npython=$PythonVersion`ncore-only=true"

foreach ($path in @($runtimeDir, $stagingDir, $backupDir)) {
    if ((Split-Path -Parent ([IO.Path]::GetFullPath($path))) -ne [IO.Path]::GetFullPath($resourcesDir)) {
        throw "Runtime path is outside the project's resource directory: $path"
    }
}

# Preserve the native inference runtime before removing Python inference libraries.
& (Join-Path $PSScriptRoot "prepare-inference-runtime.ps1")

function Test-PreparedRuntime {
    param([string]$Path)
    $pythonExe = Join-Path $Path "python.exe"
    $marker = Join-Path $Path ".runtime-signature"
    if (-not (Test-Path -LiteralPath $pythonExe) -or -not (Test-Path -LiteralPath $marker)) { return $false }
    if ((Get-Content -LiteralPath $marker -Raw -Encoding UTF8).Trim() -ne $runtimeSignature) { return $false }
    & $pythonExe -B -c "import json, math, argparse, pathlib, difflib, sys; assert sys.version.split()[0] == '$PythonVersion'"
    return $LASTEXITCODE -eq 0
}
function Remove-WorkspaceDirectory {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $resolved = (Resolve-Path -LiteralPath $Path).Path
    $root = (Resolve-Path -LiteralPath $resourcesDir).Path
    if ((Split-Path -Parent $resolved) -ne $root -or (Split-Path -Leaf $resolved) -notin @("python-staging", "python-backup")) {
        throw "Refusing to remove unexpected directory: $resolved"
    }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
if (Test-PreparedRuntime $runtimeDir) {
    Write-Host "Embedded Python core runtime is already prepared."
    return
}
if ((Test-Path -LiteralPath $backupDir) -and -not (Test-Path -LiteralPath $runtimeDir)) {
    throw "An interrupted runtime replacement was found. Restore python-backup before continuing."
}
Remove-WorkspaceDirectory $stagingDir
Remove-WorkspaceDirectory $backupDir
$archive = Join-Path ([IO.Path]::GetTempPath()) ("roco-python-" + [guid]::NewGuid().ToString("N") + ".zip")
try {
    $existingPython = Join-Path $runtimeDir "python.exe"
    $reuse = $false
    if (Test-Path -LiteralPath $existingPython) {
        $detectedVersion = & $existingPython -B -c "import sys; print(sys.version.split()[0])"
        $reuse = $LASTEXITCODE -eq 0 -and "$detectedVersion".Trim() -eq $PythonVersion
    }
    if ($reuse) {
        New-Item -ItemType Directory -Path $stagingDir | Out-Null
        # The embedded distribution keeps its standard library and extensions
        # at the root; third-party packages are confined to Lib/site-packages.
        Get-ChildItem -LiteralPath $runtimeDir -File | Where-Object { $_.Name -ne ".runtime-signature" } | ForEach-Object {
            Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $stagingDir $_.Name)
        }
    } else {
        Invoke-WebRequest -Uri "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip" -OutFile $archive
        Expand-Archive -LiteralPath $archive -DestinationPath $stagingDir
    }
    $versionParts = $PythonVersion.Split('.')
    $pythonTag = "$($versionParts[0])$($versionParts[1])"
    @("python$pythonTag.zip", ".") | Set-Content -LiteralPath (Join-Path $stagingDir "python$pythonTag._pth") -Encoding ascii
    $stagedPython = Join-Path $stagingDir "python.exe"
    & $stagedPython -B -c "import json, math, argparse, pathlib, difflib, sys; sys.path.insert(0, sys.argv[1]); import desktop_api; from core import skill_finder, trait_runtime, will_power, calshuxing, ele_advantage; assert not any(k in sys.modules for k in ['numpy','cv2','PIL','onnxruntime'])" (Join-Path $resourcesDir "rocodatebase")
    if ($LASTEXITCODE -ne 0) { throw "Embedded Python core runtime validation failed." }
    Set-Content -LiteralPath (Join-Path $stagingDir ".runtime-signature") -Value $runtimeSignature -Encoding UTF8
    if (Test-Path -LiteralPath $runtimeDir) { Move-Item -LiteralPath $runtimeDir -Destination $backupDir }
    try { Move-Item -LiteralPath $stagingDir -Destination $runtimeDir }
    catch {
        if (Test-Path -LiteralPath $backupDir) { Move-Item -LiteralPath $backupDir -Destination $runtimeDir }
        throw
    }
    Remove-WorkspaceDirectory $backupDir
} finally {
    if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
    Remove-WorkspaceDirectory $stagingDir
}
$bytes = (Get-ChildItem -LiteralPath $runtimeDir -File -Recurse | Measure-Object Length -Sum).Sum
Write-Host ("Embedded Python core runtime prepared: {0:N1} MiB" -f ($bytes / 1MB))
