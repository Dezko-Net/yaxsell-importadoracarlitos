import fs from 'fs';
import path from 'path';

const htmlPath = path.join(__dirname, 'public', 'shopify', 'plantilla23', 'body-clean.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// 1. Replace the background image of Herobanner 2
const oldImageUrlRegex = /https:\/\/storage\.googleapis\.com[^"]+1780036367947-pegada-1780036366495\.png[^"]+/g;
const newImageUrl = "https://firebasestorage.googleapis.com/v0/b/geminai-449212.firebasestorage.app/o/Picsart_26-05-29_02-42-11-047.jpg.jpeg?alt=media&token=9318a02a-7e93-4b65-b9d6-4cbd4961ff43";
html = html.replace(oldImageUrlRegex, newImageUrl);

// 2. Reduce blur from 20px to 10px
html = html.replace(/filter: blur\(20px\)/g, "filter: blur(10px)");

// 3. Remove pingpong-video ID and onclick from all videos
html = html.replace(/id="pingpong-video"/g, "");
html = html.replace(/onclick="this\.paused \? this\.play\(\) : this\.pause\(\)"/g, "");

fs.writeFileSync(htmlPath, html);
console.log("Replaced image, adjusted blur, and sanitized video tags.");
