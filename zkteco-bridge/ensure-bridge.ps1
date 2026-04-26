$ErrorActionPreference = 'Stop'

$bridgeDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$daemonCmd = Join-Path $bridgeDir 'bridge-daemon.cmd'

if (-not (Test-Path $daemonCmd)) {
    exit 1
}

# If daemon is already running, do nothing.
$existing = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -match '^(cmd|powershell|pwsh)\.exe$' -and
    $_.CommandLine -like '*bridge-daemon.cmd*'
}

if ($existing) {
    exit 0
}

$cmdLine = "start `"`" /min `"$daemonCmd`""
Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', $cmdLine) -WorkingDirectory $bridgeDir -WindowStyle Hidden
exit 0
