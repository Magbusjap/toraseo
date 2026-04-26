# Build the ToraSEO skill ZIP locally on Windows.
#
# PowerShell equivalent of build-skill.sh. Same logic, same output:
# toraseo-skill-<version>.zip in the repo root, containing a
# top-level "toraseo/" folder with SKILL.md at its root.
#
# IMPORTANT: This script does NOT use Compress-Archive. PowerShell's
# built-in Compress-Archive emits Windows-style backslashes in entry
# paths, which violates the ZIP spec (APPNOTE.TXT 4.4.17 — entry
# names must use forward slashes). Claude Desktop validates ZIPs
# strictly and rejects backslash paths with "Zip file contains path
# with invalid characters". We build entries manually via
# [System.IO.Compression.ZipArchive] to keep paths spec-compliant.
#
# Use this to test the ZIP locally before pushing a git tag. CI
# (.github/workflows/release-skill.yml) does the same thing
# automatically on every "v*" tag using the bash version on a
# Linux runner (where zip(1) already emits forward-slash paths).
#
# Usage:
#   .\scripts\build-skill.ps1              # uses "dev" as version
#   .\scripts\build-skill.ps1 v0.1.0       # uses provided version

[CmdletBinding()]
param(
    [string]$Version = "dev"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
$SkillDir = Join-Path $RootDir "skill"
$OutputZip = Join-Path $RootDir "toraseo-skill-$Version.zip"

# Sanity: SKILL.md must exist with required frontmatter
$skillMdPath = Join-Path $SkillDir "SKILL.md"
if (-not (Test-Path $skillMdPath)) {
    Write-Error "SKILL.md not found at $skillMdPath"
    exit 1
}

$skillContent = Get-Content $skillMdPath -Raw

if ($skillContent -notmatch "(?m)^name:") {
    Write-Error "SKILL.md is missing 'name:' frontmatter field"
    exit 1
}

if ($skillContent -notmatch "(?m)^description:") {
    Write-Error "SKILL.md is missing 'description:' frontmatter field"
    exit 1
}

# Remove existing output ZIP if any
if (Test-Path $OutputZip) {
    Remove-Item -Force $OutputZip
}

# Build the ZIP manually so entry paths use forward slashes.
# The folder name "toraseo/" must match the "name:" field in
# SKILL.md frontmatter so Claude Desktop discovers the skill.
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$skillRoot = (Resolve-Path $SkillDir).Path
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
        # Walk skill/ recursively, file by file, skipping empty directories
        $files = Get-ChildItem -Path $skillRoot -Recurse -File

        foreach ($file in $files) {
            # Compute path relative to skill/ root, then prefix with "toraseo/"
            # and convert any backslashes to forward slashes for ZIP-spec compliance
            $relativePath = $file.FullName.Substring($skillRoot.Length + 1)
            $entryName = "toraseo/" + ($relativePath -replace '\\', '/')

            $entry = [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $archive,
                $file.FullName,
                $entryName,
                [System.IO.Compression.CompressionLevel]::Optimal
            )
        }
    } finally {
        $archive.Dispose()
    }
} finally {
    $zipStream.Dispose()
}

Write-Host "Built: $OutputZip"
Write-Host ""
Write-Host "Contents:"

# Mirror the `unzip -l` output of the bash version
$zip = [System.IO.Compression.ZipFile]::OpenRead($OutputZip)
try {
    Write-Host ("{0,10}  {1,-19}  {2}" -f "Length", "Date", "Name")
    Write-Host ("{0,10}  {1,-19}  {2}" -f "------", "----", "----")
    $totalSize = 0
    $totalCount = 0
    foreach ($entry in $zip.Entries) {
        $date = $entry.LastWriteTime.LocalDateTime.ToString("yyyy-MM-dd HH:mm")
        Write-Host ("{0,10}  {1,-19}  {2}" -f $entry.Length, $date, $entry.FullName)
        $totalSize += $entry.Length
        $totalCount++
    }
    Write-Host ("{0,10}  {1,-19}  {2}" -f "------", "", "-------")
    Write-Host ("{0,10}  {1,-19}  {2} files" -f $totalSize, "", $totalCount)
} finally {
    $zip.Dispose()
}
