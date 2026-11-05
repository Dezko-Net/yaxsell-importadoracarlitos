const fs = require('fs');
const content = fs.readFileSync('public/shopify/plantilla23/body-clean.html', 'utf8');

const regex = /<h[23][^>]*>(.*?)<\/h[23]>/g;
let match;
const headings = [];
while ((match = regex.exec(content)) !== null) {
    headings.push(match[1].replace(/<[^>]+>/g, '').trim());
}

fs.writeFileSync('headings.txt', headings.join('\n'));
console.log('Done');
