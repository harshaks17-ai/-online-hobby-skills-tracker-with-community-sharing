param([string]$Mode = "start", [int]$Port = 8000)
$root = "H:\project_2"
$py = "$root\backend\.venv\Scripts\python.exe"

# Only ever target our own uvicorn process - matched by its python executable
# path plus the run.py argument. Never a blanket "kill python".
$mine = Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" |
        Where-Object { $_.CommandLine -and $_.CommandLine -like "*project_2*run.py*" }

if ($mine) {
  foreach ($proc in $mine) {
    Write-Output "stopping PID $($proc.ProcessId)"
    [System.Diagnostics.Process]::GetProcessById($proc.ProcessId).Kill()
  }
  Start-Sleep -Seconds 3
}

if ($Mode -eq "stop") { Write-Output "stopped."; exit 0 }

Start-Process -FilePath $py -ArgumentList "run.py","--port",$Port -WorkingDirectory "$root\backend" `
  -WindowStyle Hidden -RedirectStandardOutput "$root\backend\server.log" -RedirectStandardError "$root\backend\server.err"
Write-Output "launched on $Port"
