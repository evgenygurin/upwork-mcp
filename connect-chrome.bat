@echo off
echo Starting Chrome for MCP automation (separate profile, port 9222)...
set PROFILE_DIR=%LOCALAPPDATA%\upwork-mcp-chrome
if not exist "%PROFILE_DIR%" mkdir "%PROFILE_DIR%"
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 --remote-allow-origins=* --user-data-dir="%PROFILE_DIR%" --no-first-run https://www.upwork.com/ab/account-security/login
echo Chrome opened at Upwork login page.
echo Login to Upwork, then call manual_login in Claude.
