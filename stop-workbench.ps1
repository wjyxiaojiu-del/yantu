[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$runtimeDir = Join-Path $PSScriptRoot '.runtime'
$pidPath = Join-Path $runtimeDir 'workbench.pid'
$workerPidPath = Join-Path $runtimeDir 'codex-worker.pid'

if (-not (Test-Path -LiteralPath $pidPath)) {
    Write-Host '没有发现由启动脚本创建的工作台进程。'
} else {
    $serverPid = Get-Content -LiteralPath $pidPath | Select-Object -First 1
    $process = Get-Process -Id $serverPid -ErrorAction SilentlyContinue
    if ($process) {
        Stop-Process -Id $serverPid
        $process.WaitForExit(5000)
        Write-Host "个人工作台已停止（PID=$serverPid）。" -ForegroundColor Green
    } else {
        Write-Host '记录的工作台进程已经结束。'
    }

    Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
}

if (Test-Path -LiteralPath $workerPidPath) {
    $workerPid = Get-Content -LiteralPath $workerPidPath | Select-Object -First 1
    $workerProcess = Get-Process -Id $workerPid -ErrorAction SilentlyContinue
    if ($workerProcess) {
        Stop-Process -Id $workerPid
        Write-Host "本地 Codex Worker 已停止（PID=$workerPid）。" -ForegroundColor Green
    }
    Remove-Item -LiteralPath $workerPidPath -Force -ErrorAction SilentlyContinue
}
