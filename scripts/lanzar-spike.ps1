# Lanza el spike con redirección a archivos (nunca por tubería) y espera con tope de tiempo.
param([string]$Salida = "$env:TEMP\spike-out.txt", [string]$Capturas = "")
$p = Split-Path -Parent $PSScriptRoot
$err = "$Salida.err"
if ($Capturas) { New-Item -ItemType Directory -Force $Capturas | Out-Null; $env:SPIKE_CAPTURAS = $Capturas }
$pr = Start-Process -FilePath "$p\node_modules\electron\dist\electron.exe" -ArgumentList "`"$p\spike\spike.js`"" -WorkingDirectory $p -RedirectStandardOutput $Salida -RedirectStandardError $err -PassThru -WindowStyle Hidden
if (-not $pr.WaitForExit(120000)) { $pr.Kill(); Write-Output 'TIMEOUT' }
Write-Output "salida: $Salida"
