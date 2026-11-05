'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function PosCajeroPageRedirect() {
  const router = useRouter();
  const params = useParams();
  const sede = params?.sede || 'alameda';

  useEffect(() => {
    router.replace(`/pos/${sede}`);
  }, [router, sede]);

  return (
    <div className="p-8 text-center text-gray-500 font-sans text-sm">
      Abriendo Caja Registradora en tema blanco...
    </div>
  );
}
