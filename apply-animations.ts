import fs from 'fs';
import path from 'path';

const htmlPath = path.join(__dirname, 'public', 'shopify', 'plantilla23', 'body-clean.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// 1. Inject custom animation CSS
const animationCss = `
<style>
  @keyframes smoothFadeInUp {
    0% { opacity: 0; transform: translateY(15px) scale(0.98); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }
  .smooth-reveal {
    animation: smoothFadeInUp 1.2s cubic-bezier(0.25, 0.8, 0.25, 1) forwards;
    opacity: 0;
  }
</style>
`;
if (!html.includes('smoothFadeInUp')) {
    html = html.replace('</head>', animationCss + '\n</head>');
}

// 2. Apply smooth-reveal to the logo image
// We replaced the inline style before with goodStyle: 'style="filter: brightness(0) invert(1) !important;" class="logo py-1 custom-responsive-logo"'
html = html.replace(/class="logo py-1 custom-responsive-logo"/g, 'class="logo py-1 custom-responsive-logo smooth-reveal"');
// Also check if there's any logo img without that exact class
html = html.replace(/class="block w-max logo"/g, 'class="block w-max logo smooth-reveal"');

// 3. Apply smooth-reveal to video elements
// We'll target <video ... class="..."> and append smooth-reveal to the class
html = html.replace(/(<video[^>]*class=")([^"]*)(")/g, (match, p1, p2, p3) => {
    if (p2.includes('smooth-reveal')) return match;
    return `${p1}${p2} smooth-reveal${p3}`;
});

// 4. Apply skeleton (background-color: #FBCAC9;) to other background containers
const skeletonStyle = 'background-color: #FBCAC9;';

// Herobanner 2 and any other slideshow__background
html = html.replace(/(<div class="slideshow__background [^"]*")(\s*>)/g, (match, p1, p2) => {
    return `${p1} style="${skeletonStyle}"${p2}`;
});
// The one we manually added style to earlier
html = html.replace(/(<div class="slideshow__background [^"]*" style=")([^"]*)(")/g, (match, p1, p2, p3) => {
    if (p2.includes('background-color')) return match;
    return `${p1}${skeletonStyle} ${p2}${p3}`;
});

// Split hero background
html = html.replace(/(<div class="split-hero-column-inner[^"]*")(\s*>)/g, (match, p1, p2) => {
    return `${p1} style="${skeletonStyle}"${p2}`;
});
html = html.replace(/(<div class="split-hero-column-inner[^"]*" style=")([^"]*)(")/g, (match, p1, p2, p3) => {
    if (p2.includes('background-color')) return match;
    return `${p1}${skeletonStyle} ${p2}${p3}`;
});

// Multimedia collage background
html = html.replace(/(<div class="multimedia-collage__background[^"]*")(\s*>)/g, (match, p1, p2) => {
    return `${p1} style="${skeletonStyle}"${p2}`;
});

fs.writeFileSync(htmlPath, html);
console.log("Applied smooth reveal animations and skeletons.");
