const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'app', 'pos', '[sede]', 'page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Add "use client"
content = `"use client";\n` + content;

// 1. React Router -> Next.js
content = content.replace(/import { useParams, useNavigate } from 'react-router-dom'/g, "import { useParams, useRouter } from 'next/navigation'");
content = content.replace(/const navigate = useNavigate\(\)/g, "const router = useRouter()");
content = content.replace(/navigate\(/g, "router.push(");

// 2. Firebase -> Appwrite
content = content.replace(/import { db, authReady } from '\.\.\/lib\/firebase'/g, "import { fetchAllAppwriteErpProducts, updateAppwriteErpProduct, AppwriteErpProduct } from '@/lib/appwriteErpService'");
// Replace Firebase firestore imports
content = content.replace(/import {[^}]+} from 'firebase\/firestore'/g, "");

// 3. Remove usePriceListConfig
content = content.replace(/import { usePriceListConfig } from '\.\.\/hooks\/usePriceListConfig'/g, "");
content = content.replace(/const { listasActivas, nombrePorCampo } = usePriceListConfig\(\)/g, "");

// 4. Receipts
content = content.replace(/import { openReceiptPrintWindow, openBlankReceiptWindow } from '\.\.\/lib\/posReceipt'/g, "import { openReceiptPrintWindow } from '@/lib/posReceipt'");

// 5. Sedes type
content = content.replace(/import { SEDES, SedeSlug } from '\.\.\/types'/g, "import { SEDES, SedeSlug } from '@/types'");

// 6. Lottie & loading
content = content.replace(/import Lottie from 'lottie-react'/g, "import { RefreshCw } from 'lucide-react'");
content = content.replace(/import loadingPC from '\.\.\/lotties\/loadingpc\.json'/g, "");
content = content.replace(/import loadingMobile from '\.\.\/lotties\/loadingmobil\.json'/g, "");
content = content.replace(/const loadingAnimation = window\.innerWidth < 768 \? loadingMobile : loadingPC/g, "");

// Replace Lottie usages with RefreshCw
content = content.replace(/<Lottie animationData=\{loadingAnimation\} [^>]+>/g, "<RefreshCw className='animate-spin' />");

// 7. Remove BarcodeScannerModal and OCRScannerModal
content = content.replace(/import BarcodeScannerModal from '\.\.\/components\/BarcodeScannerModal'/g, "");
content = content.replace(/import OCRScannerModal from '\.\.\/components\/OCRScannerModal'/g, "");
content = content.replace(/<BarcodeScannerModal[^>]+>/g, "");
content = content.replace(/<OCRScannerModal[^>]+>/g, "");

// 8. Fix POS Session (simplify with 'Fernanda')
content = content.replace(/function getPosSession\(sede: string\): PosUserSession \| null \{[\s\S]*?\} catch \{ return null \}\n\}/g, `function getPosSession(sede: string): PosUserSession | null {
  try {
    const raw = localStorage.getItem('yaxsel_pos_session')
    if (!raw) return { id: 'default', nombre: 'Fernanda', cargo: 'Cajera', sede: sede, role: 'cajera', loginAt: Date.now() }
    const session = JSON.parse(raw) as PosUserSession
    return session
  } catch { return { id: 'default', nombre: 'Fernanda', cargo: 'Cajera', sede: sede, role: 'cajera', loginAt: Date.now() } }
}`);

// 9. Replace window.innerWidth at top-level
content = content.replace(/const isMobile = typeof window !== 'undefined' && window\.innerWidth < 1024/g, "const [isMobile, setIsMobile] = useState(false); useEffect(() => { setIsMobile(window.innerWidth < 1024) }, [])");

fs.writeFileSync(filePath, content);
console.log('Migration script executed');
