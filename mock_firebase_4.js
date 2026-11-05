const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'app', 'pos', '[sede]', 'page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Fix openReceiptPrintWindow calls
content = content.replace(/openReceiptPrintWindow\(empresaConfig, /g, "openReceiptPrintWindow(");
// In case there is an extra argument somewhere:
content = content.replace(/openReceiptPrintWindow\(([^,]+), ([^,]+), ([^\)]+)\)/g, "openReceiptPrintWindow($2 as any)");

fs.writeFileSync(filePath, content);
console.log('Firebase mocks phase 4 added');
