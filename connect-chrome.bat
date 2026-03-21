@echo off
echo Restarting Chrome with remote debugging port 9222...
taskkill /F /IM chrome.exe 2>nul
timeout /t 2 /nobreak >nul
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --restore-last-session
echo Chrome started with CDP on port 9222.
echo You can now use the MCP tools — they will connect to this Chrome instance.
