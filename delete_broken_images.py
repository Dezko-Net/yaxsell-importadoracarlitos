"""
Analiza productos con imagenes rotas y los elimina.
Uso: python delete_broken_images.py

Requisitos: pip install requests

Antes de ejecutar, setea la API key de Appwrite:
  set APPWRITE_API_KEY=tu_api_key_aqui
"""

import requests
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import quote

# Appwrite config
ENDPOINT = "https://nyc.cloud.appwrite.io/v1"
PROJECT_ID = "6a0a4e8d0032177f3f90"
DATABASE_ID = "6a0a58ca001798410d86"
API_KEY = os.environ.get("APPWRITE_API_KEY", "")

COLLECTIONS = [
    ("products", "products"),
    ("catalog_products", "catalog_products"),
    ("inventory_products", "inventory_products"),
]

HEADERS = {
    "X-Appwrite-Project": PROJECT_ID,
    "Content-Type": "application/json",
}

if API_KEY:
    HEADERS["X-Appwrite-Key"] = API_KEY


def check_image(url):
    """Check if an image URL is valid by loading it and verifying content-type."""
    if not url or not url.strip():
        return "empty"
    try:
        resp = requests.get(url, timeout=15, allow_redirects=True, stream=True)
        if resp.status_code != 200:
            return "broken"
        content_type = resp.headers.get("content-type", "").lower()
        # Check if it's actually an image
        if "image" in content_type:
            return "ok"
        # Some servers don't send proper content-type, check first bytes
        first_bytes = next(resp.iter_content(1024), b"")
        resp.close()
        if first_bytes.startswith(b"\xff\xd8") or first_bytes.startswith(b"\x89PNG") or first_bytes.startswith(b"GIF8") or first_bytes.startswith(b"RIFF"):
            return "ok"
        # If it's HTML, it's broken (error page)
        if "html" in content_type or first_bytes.startswith(b"<") or first_bytes.startswith(b"{"):
            return "broken"
        return "broken"
    except Exception:
        return "broken"


def fetch_all_products(collection_id):
    """Fetch all products from a collection with pagination."""
    all_docs = []
    offset = 0
    limit = 25  # Appwrite caps at 25 per request
    while True:
        url = f"{ENDPOINT}/databases/{DATABASE_ID}/collections/{collection_id}/documents"
        params = {"limit": limit, "offset": offset}
        resp = requests.get(url, headers=HEADERS, params=params)
        if resp.status_code != 200:
            print(f"  Error fetching {collection_id}: {resp.status_code} - {resp.text[:200]}")
            break
        data = resp.json()
        docs = data.get("documents", [])
        total = data.get("total", 0)
        all_docs.extend(docs)
        sys.stdout.write(f"\r  Fetched {len(all_docs)}/{total}...")
        sys.stdout.flush()
        if len(docs) < limit or len(all_docs) >= total:
            break
        offset += limit
    print(f"\n  Done: {len(all_docs)} from {collection_id}")
    return all_docs


def delete_product(collection_id, doc_id):
    """Delete a product document."""
    url = f"{ENDPOINT}/databases/{DATABASE_ID}/collections/{collection_id}/documents/{doc_id}"
    resp = requests.delete(url, headers=HEADERS)
    return resp.status_code == 200


def main():
    if not API_KEY:
        print("ERROR: Setea APPWRITE_API_KEY primero:")
        print("  set APPWRITE_API_KEY=tu_api_key_aqui")
        print("\nObtenla en: Appwrite Console -> Settings -> API Keys")
        sys.exit(1)

    print("=" * 60)
    print("ANALISIS DE IMAGENES ROTAS - ELIMINACION AUTOMATICA")
    print("=" * 60)

    all_products = []
    for col_name, col_id in COLLECTIONS:
        print(f"\nObteniendo productos de: {col_name}...")
        docs = fetch_all_products(col_id)
        print(f"  -> {len(docs)} productos encontrados")
        for d in docs:
            d["_collection"] = col_id
            d["_collection_name"] = col_name
        all_products.extend(docs)

    print(f"\nTOTAL productos: {len(all_products)}")
    print("\nRevisando imagenes... (esto puede tardar)\n")

    broken = []
    empty = []
    ok_count = 0

    # Check images in parallel (10 at a time)
    with ThreadPoolExecutor(max_workers=10) as executor:
        future_to_product = {
            executor.submit(check_image, p.get("IMAGEURL", "")): p
            for p in all_products
        }
        done = 0
        for future in as_completed(future_to_product):
            product = future_to_product[future]
            status = future.result()
            done += 1
            sys.stdout.write(f"\rRevisados: {done}/{len(all_products)}")
            sys.stdout.flush()

            if status == "broken":
                broken.append(product)
            elif status == "empty":
                empty.append(product)
            else:
                ok_count += 1

    print(f"\n\n{'=' * 60}")
    print(f"REPORTE:")
    print(f"  OK:         {ok_count}")
    print(f"  Rotas:      {len(broken)}")
    print(f"  Sin imagen: {len(empty)}")
    print(f"{'=' * 60}")

    if broken:
        print(f"\n--- PRODUCTOS CON IMAGEN ROTA (a eliminar) ---")
        for p in broken:
            sku = p.get("SKU", "")
            if not sku and p.get("FEATURES"):
                features = p.get("FEATURES", "")
                if isinstance(features, list):
                    features = "\n".join(features)
                for line in features.split("\n"):
                    if line.strip().upper().startswith("SKU:"):
                        sku = line.split(":", 1)[1].strip()
                        break
            print(f"  ID: {p['$id']} | SKU: {sku} | Nombre: {p.get('NAME', 'N/A')}")
            print(f"    URL: {p.get('IMAGEURL', 'N/A')}")
            print(f"    Coleccion: {p['_collection_name']}")

        print(f"\nSe eliminaran {len(broken)} productos con imagen rota.")
        confirm = input("\nEscriba 'ELIMINAR' para confirmar: ")

        if confirm == "ELIMINAR":
            print("\nEliminando productos...")
            deleted = 0
            failed = 0
            for p in broken:
                if delete_product(p["_collection"], p["$id"]):
                    deleted += 1
                    print(f"  OK  - {p.get('NAME', 'N/A')} ({p['$id']})")
                else:
                    failed += 1
                    print(f"  FAIL - {p.get('NAME', 'N/A')} ({p['$id']})")
                time.sleep(0.3)  # Rate limit

            print(f"\nEliminados: {deleted}")
            print(f"Fallidos:   {failed}")
        else:
            print("\nEliminacion cancelada.")
    else:
        print("\nNo hay productos con imagen rota. Todo OK!")

    if empty:
        print(f"\n--- PRODUCTOS SIN IMAGEN (no se eliminan) ---")
        for p in empty:
            sku = p.get("SKU", "N/A")
            print(f"  ID: {p['$id']} | SKU: {sku} | Nombre: {p.get('NAME', 'N/A')}")


if __name__ == "__main__":
    main()
