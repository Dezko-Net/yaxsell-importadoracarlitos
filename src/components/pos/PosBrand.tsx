import Link from 'next/link';

export default function PosBrand({ href, compact = false }: { href?: string; compact?: boolean }) {
  const logo = <img src="/pos/logopos.png" alt="Asistora POS" width={180} height={60} className={compact ? 'h-9 w-28 object-contain' : 'h-14 w-44 object-contain'} />;
  return href ? <Link href={href} aria-label="Asistora POS · Inicio" className="inline-flex shrink-0 rounded-lg">{logo}</Link> : logo;
}
