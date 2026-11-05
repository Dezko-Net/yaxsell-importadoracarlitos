import fs from 'fs';
import path from 'path';

const htmlPath = path.join(__dirname, 'public', 'shopify', 'plantilla23', 'body-clean.html');
let html = fs.readFileSync(htmlPath, 'utf8');

const targetUrl = "https://storage.googleapis.com/geminai-449212.firebasestorage.app/KEVINCOCO/lv_0_20260528021828.mp4";
const regex = new RegExp(`(<video [^>]*src="${targetUrl.replace(/\//g, '\\/').replace(/\./g, '\\.')}[^"]*"[^>]*>)`, 'g');

// We need to replace the style in the video tag.
// Previously I added: ` style="transform: scale(0.85); -webkit-mask-image: radial-gradient(ellipse at center, black 50%, transparent 100%); mask-image: radial-gradient(ellipse at center, black 50%, transparent 100%); transition: transform 0.3s;"`
// We will replace that with a better mask.

// To properly find the video, let's just find the video block and replace the whole tag
let replaceCount = 0;
html = html.replace(/<video [^>]*lv_0_20260528021828\.mp4[^>]*>/g, (match) => {
    replaceCount++;
    // Remove the old injected style if it's there
    let cleaned = match.replace(/ style="[^"]*"/g, '');
    
    // Create new style for perfect rectangular feathering
    // We use a combined linear gradient mask.
    const newStyle = ` style="transform: scale(0.9); transform-origin: center; -webkit-mask-image: linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%), linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%); -webkit-mask-composite: source-in; mask-image: linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%), linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%); mask-composite: intersect; transition: transform 0.3s;"`;
    
    return cleaned.replace('<video ', `<video ${newStyle} `);
});

console.log(`Fixed fade on ${replaceCount} video tags.`);

fs.writeFileSync(htmlPath, html);
