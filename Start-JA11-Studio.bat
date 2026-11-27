@echo off
cd /d "%~dp0"
echo Starting JA11 Studio on http://localhost:5178 ...
start "" "http://localhost:5178"
node server.mjs
