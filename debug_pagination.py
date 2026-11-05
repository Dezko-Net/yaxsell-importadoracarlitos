import requests, os, json
ENDPOINT = "https://nyc.cloud.appwrite.io/v1"
PROJECT_ID = "6a0a4e8d0032177f3f90"
DATABASE_ID = "6a0a58ca001798410d86"
API_KEY = os.environ.get("APPWRITE_API_KEY", "")
HEADERS = {"X-Appwrite-Project": PROJECT_ID, "X-Appwrite-Key": API_KEY}

url = f"{ENDPOINT}/databases/{DATABASE_ID}/collections/products/documents"
resp = requests.get(url, headers=HEADERS, params={"limit": 100, "offset": 0})
print(f"Status: {resp.status_code}")
data = resp.json()
print(f"Total: {data.get('total')}")
print(f"Documents returned: {len(data.get('documents', []))}")
print(f"Keys in response: {list(data.keys())}")
