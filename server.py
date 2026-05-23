import json
import os
from pathlib import Path

from bson import json_util
import certifi
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from pymongo import MongoClient, ReplaceOne


APP_DIR = Path(__file__).resolve().parent
DATABASE_NAME = os.getenv("MONGODB_DATABASE", "elements_dashboard")
COLLECTION_NAME = os.getenv("MONGODB_COLLECTION", "assets")


def load_env_file():
    env_path = APP_DIR / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"'))


load_env_file()

app = Flask(__name__, static_folder=str(APP_DIR), static_url_path="")
CORS(app, resources={r"/api/*": {"origins": os.getenv("ALLOWED_ORIGINS", "*").split(",")}})


def get_collection():
    uri = os.getenv("MONGODB_URI")
    if not uri:
        raise RuntimeError("MONGODB_URI is missing. Add it to app/.env or set it before starting the server.")
    client = MongoClient(uri, serverSelectionTimeoutMS=20000, tlsCAFile=certifi.where())
    return client[DATABASE_NAME][COLLECTION_NAME]


def as_json(value):
    return json.loads(json_util.dumps(value))


@app.get("/")
def index():
    return send_from_directory(APP_DIR, "index.html")


@app.get("/api/health")
def health():
    collection = get_collection()
    collection.database.client.admin.command("ping")
    return jsonify({"ok": True, "database": DATABASE_NAME, "collection": COLLECTION_NAME})


@app.get("/api/assets")
def list_assets():
    documents = list(get_collection().find({}, {"_id": 0}).sort([("categoryTitle", 1), ("displayName", 1)]))
    return jsonify(as_json(documents))


@app.put("/api/assets/<record_id>")
def upsert_asset(record_id):
    payload = request.get_json(force=True)
    payload["id"] = record_id
    required = ["id", "categoryId", "categoryTitle", "displayName", "fields"]
    missing = [field for field in required if field not in payload]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400
    get_collection().replace_one({"id": record_id}, payload, upsert=True)
    return jsonify({"ok": True, "record": payload})


@app.delete("/api/assets/<record_id>")
def delete_asset(record_id):
    result = get_collection().delete_one({"id": record_id})
    return jsonify({"ok": True, "deleted": result.deleted_count})


@app.post("/api/assets/bulk")
def bulk_assets():
    payload = request.get_json(force=True)
    if not isinstance(payload, list):
        return jsonify({"error": "Expected a list of records."}), 400
    operations = [ReplaceOne({"id": item["id"]}, item, upsert=True) for item in payload]
    if operations:
        get_collection().bulk_write(operations, ordered=False)
    return jsonify({"ok": True, "count": len(payload)})


if __name__ == "__main__":
    app.run(host=os.getenv("HOST", "127.0.0.1"), port=int(os.getenv("PORT", "5000")), debug=True)
