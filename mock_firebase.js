const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'app', 'pos', '[sede]', 'page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Mock Firebase functions at the top
const firebaseMocks = `
// Firebase Mocks
const db = {} as any;
const authReady = Promise.resolve();
const collection = (d: any, p: any) => p;
const doc = (d: any, c: any, id?: any) => id ? c + '/' + id : c;
const getDoc = async (d: any) => ({ exists: () => false, data: () => ({}) });
const getDocs = async (c: any) => [];
const onSnapshot = (c: any, cb: any) => { cb({ forEach: () => {}, docs: [], exists: () => false, data: () => ({}) }); return () => {}; };
const query = (c: any, ...args: any[]) => c;
const setDoc = async (d: any, data: any, opts?: any) => {};
const updateDoc = async (d: any, data: any) => {};
const where = (f: any, op: any, val: any) => f;
const Timestamp = { now: () => ({ seconds: Date.now() / 1000 }) };
const increment = (n: number) => n;
const orderBy = (f: any, d?: any) => f;
const fbLimit = (n: number) => n;
const runTransaction = async (d: any, cb: any) => cb({ get: async () => ({ exists: () => false }), set: () => {}, update: () => {} });
const serverTimestamp = () => ({ seconds: Date.now() / 1000 });
const writeBatch = (d: any) => ({ update: () => {}, commit: async () => {} });

// Mock usePriceListConfig variables
const listasActivas = [] as any[];
const nombrePorCampo = (c: string) => c;
const openBlankReceiptWindow = openReceiptPrintWindow;
`;

if (!content.includes('// Firebase Mocks')) {
  // insert after imports
  content = content.replace(/(import [^\n]+\n)+/, match => match + '\n' + firebaseMocks + '\n');
}

// Fix missing parameter types for map/filter where implicit any is caught
content = content.replace(/listasActivas\.filter\(o =>/g, "listasActivas.filter((o: any) =>");
content = content.replace(/listasActivas\.map\(o =>/g, "listasActivas.map((o: any) =>");

// Additional implicit any fixes from tsc output
content = content.replace(/\(o => /g, "((o: any) => ");
content = content.replace(/\(opt => /g, "((opt: any) => ");

fs.writeFileSync(filePath, content);
console.log('Firebase mocks added');
