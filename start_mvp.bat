@echo off
echo =======================================================
echo          AI Defect Detection System - MVP
echo =======================================================
echo.
echo Starting the AI Inspector Server...
echo Please wait — loading models into memory...
echo.

:: Change to the project directory (where app.py lives)
cd /d "%~dp0"

:: Start Flask server in the background
start /B python app.py

:: Wait for Flask to fully start (models take a few seconds to load)
echo Waiting for server to be ready...
timeout /t 4 /nobreak > nul

:: Open the browser
echo Opening dashboard at http://localhost:5000
start http://localhost:5000

echo.
echo Server is running. Close this window to stop it.
pause
