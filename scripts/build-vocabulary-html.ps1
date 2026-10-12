param(
    [string]$MystCommand = ""
)

# MyST treats TOC URL entries as external paths and does not add BASE_URL.
# Resolve the vocabulary's relative review links only for the build, then
# restore the portable source exactly, including its original line endings.
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not $MystCommand) {
    $MystCommand = Join-Path $RepoRoot "node_modules/.bin/myst"
    if ($env:OS -eq "Windows_NT") { $MystCommand += ".cmd" }
}
$ProjectPath = Join-Path $RepoRoot "vocabulary"
$TocPath = Join-Path $ProjectPath "toc.yml"
$Original = [IO.File]::ReadAllBytes($TocPath)
$Source = [Text.Encoding]::UTF8.GetString($Original)
$BasePath = if ($env:BASE_URL) { $env:BASE_URL.TrimEnd('/') } else { "" }
$Resolved = [regex]::Replace($Source, '(?m)^(\s+url: )\./(?=\d{4}-\d{2}-\d{2}#)', {
    param($Match)
    $Match.Groups[1].Value + $BasePath + '/'
})
Push-Location $ProjectPath
try {
    [IO.File]::WriteAllText($TocPath, $Resolved, [Text.UTF8Encoding]::new($false))
    & $MystCommand build --html --ci
    if ($LASTEXITCODE -ne 0) { throw "Vocabulary HTML build failed." }
}
finally {
    [IO.File]::WriteAllBytes($TocPath, $Original)
    Pop-Location
}
