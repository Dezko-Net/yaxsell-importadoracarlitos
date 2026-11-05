import fs from 'fs';
import path from 'path';

const htmlPath = path.join(__dirname, 'public', 'shopify', 'plantilla23', 'body-clean.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// 1. Replace the multimedia-collage video URL
const oldVideoRegex = /\/shopify\/plantilla23\/assets\/media\/k-me-store-2\.myshopify\.com\/cdn\/shop\/videos\/c\/vp\/c784af076cca4c9eaa5d0d184be36a9d\/c784af076cca4c9eaa5d0d184be36a9d\.HD-1080p-7\.2Mbps-83961950\.mp4/g;
const newVideoUrl = "https://storage.googleapis.com/geminai-449212.firebasestorage.app/KEVINCOCO/lv_0_20260528020713.mp4?GoogleAccessId=imagen%40geminai-449212.iam.gserviceaccount.com&Expires=16730334000&Signature=dK%2BZiHmg4EF%2Bm2AfgH7wTyJ9zK3w27xww1CW20gibYuIRwRGF8N%2Bo5ilUxmspmaKgWdqGRqZwxw5o5i03%2FuBQUv2TLeXimuaGUwRBBLDOH%2FHJEkQ6NcEARHfxjEYqlgInYKqYZ0Gk3tqJLnum0%2F1q%2BqZtV5XPaubBjwmUjDMpr0VTzRlcqtk9fwxmec%2FveSTnS40B0PQvrkYK5YWqL9xiZ6Jf8CsmDU2z%2F8EgbS51gBs60pwjwjIvfUzEudSwoz0TskOht4jgrNMW3e05Xn2UJQ02UNi9kKa8JhTjddXXXpdSs9lMyd0MaCdLqXP%2Bq7ws9bCU4ScPkbqlOm7KQWXaA%3D%3D";
html = html.replace(oldVideoRegex, newVideoUrl);

// 2. Remove loop="loop" from these specific videos to make them pause at the end
// Let's use a regex to match the video tag that contains this new URL and remove loop="loop"
html = html.replace(/(<video[^>]*?)(loop="loop")([^>]*?>\s*<source[^>]*?lv_0_20260528020713\.mp4)/g, '$1$3');

fs.writeFileSync(htmlPath, html);
console.log("Replaced multimedia collage video and removed loop.");
