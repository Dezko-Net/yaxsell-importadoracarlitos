import requests, os
ENDPOINT = "https://nyc.cloud.appwrite.io/v1"
PROJECT_ID = "6a0a4e8d0032177f3f90"
DATABASE_ID = "6a0a58ca001798410d86"
API_KEY = os.environ.get("APPWRITE_API_KEY", "")
HEADERS = {"X-Appwrite-Project": PROJECT_ID, "X-Appwrite-Key": API_KEY}

r = requests.get(f"{ENDPOINT}/databases/{DATABASE_ID}/collections", headers=HEADERS, params={"limit": 100})
print(f"Status: {r.status_code}")
for c in r.json().get("collections", []):
    cid = c["$id"]
    cname = c.get("name", "")
    # Count documents
    r2 = requests.get(f"{ENDPOINT}/databases/{DATABASE_ID}/collections/{cid}/documents", headers=HEADERS, params={"limit": 1})
    total = r2.json().get("total", 0) if r2.status_code == 200 else "?"
    print(f"  {cid:40s} | {cname:40s} | docs: {total}")
