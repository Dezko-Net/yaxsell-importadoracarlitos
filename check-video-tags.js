const fs = require('fs');

const content = fs.readFileSync('public/shopify/plantilla13/body-clean.html', 'utf8');

// Match <video ...> ... </video>
const regex = /<video[\s\S]*?<\/video>/gi;
const matches = content.match(regex);

if (!matches) {
  console.log('No video tags found in body-clean.html!');
} else {
  console.log(`Found ${matches.length} video tags:`);
  matches.forEach((m, i) => {
    console.log(`\n--- VIDEO ${i + 1} ---`);
    console.log(m);
  });
}
