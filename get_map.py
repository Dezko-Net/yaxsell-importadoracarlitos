import urllib.request
import json
from PIL import Image
import io

url = "https://upload.wikimedia.org/wikipedia/commons/8/80/World_map_-_low_resolution.png"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
response = urllib.request.urlopen(req)
img_data = response.read()

img = Image.open(io.BytesIO(img_data)).convert("L")
img = img.resize((128, 64), Image.NEAREST)

pixels = list(img.getdata())

# Create a hex string array (each string = 1 row = 128 bits = 32 hex chars)
# The image is usually dark for land, light for ocean. Wait, let's check it.
# Usually we can threshold at 128.
rows = []
for y in range(64):
    row_bits = ""
    for x in range(128):
        val = pixels[y * 128 + x]
        # if val < 128 it's land (usually coastlines are dark, land is dark, ocean is white) or vice versa.
        # So we just use val > 128 for white, check max
        bit = "1" if val < 128 else "0"
        row_bits += bit
    
    # covert every 4 bits to hex
    hex_str = ""
    for i in range(0, 128, 4):
        hex_str += format(int(row_bits[i:i+4], 2), 'x')
    rows.append(hex_str)

with open("c:\\Proyectos\\PROJECT YAXSEL\\web-store\\world_hex.json", "w") as f:
    json.dump(rows, f, indent=2)

print("Done")
