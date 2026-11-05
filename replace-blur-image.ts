import fs from 'fs';
import path from 'path';

const htmlPath = path.join(__dirname, 'public', 'shopify', 'plantilla23', 'body-clean.html');
let html = fs.readFileSync(htmlPath, 'utf8');

const oldUrlBase = "1780036106736-pegada-1780036104331.png";
const newUrl = "https://storage.googleapis.com/geminai-449212.firebasestorage.app/IADESIGN/2026/05/1780036367947-pegada-1780036366495.png?GoogleAccessId=imagen%40geminai-449212.iam.gserviceaccount.com&Expires=16730334000&Signature=SToZ0piAITNsw7g%2BDiqlSnA2BbNfCuMUAP4OIWl4hytWNjXtQd6mniXQ8cW8XrZQ7fSlBbMV5%2BDE47qzhPOzWg4WKV8X4DbNlBSdcBOlIj1eqdMT9gQySs2LIPvHeTlppuLdReSfrvtsR4rbl7mpSqOtp85lcnT35IXq7iv4c0o9WIm7qpz5CntWVlzC34yVaXKoxIXOM76COMYM9YeLVGWdQScTWGqckL5VL1bCQdNegcy9jc2pZBljv%2FNUUHEQiJqutZWXM6QveXFaRQF8ql%2FRY4O9dda3hDZWonWKeMC4Aish69DWZiFWNesFQCp7uDpQE0hyjKWJtScKx6kpFg%3D%3D";

// Replace the URL
html = html.replace(/https:\/\/storage\.googleapis\.com[^"]+1780036106736-pegada-1780036104331\.png[^"]+/g, newUrl);

// Find the img tag with the new URL and inject the blur style
html = html.replace(/(<img[^>]+1780036367947-pegada-1780036366495\.png[^>]*)(>)/g, (match, p1, p2) => {
    // Avoid duplicating if ran multiple times
    if (p1.includes('filter: blur')) return match;
    
    // Add inline style for blur and slight scale to hide blurred edges
    return `${p1} style="filter: blur(8px); transform: scale(1.05);"${p2}`;
});

fs.writeFileSync(htmlPath, html);
console.log("Successfully replaced the background image and added blur effect.");
