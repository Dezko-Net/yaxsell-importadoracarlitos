import fs from 'fs';
import path from 'path';

const htmlPath = path.join(__dirname, 'public', 'shopify', 'plantilla23', 'body-clean.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// Find the video element containing the target URL and inject styles
const targetUrl = "https://storage.googleapis.com/geminai-449212.firebasestorage.app/KEVINCOCO/lv_0_20260528021828.mp4";
// The newVideoUrl has a bunch of query params, we can just search for "lv_0_20260528021828.mp4"

let replaceCount = 0;
// We look for <video ...> ... lv_0_20260528021828.mp4 ... </video>
html = html.replace(/<video\b[^>]*>[\s\S]*?<\/video>/g, (match) => {
    if (match.includes('lv_0_20260528021828.mp4')) {
        replaceCount++;
        // Remove the old injected style
        let cleaned = match.replace(/ style="[^"]*"/g, '');
        
        // Use a 4-sided linear gradient mask for perfect feathered edges on a rectangle
        const newStyle = ` style="transform: scale(0.9); transform-origin: center center; -webkit-mask-image: linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%), linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%); -webkit-mask-composite: source-in; mask-image: linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%), linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%); mask-composite: intersect; transition: transform 0.3s;"`;
        
        return cleaned.replace('<video ', `<video ${newStyle} `);
    }
    return match;
});

console.log(`Fixed fade on ${replaceCount} video tags.`);
fs.writeFileSync(htmlPath, html);
