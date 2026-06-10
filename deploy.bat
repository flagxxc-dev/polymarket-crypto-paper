@echo off
setlocal
cd /d "%~dp0"

echo Building and starting Docker container...
docker compose up -d --build
if errorlevel 1 exit /b 1

echo.
echo Done. Open http://localhost:50003
echo View logs: docker compose logs -f
endlocal
