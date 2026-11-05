import fs from 'fs';
import path from 'path';

const htmlPath = path.join(__dirname, 'public', 'shopify', 'plantilla23', 'body-clean.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// 1. Replace the background image of Herobanner 2
const oldImageUrlRegex = /https:\/\/firebasestorage\.googleapis\.com[^"]+Picsart_26-05-29_02-42-11-047\.jpg\.jpeg[^"]+/g;
const newImageUrl = "https://storage.googleapis.com/geminai-449212.firebasestorage.app/IADESIGN/2026/05/1780037249842-pegada-1780037248457.png?GoogleAccessId=imagen%40geminai-449212.iam.gserviceaccount.com&Expires=16730334000&Signature=eTYx9CuJHkhvWSS9b40L31VAi62Nozc6It8irgRJdJ3bFbyfjwnFl92%2FYJQuqVutsYd80EkdueS4pGKuYjISRdreirhjiMR%2BWTr7xB45%2BRpz52XMN5t%2BnLLwQXGPPzr313%2Fut3%2BF27Niw3NGtWMX17aiwl6ByRIBtl1jfojevNd%2BBO3rfr63cBK2r57QPp4IFWhhsPJw3ufggS2Flzi%2B%2FN7V%2Bw%2B%2B1yqUishPXSAYHbwnKUOGFFdDWH00yT6%2BHfzWL6LhHYqD4EZSW8GgmjUUUIQ7FD%2B08mFrNTRLrZrvU1ij5O8X%2Fn46Dj4ay6c6AAiUQ%2B5keHz9tJx1Mz6DMYAABg%3D%3D";
html = html.replace(oldImageUrlRegex, newImageUrl);

// 2. Replace the split hero video URL
const oldSplitHeroRegex = /\/shopify\/plantilla23\/assets\/media\/k-me-store-2\.myshopify\.com\/cdn\/shop\/videos\/c\/vp\/4bdf00c4fc954008904960bbb12bbe55\/4bdf00c4fc954008904960bbb12bbe55\.HD-1080p-7\.2Mbps-84134145\.mp4/g;
const newSplitHeroUrl = "https://firebasestorage.googleapis.com/v0/b/geminai-449212.firebasestorage.app/o/4bdf00c4fc954008904960bbb12bbe55.HD-1080p-7.2Mbps-84134145.realesrgan.mp4?alt=media&token=b1737287-9fb5-401e-b625-da22d272c0b4";
html = html.replace(oldSplitHeroRegex, newSplitHeroUrl);

fs.writeFileSync(htmlPath, html);
console.log("Replaced image and split-hero video successfully.");
