[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$resourcesDir = Join-Path (Split-Path -Parent $PSScriptRoot) 'src-tauri\resources'
$nativeDir = Join-Path $resourcesDir 'inference'
$version = '1.20.1'
$signature = "onnxruntime=$version`nplatform=win_amd64"
$marker = Join-Path $nativeDir '.runtime-signature'
if ((Test-Path -LiteralPath (Join-Path $nativeDir 'onnxruntime.dll')) -and
    (Test-Path -LiteralPath (Join-Path $nativeDir 'onnxruntime_providers_shared.dll')) -and
    (Test-Path -LiteralPath (Join-Path $nativeDir 'LICENSE')) -and
    (Test-Path -LiteralPath (Join-Path $nativeDir 'ThirdPartyNotices.txt')) -and
    (Test-Path -LiteralPath $marker) -and
    (Get-Content -LiteralPath $marker -Raw -Encoding UTF8).Trim() -eq $signature) { return }

New-Item -ItemType Directory -Path $nativeDir -Force | Out-Null
$localCapi = Join-Path $resourcesDir 'python\Lib\site-packages\onnxruntime\capi'
$localVersion = Join-Path (Split-Path -Parent $localCapi) '__init__.py'
$canReuse = (Test-Path -LiteralPath (Join-Path $localCapi 'onnxruntime.dll')) -and
    (Test-Path -LiteralPath $localVersion) -and
    ((Get-Content -LiteralPath $localVersion -Raw) -match ('__version__\s*=\s*["'']' + [regex]::Escape($version) + '["'']'))
if ($canReuse) {
    foreach ($name in @('onnxruntime.dll', 'onnxruntime_providers_shared.dll')) {
        Copy-Item -LiteralPath (Join-Path $localCapi $name) -Destination (Join-Path $nativeDir $name) -Force
    }
    foreach ($name in @('LICENSE', 'ThirdPartyNotices.txt')) {
        Copy-Item -LiteralPath (Join-Path (Split-Path -Parent $localCapi) $name) -Destination (Join-Path $nativeDir $name) -Force
    }
} else {
    # Extract only the native DLLs from the official wheel. No Python package
    # manager or Python inference dependencies are installed in the application.
    $release = Invoke-RestMethod -Uri "https://pypi.org/pypi/onnxruntime/$version/json"
    $wheel = $release.urls | Where-Object { $_.filename -like '*cp311-cp311-win_amd64.whl' } | Select-Object -First 1
    if (-not $wheel) { throw 'Cannot find the pinned Windows ONNX Runtime distribution.' }
    $archive = Join-Path ([IO.Path]::GetTempPath()) ("roco-ort-" + [guid]::NewGuid().ToString('N') + '.whl')
    try {
        Invoke-WebRequest -Uri $wheel.url -OutFile $archive
        if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $wheel.digests.sha256) { throw 'ONNX Runtime archive checksum mismatch.' }
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $zip = [IO.Compression.ZipFile]::OpenRead($archive)
        try {
            foreach ($name in @('onnxruntime.dll', 'onnxruntime_providers_shared.dll')) {
                $entry = $zip.GetEntry("onnxruntime/capi/$name")
                if (-not $entry) { throw "ONNX Runtime distribution is missing $name" }
                [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $nativeDir $name), $true)
            }
            foreach ($name in @('LICENSE', 'ThirdPartyNotices.txt')) {
                $entry = $zip.GetEntry("onnxruntime/$name")
                if (-not $entry) { throw "ONNX Runtime distribution is missing $name" }
                [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $nativeDir $name), $true)
            }
        } finally { $zip.Dispose() }
    } finally { if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force } }
}
Set-Content -LiteralPath $marker -Value $signature -Encoding UTF8
Write-Host 'Native ONNX Runtime prepared (no Python inference packages).'
