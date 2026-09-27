param(
    [int]$Port = 8000,
    [string]$PublishDir = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not $PublishDir) {
    $PublishDir = Join-Path $RepoRoot "publish"
}
elseif (-not [IO.Path]::IsPathRooted($PublishDir)) {
    $PublishDir = Join-Path $RepoRoot $PublishDir
}

& (Join-Path $PSScriptRoot "build-all.ps1") -PublishDir $PublishDir -ChangedOnly

$Url = "http://localhost:$Port/"
$ServerIsRunning = $false
try {
    $Response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
    if ($Response.StatusCode -eq 200 -and $Response.Content -match '\./computer/') {
        $ServerIsRunning = $true
    }
    else {
        throw "Port $Port is already serving a different website. Choose another port, for example: .\scripts\preview.cmd -Port 8001"
    }
}
catch {
    if ($_.Exception.Message -like "Port $Port is already serving*") {
        throw
    }
    $ServerIsRunning = $false
}

if (-not $ServerIsRunning) {
    $Python = Get-Command python -ErrorAction Stop
    $Process = Start-Process -FilePath $Python.Source `
        -ArgumentList @("-m", "http.server", $Port, "--directory", $PublishDir) `
        -WorkingDirectory $RepoRoot -WindowStyle Hidden -PassThru

    $Ready = $false
    for ($Attempt = 0; $Attempt -lt 20; $Attempt++) {
        Start-Sleep -Milliseconds 250
        if ($Process.HasExited) {
            throw "The local HTTP server exited before it became ready."
        }
        try {
            $Response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 1
            if ($Response.StatusCode -eq 200) {
                $Ready = $true
                break
            }
        }
        catch {}
    }
    if (-not $Ready) {
        throw "The local HTTP server did not become ready at $Url."
    }
    Write-Host "Local server started (PID $($Process.Id))."
}
else {
    Write-Host "Reusing the server already running at $Url"
}

Start-Process $Url
Write-Host "Opened $Url"
