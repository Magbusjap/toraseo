[CmdletBinding()]
param(
    [string]$Version = "dev"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
$PackageDir = Join-Path $RootDir "toraseo-codex-workflow"
$OutputZip = Join-Path $RootDir "toraseo-codex-workflow-$Version.zip"

$skillMdPath = Join-Path $PackageDir "SKILL.md"
if (-not (Test-Path $skillMdPath)) {
    Write-Error "SKILL.md not found at $skillMdPath"
    exit 1
}

if (Test-Path $OutputZip) {
    Remove-Item -Force $OutputZip
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$packageRoot = (Resolve-Path $PackageDir).Path
$zipStream = [System.IO.File]::Open(
    $OutputZip,
    [System.IO.FileMode]::Create
)

try {
    $archive = New-Object System.IO.Compression.ZipArchive(
        $zipStream,
        [System.IO.Compression.ZipArchiveMode]::Create
    )

    try {
        $files = Get-ChildItem -Path $packageRoot -Recurse -File

        foreach ($file in $files) {
            $relativePath = $file.FullName.Substring($packageRoot.Length + 1)
            $entryName = "toraseo-codex-workflow/" + ($relativePath -replace '\\', '/')

            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $archive,
                $file.FullName,
                $entryName,
                [System.IO.Compression.CompressionLevel]::Optimal
            ) | Out-Null
        }
    } finally {
        $archive.Dispose()
    }
} finally {
    $zipStream.Dispose()
}

Write-Host "Built: $OutputZip"
