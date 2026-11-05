import fs from 'fs';
import path from 'path';

const htmlPath = path.join(__dirname, 'public', 'shopify', 'plantilla23', 'body-clean.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// Find the video element containing the target URL and inject styles
const targetUrl = "https://storage.googleapis.com/geminai-449212.firebasestorage.app/KEVINCOCO/lv_0_20260528021828.mp4";

const regex = new RegExp(`(<video [^>]*class="[^"]*object-cover w-full h-full[^"]*"[^>]*>[^<]*<source src="${targetUrl.replace(/\//g, '\\/').replace(/\./g, '\\.')}[^"]*"[^>]*>)`, 'g');

let replaceCount = 0;
html = html.replace(regex, (match) => {
    replaceCount++;
    // We add a style tag to the video
    // scale down to 80% using transform, or just width/height + margin. Let's use transform scale.
    // Feathered edges using webkit-mask-image
    const addedStyle = ` style="transform: scale(0.85); -webkit-mask-image: radial-gradient(ellipse at center, black 60%, transparent 100%); mask-image: radial-gradient(ellipse at center, black 60%, transparent 100%); transition: transform 0.3s;"`;
    
    // Inject the style into the <video ...> tag
    return match.replace('<video ', `<video ${addedStyle} `);
});

console.log(`Updated ${replaceCount} video tags with blend mask and scale.`);
fs.writeFileSync(htmlPath, html);
