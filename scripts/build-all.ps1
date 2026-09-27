param(
    [string]$PublishDir = "",
    [switch]$ChangedOnly,
    [switch]$NoOpenPrompt
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$LocalMyst = Join-Path $RepoRoot ".venv/Scripts/myst.exe"
$MystCommand = if (Test-Path -LiteralPath $LocalMyst) {
    $LocalMyst
}
else {
    (Get-Command myst -ErrorAction Stop).Source
}
$Projects = @(
    @{ Name = "计算机与深度学习"; Path = "deep learning"; Slug = "computer"; Pdf = "computer-notes.pdf" },
    @{ Name = "金融投资"; Path = "finance"; Slug = "finance"; Pdf = "finance-notes.pdf" },
    @{ Name = "American intonation"; Path = "american intonation"; Slug = "american-intonation"; Pdf = "american-intonation.pdf" },
    @{ Name = "记单词"; Path = "vocabulary"; Slug = "vocabulary"; Pdf = "vocabulary-notes.pdf" }
)
$BuiltPdfs = @()

if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot "node_modules/playwright/package.json"))) {
    throw "PDF dependencies are missing. Run npm ci and npm run install:browser from the repository root."
}

if ($ChangedOnly -and -not $PublishDir) {
    throw "-ChangedOnly requires -PublishDir so previous build state can be tracked."
}

function Get-ProjectFingerprint {
    param([string]$ProjectPath)

    $InputFiles = @(
        Get-ChildItem -LiteralPath $ProjectPath -File -Recurse |
            Where-Object { $_.FullName -notlike "*$([IO.Path]::DirectorySeparatorChar)_build$([IO.Path]::DirectorySeparatorChar)*" }
        Get-ChildItem -LiteralPath (Join-Path $RepoRoot "assets/fonts") -File -Recurse -ErrorAction SilentlyContinue
        Get-Item -LiteralPath $PSCommandPath
        Get-Item -LiteralPath (Join-Path $RepoRoot "scripts/export-web-pdf.cjs")
        Get-Item -LiteralPath (Join-Path $RepoRoot "scripts/pdf-toc-links.cjs")
        Get-Item -LiteralPath (Join-Path $RepoRoot "package-lock.json")
        Get-ChildItem -LiteralPath (Join-Path $RepoRoot "themes") -File -Recurse |
            Where-Object { $_.FullName -notmatch '[\\/]node_modules[\\/]' }
    ) | Sort-Object FullName

    $FingerprintSource = foreach ($File in $InputFiles) {
        $RelativePath = $File.FullName.Substring($RepoRoot.Length).TrimStart("\", "/").Replace("\", "/")
        $Stream = [IO.File]::OpenRead($File.FullName)
        $FileHasher = [Security.Cryptography.SHA256]::Create()
        try {
            $FileHash = ([BitConverter]::ToString($FileHasher.ComputeHash($Stream))).Replace("-", "")
        }
        finally {
            $FileHasher.Dispose()
            $Stream.Dispose()
        }
        "$RelativePath`n$FileHash"
    }

    $Bytes = [Text.Encoding]::UTF8.GetBytes(($FingerprintSource -join "`n"))
    $Hasher = [Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($Hasher.ComputeHash($Bytes))).Replace("-", "")
    }
    finally {
        $Hasher.Dispose()
    }
}

$BuildStatePath = if ($PublishDir) { Join-Path $PublishDir ".mini-book-build-state.json" } else { $null }
$PreviousBuildState = @{}
if ($ChangedOnly -and (Test-Path -LiteralPath $BuildStatePath)) {
    $SavedState = Get-Content -LiteralPath $BuildStatePath -Raw | ConvertFrom-Json
    foreach ($Property in $SavedState.PSObject.Properties) {
        $PreviousBuildState[$Property.Name] = $Property.Value
    }
}

$CurrentBuildState = @{}

$PreviousNodeOptions = [Environment]::GetEnvironmentVariable("NODE_OPTIONS", "Process")
$DeprecationFilter = "--disable-warning=DEP0169"
if ($PreviousNodeOptions -notlike "*$DeprecationFilter*") {
    $env:NODE_OPTIONS = (($PreviousNodeOptions, $DeprecationFilter) -join " ").Trim()
}

try {
    foreach ($Project in $Projects) {
        $ProjectPath = Join-Path $RepoRoot $Project.Path
        $Fingerprint = Get-ProjectFingerprint -ProjectPath $ProjectPath
        $CurrentBuildState[$Project.Slug] = $Fingerprint
        $Destination = if ($PublishDir) { Join-Path $PublishDir $Project.Slug } else { $null }
        $PublishedIndex = if ($Destination) { Join-Path $Destination "index.html" } else { $null }
        $ShouldBuild = -not $ChangedOnly -or
            $PreviousBuildState[$Project.Slug] -ne $Fingerprint -or
            -not (Test-Path -LiteralPath $PublishedIndex)

        if (-not $ShouldBuild) {
            Write-Host "Skipping $($Project.Slug) (unchanged)."
            continue
        }

        Write-Host "Building $($Project.Slug)..."

        # GitHub Pages hosts this repository below /<repository>/<book>/.
        # MyST uses BASE_URL to generate links and asset paths for that location.
        if ($env:GITHUB_REPOSITORY) {
            $RepositoryName = ($env:GITHUB_REPOSITORY -split "/")[-1]
            $env:BASE_URL = "/$RepositoryName/$($Project.Slug)"
        }
        elseif ($PublishDir) {
            $env:BASE_URL = "/$($Project.Slug)"
        }
        else {
            Remove-Item Env:BASE_URL -ErrorAction SilentlyContinue
        }

        Push-Location $ProjectPath
        try {
            # First render the website, then print its desktop layout to PDF.
            # Rebuild HTML afterwards so MyST bundles the newly generated PDF
            # under its correct content hash for the site's download button.
            & $MystCommand build --html --ci
            if ($LASTEXITCODE -ne 0) { throw "HTML build failed: $($Project.Name)" }
            & node (Join-Path $PSScriptRoot "export-web-pdf.cjs") $ProjectPath $Project.Pdf $env:BASE_URL
            if ($LASTEXITCODE -ne 0) { throw "Website PDF export failed: $($Project.Name)" }
            $PdfPath = Join-Path $ProjectPath "_build/exports/$($Project.Pdf)"
            if (-not (Test-Path $PdfPath)) {
                throw "PDF was not generated: $PdfPath. Review the browser export error shown above."
            }
            $BuiltPdfs += @{
                Name = $Project.Name
                Path = $PdfPath
            }
            & $MystCommand build --html --ci
            if ($LASTEXITCODE -ne 0) { throw "HTML download refresh failed: $($Project.Name)" }
        }
        finally {
            Pop-Location
        }

        if ($PublishDir) {
            New-Item -ItemType Directory -Force -Path $Destination | Out-Null
            Copy-Item -Path (Join-Path $ProjectPath "_build/html/*") -Destination $Destination -Recurse -Force
        }
    }

    if ($PublishDir) {
        New-Item -ItemType Directory -Force -Path $PublishDir | Out-Null
        Copy-Item -Path (Join-Path $RepoRoot "portal/*") -Destination $PublishDir -Recurse -Force
        $CurrentBuildState | ConvertTo-Json | Set-Content -LiteralPath $BuildStatePath -Encoding utf8
        Write-Host "Combined website created at $PublishDir"
    }
}
finally {
    [Environment]::SetEnvironmentVariable("NODE_OPTIONS", $PreviousNodeOptions, "Process")
}

# Publishing and CI jobs must remain non-interactive. When this script is run
# locally without -PublishDir, offer a numbered menu for opening a generated PDF.
if (-not $PublishDir -and -not $NoOpenPrompt -and $env:CI -ne "true" -and $BuiltPdfs.Count -gt 0) {
    Write-Host ""
    Write-Host "PDF 全部生成完成。请选择要打开的书籍：" -ForegroundColor Green
    for ($Index = 0; $Index -lt $BuiltPdfs.Count; $Index++) {
        Write-Host ("  [{0}] {1}" -f ($Index + 1), $BuiltPdfs[$Index].Name)
    }
    Write-Host "  [0] 暂不打开"

    while ($true) {
        $Selection = Read-Host "请输入编号"
        $Number = 0
        if ([int]::TryParse($Selection, [ref]$Number) -and $Number -ge 0 -and $Number -le $BuiltPdfs.Count) {
            if ($Number -eq 0) {
                Write-Host "已完成构建，未打开 PDF。"
                break
            }

            $SelectedBook = $BuiltPdfs[$Number - 1]
            Write-Host ("正在打开：{0}" -f $SelectedBook.Name) -ForegroundColor Cyan
            Start-Process -FilePath $SelectedBook.Path
            break
        }

        Write-Warning ("请输入 0 到 {0} 之间的编号。" -f $BuiltPdfs.Count)
    }
}
