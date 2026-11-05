const fs = require('fs');
const path = require('path');

function extractSplitHero(filePath, outName) {
  const content = fs.readFileSync(filePath, 'utf8');
  const index = content.indexOf('<split-hero');
  if (index === -1) {
    console.log(`No <split-hero> found in ${filePath}`);
    return;
  }
  
  // Find closing </split-hero>
  const closeTag = '</split-hero>';
  const closeIndex = content.indexOf(closeTag, index);
  if (closeIndex === -1) {
    console.log(`No closing </split-hero> found in ${filePath}`);
    return;
  }
  
  fs.writeFileSync(outName, content.substring(index, closeIndex + closeTag.length), 'utf8');
  console.log(`Extracted <split-hero> to ${outName}`);
}

extractSplitHero('public/shopify/plantilla13/body-clean.html', 'sh-body-clean.html');
extractSplitHero('public/shopify/plantilla13/index.html', 'sh-index.html');
