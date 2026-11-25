@echo off
setlocal
REM Registra Escritorio Widgets para que arranque con Windows (clave Run de HKCU).
REM Lanzar con doble clic desde el Explorador o con explorer.exe, NO desde la app de Claude:
REM esa app es MSIX y virtualiza HKCU, asi que la entrada no quedaria en el registro real.
REM Verificar con: powershell "Get-CimInstance Win32_StartupCommand | ? Name -like '*escritorio*'"

set "PROY=%~dp0"
set "PROY=%PROY:~0,-1%"
set "EXE=%PROY%\node_modules\electron\dist\electron.exe"
set "VALOR=\"%EXE%\" \"%PROY%\""

if not exist "%EXE%" (
  echo No se encontro Electron en "%EXE%"
  echo Ejecuta primero: npm install   ^(dentro de "%PROY%"^)
  pause
  exit /b 1
)

reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "EscritorioWidgets" /t REG_SZ /d "%VALOR%" /f
if errorlevel 1 (
  echo No se pudo escribir la entrada de inicio en el registro.
  pause
  exit /b 1
)

start "" "%EXE%" "%PROY%"

echo Escritorio Widgets quedo registrado para arrancar con Windows y se abrio ahora.
echo Para quitarlo del inicio, ejecuta quitar-inicio.bat
pause
