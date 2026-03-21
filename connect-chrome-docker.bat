@echo off
echo Starting Chrome + CDP Proxy for Docker...
set PROFILE_DIR=%LOCALAPPDATA%\upwork-mcp-chrome

:: Kill existing Chrome and proxy
taskkill /F /IM chrome.exe >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| find ":9223" ^| find "LISTENING"') do taskkill /F /PID %%a >nul 2>&1

:: Start Chrome with debug port (localhost only is fine)
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --remote-allow-origins=* --user-data-dir="%PROFILE_DIR%" --no-first-run https://www.upwork.com
timeout /t 2 /nobreak >nul

:: Start CDP proxy (bridges Docker → Chrome)
echo Starting CDP proxy on port 9223...
start "CDP Proxy" node "%~dp0cdp-proxy.cjs"

echo.
echo Chrome opened and CDP proxy running.
echo - Chrome debug port: 9222 (localhost only)
echo - CDP proxy port: 9223 (accessible from Docker)
echo.
echo Login to Upwork, then call manual_login in Claude.
