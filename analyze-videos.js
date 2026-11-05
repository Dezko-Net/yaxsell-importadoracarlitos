const fs = require('fs');

function analyze(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  console.log(`\n=== ANALYZING ${filePath} ===`);
  
  // Find split-hero-column__media-media
  const key = 'split-hero-column__media-media';
  let idx = content.indexOf(key);
  if (idx === -1) {
    console.log(`Could not find ${key}`);
    return;
  }
  
  // Print 2000 characters around this key
  const start = Math.max(0, idx - 100);
  const end = Math.min(content.length, idx + 2000);
  console.log(content.substring(start, end));
}

analyze('sh-body-clean.html');
analyze('sh-index.html');
