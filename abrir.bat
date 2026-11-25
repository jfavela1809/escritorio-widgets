@echo off
REM Abre Escritorio Widgets sin registrarla en el inicio de Windows.
REM Lanzar con doble clic o con explorer.exe (fuera del paquete de la app de Claude).
set "PROY=%~dp0"
set "PROY=%PROY:~0,-1%"
start "" "%PROY%\node_modules\electron\dist\electron.exe" "%PROY%"
