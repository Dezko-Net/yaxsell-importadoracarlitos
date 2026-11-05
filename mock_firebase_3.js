const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'app', 'pos', '[sede]', 'page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(/snap =>/g, "(snap: any) =>");

// Fix query error:
content = content.replace(/const query = \(\.\.\.args: any\[\]\) => args\[0\];/g, "const query = (...args: any[]) => args[0];");
// Actually, earlier I wrote `const query = (c: any, ...args: any[]) => c;`
// Let's just redefine query at the top just in case
content = content.replace(/const query = [^\n]+;/g, "const query = (...args: any[]) => args[0];");

// Fix setDoc / updateDoc / getDoc
content = content.replace(/const setDoc = [^\n]+;/g, "const setDoc = async (...args: any[]) => {};");
content = content.replace(/const updateDoc = [^\n]+;/g, "const updateDoc = async (...args: any[]) => {};");
content = content.replace(/const getDoc = [^\n]+;/g, "const getDoc = async (...args: any[]) => ({ exists: () => false, data: () => ({}) });");

// Fix window assignable error for receipt print
content = content.replace(/openReceiptPrintWindow\(null as any, null as any\)/g, "openReceiptPrintWindow(null as any) as any");

fs.writeFileSync(filePath, content);
console.log('Firebase mocks phase 3 added');
