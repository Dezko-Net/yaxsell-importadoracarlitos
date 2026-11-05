import { Suspense } from 'react';
import ThemeEditorClient from './ThemeEditorClient';

export const dynamic = 'force-dynamic';

export default function ThemeEditorPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'system-ui' }}>Cargando editor...</div>}>
      <ThemeEditorClient />
    </Suspense>
  );
}
