import os
import sys
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

# Configuración de Appwrite
APPWRITE_ENDPOINT = os.getenv('NEXT_PUBLIC_APPWRITE_ENDPOINT')
APPWRITE_PROJECT_ID = os.getenv('NEXT_PUBLIC_APPWRITE_PROJECT_ID')
APPWRITE_API_KEY = os.getenv('APPWRITE_API_KEY')
DATABASE_ID = os.getenv('APPWRITE_DATABASE_ID')
PRODUCTS_COLLECTION_ID = os.getenv('PRODUCTS_COLLECTION_ID')

if not all([APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, DATABASE_ID, PRODUCTS_COLLECTION_ID]):
    print("Error: Faltan variables de entorno. Verifica tu archivo .env")
    sys.exit(1)

try:
    from appwrite.client import Client
    from appwrite.services.databases import Databases
    from appwrite.id import ID
except ImportError:
    print("Error: No se encontró el SDK de Appwrite. Instálalo con: pip install appwrite")
    sys.exit(1)

# Configurar cliente Appwrite
client = Client()
client.set_endpoint(APPWRITE_ENDPOINT)
client.set_project(APPWRITE_PROJECT_ID)
client.set_key(APPWRITE_API_KEY)

databases = Databases(client)

# Datos del Mega Pack Favoritos
mega_pack_data = {
    'NAME': 'Mega Pack Favoritos (10 Productos · 15 Unidades)',
    'DESCRIPTION': 'Pack especial con 10 productos favoritos de Kevin & Coco. Incluye base de maquillaje, iluminadores, polvo suelto, paleta de rubores, corrector, paleta de sombras, toallitas, brocha, brillos labiales y delineador. Total 15 unidades. ¡El mejor precio!',
    'PRICE': 15990,
    'STOCK': 50,
    'COST': 8000,
    'CURRENTPRICE': None,
    'WHOLESALEPRICE': 0,
    'WHOLESALEMINQUANTITY': 0,
    'PACKQTY': 0,
    'IMAGEURL': 'https://storage.googleapis.com/asistoraerp.firebasestorage.app/IADESIGN/2026/07/1783012128460-pegada-1783012124985.png',
    'IMAGEURL2': '',
    'IMAGEURL3': '',
    'CATEGORYID': '',
    'SUBCATEGORYID': '',
    'SUBSUBCATEGORYID': '',
    'FEATURES': 'DisableDiscounts: true\nBundlePack: true\nBundleProducts: 10\nBundleUnits: 15',
    'TAGS': ['mega-pack', 'favoritos', 'bundle'],
    'sku': 'MEGA-PACK-FAV-10',
    'section': None
}

print("Creando producto Mega Pack Favoritos...")
print(f"Nombre: {mega_pack_data['NAME']}")
print(f"Precio: ${mega_pack_data['PRICE']}")
print(f"Stock: {mega_pack_data['STOCK']}")
print(f"SKU: {mega_pack_data['sku']}")
print(f"Descuentos bloqueados: {mega_pack_data['FEATURES']}")

try:
    result = databases.create_document(
        DATABASE_ID,
        PRODUCTS_COLLECTION_ID,
        ID.unique(),
        mega_pack_data
    )
    print(f"\n✅ Producto creado exitosamente!")
    print(f"ID: {result['$id']}")
    print(f"Nombre: {result['NAME']}")
    print(f"SKU: {result.get('sku', 'N/A')}")
except Exception as e:
    print(f"\n❌ Error al crear el producto: {e}")
    sys.exit(1)
