import fs from 'fs';
import path from 'path';

const htmlPath = path.join(__dirname, 'public', 'shopify', 'plantilla23', 'body-clean.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// The current CSS for the fade is:
// -webkit-mask-image: radial-gradient(ellipse at center, black 40%, transparent 80%);
// mask-image: radial-gradient(ellipse at center, black 40%, transparent 80%);

// We will replace it with linear gradients for a perfect rectangular feather.
const oldCssRegex = /-webkit-mask-image: radial-gradient\([^)]+\);\s*mask-image: radial-gradient\([^)]+\);/g;

const newCss = `-webkit-mask-image: linear-gradient(to right, transparent 0%, black 25%, black 75%, transparent 100%), linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%);
    -webkit-mask-composite: source-in;
    mask-image: linear-gradient(to right, transparent 0%, black 25%, black 75%, transparent 100%), linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%);
    mask-composite: intersect;`;

html = html.replace(oldCssRegex, newCss);

fs.writeFileSync(htmlPath, html);
console.log("Updated mask to use linear gradients for perfect edge fading.");
