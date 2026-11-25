@echo off
REM Quita Escritorio Widgets del inicio de Windows (borra la entrada de HKCU Run).
REM Lanzar con doble clic desde el Explorador o con explorer.exe, NO desde la app de Claude:
REM esa app es MSIX y virtualiza HKCU, asi que no tocaria el registro real.
REM Verificar con: powershell "Get-CimInstance Win32_StartupCommand | ? Name -like '*escritorio*'"

reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "EscritorioWidgets" /f
if errorlevel 1 (
  echo No habia entrada de inicio para Escritorio Widgets, o no se pudo borrar.
) else (
  echo Escritorio Widgets ya no arranca con Windows.
)
pause
