import fs from 'fs';
import path from 'path';

const htmlPath = path.join(__dirname, 'public', 'shopify', 'plantilla23', 'body-clean.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// Fix the double class attribute
html = html.replace(/<block-video class="video-faded-corners "\s*class="/g, '<block-video class="video-faded-corners ');

// Make the fade deeper
html = html.replace(/black 65%, transparent 100%/g, 'black 40%, transparent 80%');

// Also remove transform: scale(0.9) from .video-faded-corners because it's the wrapper block and scaling it might mess up its alignment inside the flex container.
// It's better to only mask it, or if it must be scaled, scale the inner video.
// Actually, mask-image alone on the container is perfect to just fade the edges.
html = html.replace(/transform: scale\(0\.9\);\s*/g, '');

fs.writeFileSync(htmlPath, html);
console.log("Fixed double class attribute and deepened the fade.");
