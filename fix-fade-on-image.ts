import fs from 'fs';
import path from 'path';

const htmlPath = path.join(__dirname, 'public', 'shopify', 'plantilla23', 'body-clean.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// 1. Remove the mask and scale from lv_0 video (which is the background)
// The style I added was:
const styleToRemove = ` style="transform: scale(0.9); transform-origin: center center; -webkit-mask-image: linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%), linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%); -webkit-mask-composite: source-in; mask-image: linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%), linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%); mask-composite: intersect; transition: transform 0.3s;"`;

html = html.replace(styleToRemove, '');

// Also remove the first attempt style if it exists
const styleToRemove1 = ` style="transform: scale(0.85); -webkit-mask-image: radial-gradient(ellipse at center, black 50%, transparent 100%); mask-image: radial-gradient(ellipse at center, black 50%, transparent 100%); transition: transform 0.3s;"`;
html = html.replace(styleToRemove1, '');


// 2. Add the mask and scale to the Picsart image (the floating element)
// The user wants "no se vean las puntas" and "un fade". A combination of border-radius and box-shadow inset could work, 
// OR a CSS mask that fades out the edges.
// Let's use a nice CSS mask that fades the edges, removing the corners completely (creating a soft oval or rounded rectangle).
// `radial-gradient(ellipse, black 60%, transparent 100%)` creates a nice soft oval.
// Let's add it to both the desktop and mobile Picsart images.

const newStyle = ` style="transform: scale(0.95); -webkit-mask-image: radial-gradient(ellipse at center, black 65%, transparent 100%); mask-image: radial-gradient(ellipse at center, black 65%, transparent 100%);"`;

// Find the img tags for Picsart and inject the style
html = html.replace(/(<img[^>]*Picsart[^>]*)(>)/g, (match, p1, p2) => {
    // avoid double injecting
    if (p1.includes('mask-image')) return match;
    return `${p1}${newStyle}${p2}`;
});

fs.writeFileSync(htmlPath, html);
console.log("Successfully applied fade to Picsart image and removed from video.");
