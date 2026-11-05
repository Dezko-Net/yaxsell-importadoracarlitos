import fs from 'fs';
import path from 'path';

const htmlPath = path.join(__dirname, 'public', 'shopify', 'plantilla23', 'body-clean.html');
if (!fs.existsSync(htmlPath)) {
    console.log("body-clean.html does NOT exist yet.");
    process.exit(0);
}

const html = fs.readFileSync(htmlPath, 'utf8');

console.log("Checking current state of body-clean.html...");

// Check logo
const logoMatch = html.match(/class="[^"]*logo[^"]*"[^>]*>/);
console.log("Logo tag:", logoMatch ? logoMatch[0].substring(0, 150) : "Not found");

// Check videos
const hasAea = html.includes('aea.mp4');
console.log("Has aea.mp4:", hasAea);

const hasLv0 = html.includes('lv_0_20260528021828.mp4');
console.log("Has lv_0_20260528021828.mp4 (new video):", hasLv0);

const oldTargetVideo = "d94f51416ef54d89945c16c93ad5c2f8";
const hasOldVideo = html.includes(oldTargetVideo);
console.log("Has old d94f... video:", hasOldVideo);

// Check banner image
const hasPicsart = html.includes('Picsart_26-05-29_00-36-01-936.jpg.jpeg');
console.log("Has new Picsart image:", hasPicsart);

const hasChatGPT = html.includes('ChatGPT_Image_May_12_2026_12_50_23_PM.png');
console.log("Has old ChatGPT image:", hasChatGPT);
