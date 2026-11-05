import urllib.request
import json
from PIL import Image
import io

url = "https://raw.githubusercontent.com/d3/d3-geo/master/img/equirectangular.png"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
response = urllib.request.urlopen(req)
img_data = response.read()

img = Image.open(io.BytesIO(img_data)).convert("RGB")
# We use NEAREST so we don't blend colors, keeping distinct R vs B relation
img = img.resize((128, 64), Image.NEAREST)

pixels = list(img.getdata())

rows = []
for y in range(64):
    row_bits = ""
    for x in range(128):
        r, g, b = pixels[y * 128 + x]
        # Land is brownish, Sea is blueish
        if r > b:
            row_bits += "1"
        else:
            row_bits += "0"
    rows.append(row_bits)

with open("C:\\Proyectos\\PROJECT YAXSEL\\web-store\\world_128x64.json", "w") as f:
    json.dump(rows, f, indent=2)

print("SUCCESS")
