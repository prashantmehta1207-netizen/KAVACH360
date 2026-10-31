@echo off
cd /d "%~dp0\.."
if not exist .venv py -m venv .venv
call .venv\Scripts\activate
py -m pip install --upgrade pip
pip install -r backend\requirements.txt
if not exist .env copy .env.example .env
py -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
