const fs = require('fs');

const content = fs.readFileSync('public/shopify/plantilla13/body-clean.html', 'utf8');

// Find all video tags and get their outer context
let idx = 0;
while (true) {
  idx = content.indexOf('<video', idx);
  if (idx === -1) break;
  
  // Find parent div or section containing this video
  const start = Math.max(0, idx - 300);
  const end = Math.min(content.length, idx + 400);
  
  console.log(`\n=== VIDEO TAG CONTEXT ===`);
  console.log(content.substring(start, end));
  
  idx += 6; // move past this video tag
}
