import fs from 'fs';
import path from 'path';

const htmlPath = path.join(__dirname, 'public', 'shopify', 'plantilla23', 'body-clean.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// The exact style string to replace
const badStyle = 'style="width: 300px !important; max-width: 300px !important; height: 150px !important; max-height: 150px !important; object-fit: contain !important; filter: brightness(0) invert(1) !important;"';
const goodStyle = 'style="filter: brightness(0) invert(1) !important;" class="logo py-1 custom-responsive-logo"';

// Replace it
html = html.replace(badStyle, goodStyle);
// Also in case there are other logos, we replace class="logo py-1" with class="logo py-1 custom-responsive-logo" where the bad style was.
// Actually just replace badStyle with goodStyle since class="logo py-1" was before the style attribute.
// Wait, in the HTML it was: class="logo py-1" style="..."
html = html.replace(/class="logo py-1" style="width: 300px !important; max-width: 300px !important; height: 150px !important; max-height: 150px !important; object-fit: contain !important; filter: brightness(0) invert(1) !important;"/g, 'class="logo py-1 custom-responsive-logo" style="filter: brightness(0) invert(1) !important;"');

// Now inject the responsive CSS right after the body tag or anywhere safe, let's inject it into the head or just before the header.
const responsiveCss = `
<style>
  .custom-responsive-logo {
      width: 120px !important;
      max-width: 120px !important;
      height: 60px !important;
      max-height: 60px !important;
      object-fit: contain !important;
  }
  @media (min-width: 768px) {
      .custom-responsive-logo {
          width: 300px !important;
          max-width: 300px !important;
          height: 150px !important;
          max-height: 150px !important;
      }
  }
</style>
`;

if (!html.includes('custom-responsive-logo {')) {
    html = html.replace('</head>', responsiveCss + '\n</head>');
}

fs.writeFileSync(htmlPath, html);
console.log("Responsive logo script executed successfully.");
