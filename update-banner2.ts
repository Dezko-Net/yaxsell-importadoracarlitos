import fs from 'fs';
import path from 'path';

const htmlPath = path.join(__dirname, 'public', 'shopify', 'plantilla23', 'body-clean.html');
const homePagePath = path.join(__dirname, 'src', 'templates', 'plantilla23', 'HomePage.tsx');

let html = fs.readFileSync(htmlPath, 'utf8');
let homePage = fs.readFileSync(homePagePath, 'utf8');

const newVideoUrl = "https://firebasestorage.googleapis.com/v0/b/geminai-449212.firebasestorage.app/o/ete.mp4?alt=media&token=ed109fb5-471b-49e7-a419-8a955554e3cb";

// 1. Replace the old video URL in HTML
html = html.replace(/https:\/\/storage\.googleapis\.com\/geminai-449212\.firebasestorage\.app\/KEVINCOCO\/lv_0_20260528021828\.mp4[^"]*/g, newVideoUrl);

// 2. Increase blur in HTML
html = html.replace(/filter: blur\(8px\)/g, "filter: blur(20px)");

// 3. Update HomePage.tsx selector
homePage = homePage.replace(/lv_0_20260528021828/g, "ete.mp4");

fs.writeFileSync(htmlPath, html);
fs.writeFileSync(homePagePath, homePage);

console.log("Successfully increased blur, replaced video, and updated HomePage.tsx logic.");
