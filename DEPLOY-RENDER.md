# KAVACH360 AI — Render deployment (hackathon demo)

This deployment uses one Render Python web service for the existing FastAPI app and its bundled HTML/CSS/Vanilla-JavaScript frontend. Gemma 4 inference is routed to Ollama's hosted API; the Ollama API key stays in Render environment variables and is never placed in frontend code or Git.

## Before you start

- Push the project to the existing GitHub repository `prashantmehta1207-netizen/KAVACH360` on branch `main`.
- Create an Ollama API key at https://ollama.com/settings/keys.
- Ollama's direct cloud API uses `https://ollama.com/api`; the API model name used here is `gemma4:31b`.
- Ollama cloud model usage is metered. Check current prices and account credits at https://ollama.com/pricing before running video analysis.

## Apply the deployment patch

Copy the files in this patch into the root of the existing KAVACH360 project, preserving their paths:

- `backend/ai.py`
- `backend/main.py`
- `render.yaml`

The backend patch adds optional `Authorization: Bearer ...` support. Local development keeps working without an API key and continues to use `http://127.0.0.1:11434` and `gemma4:e2b` from `.env`.

## Push to GitHub

From Terminal on the Mac:

```bash
cd ~/Desktop/hacto/KAVACH360
git remote -v
git status
```

Confirm that `origin` points to `https://github.com/prashantmehta1207-netizen/KAVACH360.git`. Then run:

```bash
git add backend/ai.py backend/main.py render.yaml
git commit -m "Prepare KAVACH360 for Render deployment"
git push origin main
```

Do not use `git push --force`.

## Create the Render service

1. Sign in at https://render.com using GitHub.
2. In the Render Dashboard choose **New** → **Blueprint**.
3. Select the `prashantmehta1207-netizen/KAVACH360` repository and the `main` branch. Render reads `render.yaml` from the repository root.
4. When asked for `OLLAMA_API_KEY`, paste the key created in Ollama. Do not paste this key into Terminal commands, source files, GitHub, or ChatGPT.
5. Create / apply the Blueprint and watch the Deploys log until it says the deploy is live.
6. Open the `onrender.com` URL shown by Render.

## Verify the deployment

Open these URLs, replacing `YOUR-SERVICE` with the service name Render gives you:

- `https://YOUR-SERVICE.onrender.com/` — KAVACH360 dashboard
- `https://YOUR-SERVICE.onrender.com/api/health` — backend and Ollama model connection status
- `https://YOUR-SERVICE.onrender.com/docs` — FastAPI API documentation

Then test with a small, non-sensitive sample video. A successful app page alone does not prove that remote Gemma 4 inference works; complete one video analysis to verify the model connection.

## Free-plan limitations — important

- Render free web services can spin down after 15 minutes without traffic, so the first visit after inactivity can take around a minute to wake up.
- Free Render services have an ephemeral filesystem. SQLite data, uploaded videos, extracted frames, uploaded SOP PDFs, and generated reports can be lost after a restart or redeploy. Use only demo/sample data on this free deployment.
- Render persistent disks are a paid-service feature. For a long-lived deployment, move the database to managed PostgreSQL and uploaded files to durable object storage, or use an appropriate paid persistent disk configuration.
- Ollama cloud model calls are billed by token usage/credits. Render hosting and Ollama inference are separate services with separate limits/pricing.
- This prototype is decision support only. Keep human verification enabled; do not treat AI observations as certified safety decisions.
