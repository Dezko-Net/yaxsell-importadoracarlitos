const fs = require('fs');
const path = 'src/app/admin/(panel)/ia/whatsapp/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// Step 1: Replace known mojibake sequences
const replacements = [
  { find: 'â€”', rep: '—' },
  { find: 'Â·', rep: '·' },
  { find: 'âš ', rep: '⚠' },
  { find: 'ï¸', rep: '' },
  { find: '\u00CF\u008F', rep: '\uFE0F' },
];

for (const { find, rep } of replacements) {
  if (content.includes(find)) {
    content = content.split(find).join(rep);
    console.log('Replaced:', find, '->', rep);
  }
}

// Step 2: Double-encoded emojis (UTF-8 bytes read as Latin-1 then re-encoded)
// ðŸ‘¤ -> 👤, ðŸš« -> 🚫, ðŸ”´ -> 🔴, ðŸŸ¢ -> 🟢, ðŸ¤– -> 🤖
const emojiMap = [
  ['ðŸ‘¤', '👤'],
  ['ðŸš«', '🚫'],
  ['ðŸ”´', '🔴'],
  ['ðŸŸ¢', '🟢'],
  ['ðŸ¤–', '🤖'],
  ['âš¡', '⚡'],
];

for (const [bad, good] of emojiMap) {
  if (content.includes(bad)) {
    content = content.split(bad).join(good);
    console.log('Replaced emoji:', bad, '->', good);
  }
}

fs.writeFileSync(path, content, 'utf8');
console.log('Done');
