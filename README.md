# Public Hosting Version

This folder is a separate deployable copy of the Grid Elements Dashboard. The original local version remains in `D:\elements\app`.

## What This Version Does

- Serves the dashboard and API from one Flask app.
- Reads and writes records from MongoDB Atlas.
- Keeps the MongoDB password on the server through environment variables.
- Includes PWA files so users can install it from mobile using "Add to Home Screen".

## Required Hosting Environment Variables

Set these in your hosting platform:

```text
MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster0.wa78rfv.mongodb.net/
MONGODB_DATABASE=elements_dashboard
MONGODB_COLLECTION=assets
ALLOWED_ORIGINS=*
```

For production, replace `ALLOWED_ORIGINS=*` with your public app URL.

## Run Locally For Testing

Create `.env` from `.env.example`, then run:

```powershell
python server.py
```

Open:

```text
http://127.0.0.1:5000
```

## Deploy

This folder includes:

- `requirements.txt`
- `Procfile`
- `runtime.txt`

It can be deployed to Render, Railway, Heroku-style platforms, or any Python web host that supports Gunicorn.

Start command:

```text
gunicorn server:app
```

## Install On Mobile

After public deployment:

1. Open the public URL in Chrome or Edge on mobile.
2. Open browser menu.
3. Tap `Add to Home screen` or `Install app`.

The app will appear with the Grid Elements icon and open like a normal mobile app.

## Data

MongoDB Atlas already contains the uploaded records:

```text
Database: elements_dashboard
Collection: assets
Documents: 1559
```
