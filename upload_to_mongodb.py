import json
import os
from pathlib import Path

from pymongo import MongoClient, ReplaceOne
import certifi


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


def load_seed_records():
    data_js = (APP_DIR / "data.js").read_text(encoding="utf-8")
    payload = json.loads(data_js.removeprefix("window.ELEMENTS_SEED_DATA = ").removesuffix(";\n"))
    records = []
    for category in payload["categories"]:
        for record in category["records"]:
            records.append(
                {
                    "id": record["id"],
                    "categoryId": category["id"],
                    "categoryTitle": category["title"],
                    "displayName": record["displayName"],
                    "fields": record["fields"],
                }
            )
    return records


def main():
    load_env_file()
    uri = os.getenv("MONGODB_URI")
    if not uri:
        raise SystemExit("MONGODB_URI is missing. Add it to app/.env or set it before running this script.")

    client = MongoClient(uri, serverSelectionTimeoutMS=20000, tlsCAFile=certifi.where())
    collection = client[DATABASE_NAME][COLLECTION_NAME]
    client.admin.command("ping")

    records = load_seed_records()
    operations = [ReplaceOne({"id": record["id"]}, record, upsert=True) for record in records]
    if operations:
        result = collection.bulk_write(operations, ordered=False)
    else:
        result = None

    collection.create_index("id", unique=True)
    collection.create_index("categoryId")
    collection.create_index("displayName")
    collection.create_index([("displayName", "text"), ("categoryTitle", "text")])

    print(f"Connected to {DATABASE_NAME}.{COLLECTION_NAME}")
    print(f"Prepared records: {len(records)}")
    if result:
        print(f"Inserted: {result.upserted_count}")
        print(f"Modified: {result.modified_count}")
        print(f"Matched: {result.matched_count}")
    print(f"Collection count: {collection.count_documents({})}")


if __name__ == "__main__":
    main()
