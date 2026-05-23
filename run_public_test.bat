@echo off
setlocal

cd /d "%~dp0"

echo Starting public-hosting version locally...
echo.
echo Create .env from .env.example before using MongoDB from this folder.
echo URL: http://127.0.0.1:5000
echo.

start "" "http://127.0.0.1:5000"
python server.py

pause
