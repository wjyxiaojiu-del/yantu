[CmdletBinding()]
param(
    [switch]$Rebuild,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$workspaceRoot = $PSScriptRoot
$pythonPath = Join-Path $workspaceRoot 'venv\Scripts\python.exe'
$runtimeDir = Join-Path $workspaceRoot '.runtime'
$pidPath = Join-Path $runtimeDir 'workbench.pid'
$workerPidPath = Join-Path $runtimeDir 'codex-worker.pid'
$workerStdoutPath = Join-Path $runtimeDir 'codex-worker.out.log'
$workerStderrPath = Join-Path $runtimeDir 'codex-worker.err.log'
$workerTokenPath = Join-Path $runtimeDir 'codex-worker-token'
$stdoutPath = Join-Path $runtimeDir 'server.out.log'
$stderrPath = Join-Path $runtimeDir 'server.err.log'
$healthUrl = 'http://127.0.0.1:3002/healthz'
$workbenchUrl = 'http://127.0.0.1:3002/'

function Test-WorkbenchHealth {
    try {
        $response = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
        return $response.ok -eq $true
    } catch {
        return $false
    }
}

function Get-WorkbenchListenerProcessId {
    $listener = Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    return $listener.OwningProcess
}

function Import-WorkspaceEnvironment {
    $envPath = Join-Path $workspaceRoot '.env'
    if (-not (Test-Path -LiteralPath $envPath)) { return }

    foreach ($line in Get-Content -LiteralPath $envPath) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
        if ($trimmed -notmatch '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { continue }
        $name = $Matches[1]
        $value = $Matches[2].Trim()
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        [Environment]::SetEnvironmentVariable($name, $value, 'Process')
    }
}

function Ensure-LocalCodexWorker {
    if (-not $env:CODEX_WORKER_TOKEN) {
        if (Test-Path -LiteralPath $workerTokenPath) {
            $env:CODEX_WORKER_TOKEN = (Get-Content -LiteralPath $workerTokenPath -Raw).Trim()
        }
        if (-not $env:CODEX_WORKER_TOKEN) {
            $env:CODEX_WORKER_TOKEN = ([Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N'))
            Set-Content -LiteralPath $workerTokenPath -Value $env:CODEX_WORKER_TOKEN -Encoding ascii
        }
    }
    if (-not $env:CODEX_SERVER_URL) { $env:CODEX_SERVER_URL = 'http://127.0.0.1:3002' }
    if (-not $env:CODEX_TENANT_ID) { $env:CODEX_TENANT_ID = '2' }
    if (-not $env:CODEX_WORKER_ID) { $env:CODEX_WORKER_ID = $env:COMPUTERNAME }
    if (-not $env:CODEX_WORKDIR) { $env:CODEX_WORKDIR = $workspaceRoot }

    $existingWorkerPid = if (Test-Path -LiteralPath $workerPidPath) { Get-Content -LiteralPath $workerPidPath | Select-Object -First 1 } else { $null }
    if ($existingWorkerPid -and (Get-Process -Id $existingWorkerPid -ErrorAction SilentlyContinue)) { return $existingWorkerPid }

    $workerScript = Join-Path $workspaceRoot 'tools\codex-worker.py'
    $worker = Start-Process -FilePath $pythonPath -ArgumentList @('-u', ('"' + $workerScript + '"')) -WorkingDirectory $workspaceRoot -RedirectStandardOutput $workerStdoutPath -RedirectStandardError $workerStderrPath -WindowStyle Hidden -PassThru
    $worker.Id | Set-Content -LiteralPath $workerPidPath -Encoding ascii
    return $worker.Id
}

Set-Location -LiteralPath $workspaceRoot

if (-not (Test-Path -LiteralPath $pythonPath)) {
    throw "找不到项目虚拟环境：$pythonPath`n请先创建 venv 并安装 server\requirements.txt。"
}

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
Import-WorkspaceEnvironment
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null

# Prepare the local Worker token before the backend process starts so both
# processes inherit the same secret.
if (-not $env:CODEX_WORKER_TOKEN) {
    if (Test-Path -LiteralPath $workerTokenPath) {
        $env:CODEX_WORKER_TOKEN = (Get-Content -LiteralPath $workerTokenPath -Raw).Trim()
    }
    if (-not $env:CODEX_WORKER_TOKEN) {
        $env:CODEX_WORKER_TOKEN = ([Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N'))
        Set-Content -LiteralPath $workerTokenPath -Value $env:CODEX_WORKER_TOKEN -Encoding ascii
    }
}

if ($Rebuild -or -not (Test-Path -LiteralPath (Join-Path $workspaceRoot 'dist\index.html'))) {
    Write-Host '正在构建前端…' -ForegroundColor Cyan
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw '前端构建失败，工作台没有启动。' }
}

if (Test-WorkbenchHealth) {
    $workerPid = Ensure-LocalCodexWorker
    Write-Host '个人工作台已经在运行。' -ForegroundColor Green
    Write-Host "本地 Codex Worker 已启动（PID=$workerPid）。" -ForegroundColor Green
    if (-not $NoBrowser) { Start-Process $workbenchUrl }
    exit 0
}

if (Test-Path -LiteralPath $pidPath) {
    $oldPid = Get-Content -LiteralPath $pidPath -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($oldPid -and (Get-Process -Id $oldPid -ErrorAction SilentlyContinue)) {
        throw "检测到尚未就绪的工作台进程 PID=$oldPid。请先运行 .\stop-workbench.ps1，再重新启动。"
    }
    Remove-Item -LiteralPath $pidPath -Force
}

Write-Host '正在启动个人工作台…' -ForegroundColor Cyan
$startArguments = @{
    FilePath = $pythonPath
    ArgumentList = @('-m', 'server.main')
    WorkingDirectory = $workspaceRoot
    RedirectStandardOutput = $stdoutPath
    RedirectStandardError = $stderrPath
    WindowStyle = 'Hidden'
    PassThru = $true
}
$process = Start-Process @startArguments
$process.Id | Set-Content -LiteralPath $pidPath -Encoding ascii

$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline) {
    if (Test-WorkbenchHealth) {
        $listenerPid = Get-WorkbenchListenerProcessId
        if ($listenerPid) { $listenerPid | Set-Content -LiteralPath $pidPath -Encoding ascii }
        $workerPid = Ensure-LocalCodexWorker
        Write-Host "个人工作台已启动：http://127.0.0.1:3002/（PID=$listenerPid）" -ForegroundColor Green
        Write-Host "本地 Codex Worker 已启动（PID=$workerPid）。" -ForegroundColor Green
        if (-not $NoBrowser) { Start-Process $workbenchUrl }
        exit 0
    }
    if ($process.HasExited) { break }
    Start-Sleep -Milliseconds 500
}

if (-not $process.HasExited) {
    Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
}
Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
$details = if (Test-Path -LiteralPath $stderrPath) { (Get-Content -LiteralPath $stderrPath -Tail 20) -join "`n" } else { '没有错误日志。' }
throw "个人工作台没有在 30 秒内启动成功。`n$details"
