export function isEditorMockEnabled(): boolean {
  // 1) Env flag (útil para que sea global en tu máquina)
  try {
    if (process.env.NEXT_PUBLIC_EDITOR_MOCK === '1') return true;
  } catch {}

  // 2) Query param (útil para activar/desactivar rápido, incluso en incógnito)
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const v =
      params.get('editor') ||
      params.get('mock') ||
      params.get('offline') ||
      params.get('ficticio');
    if (v === '1' || v === 'true' || v === 'on') return true;
  }

  return false;
}

