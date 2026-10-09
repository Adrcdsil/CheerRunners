@echo off
title CheerRunners Live Server (Port 8088)
cd /d "%~dp0"

echo ====================================================
echo        STARTING CHEERRUNNERS APPLICATION
echo ====================================================
echo.
echo Checking dependencies...
if not exist node_modules (
    echo Installing dependencies...
    call npm.cmd install
)

echo.
echo Launching Node.js WebSocket & HTTP Server on Port 8088...
start "CheerRunners Node Backend" cmd /k "node server.js"

echo Waiting 2 seconds for server to initialise...
timeout /t 2 /nobreak > nul

echo.
echo Opening CheerRunners in default browser...
start http://localhost:8088

echo.
echo Server active on http://localhost:8088
echo To stop, close the Node console window.
exit
