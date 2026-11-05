'use client';

import { useState, useEffect, useRef } from 'react';

interface AnimHeartProps {
  filled?: boolean;
  size?: number;
  className?: string;
}

const PC = 8;

export default function AnimHeart({ filled = false, size = 22, className = '' }: AnimHeartProps) {
  const [animating, setAnimating] = useState(false);
  const prevFilled = useRef(filled);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (filled && !prevFilled.current) {
      setAnimating(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setAnimating(false), 700);
    }
    prevFilled.current = filled;
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [filled]);

  const s = size;
  const sw = Math.max(1.5, s * 0.08);
  const pd = s * 0.85;

  const kf = Array.from({ length: PC }, (_, i) => {
    const a = (i * 360) / PC;
    const r = (a * Math.PI) / 180;
    return `@keyframes ap${i}{0%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(${Math.cos(r)*pd}px,${Math.sin(r)*pd}px) scale(.3);opacity:0}}`;
  }).join('');

  return (
    <div className={className} style={{ position:'relative', width:s, height:s, display:'flex', alignItems:'center', justifyContent:'center' }}>
      {animating && <div style={{ position:'absolute', width:s*.7, height:s*.7, borderRadius:'50%', border:'2px solid var(--pk-primary, #e396bf)', animation:'ahR .6s ease-out forwards', pointerEvents:'none', zIndex:1 }}/>}
      {animating && Array.from({length:PC},(_,i)=>{
        const ps=Math.max(2.5,s*.12);
        return <div key={i} style={{ position:'absolute', width:ps, height:ps, borderRadius:'50%', background:i%3===0?'var(--pk-primary, #f472b6)':i%3===1?'var(--pk-primary, #e396bf)':'var(--pk-light-border, #f5a8cf)', left:'50%', top:'50%', marginLeft:-ps/2, marginTop:-ps/2, animation:`ap${i} .5s ${i*25}ms ease-out forwards`, pointerEvents:'none', zIndex:1 }}/>;
      })}
      <svg viewBox="0 0 24 24" width={s} height={s} style={{ animation:animating?'ahB .55s cubic-bezier(.34,1.56,.64,1) forwards':'none', filter:filled?'drop-shadow(0 1px 3px var(--pk-shadow, rgba(227,150,191,.35)))':'none', transition:'filter .3s', position:'relative', zIndex:2 }}>
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" fill={filled?'var(--pk-primary, #e396bf)':'none'} stroke={filled?'var(--pk-primary, #e396bf)':'#1a1a1a'} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={{ transition:filled&&!animating?'fill .25s,stroke .25s':'none', transformOrigin:'12px 12px', animation:animating?'ahF .35s ease forwards':'none' }}/>
        {filled && <path d="M12 5.67L10.94 4.61a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78L18.22 4.61a5.5 5.5 0 0 0-5.5-1.36" fill="url(#ahS)" opacity=".3" style={{ animation:animating?'ahSh .5s .1s ease forwards':'none' }}/>}
        <defs><linearGradient id="ahS" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#fff"/><stop offset="40%" stopColor="transparent"/></linearGradient></defs>
      </svg>
      <style>{`
        @keyframes ahB{0%{transform:scale(1)}20%{transform:scale(1.4)}45%{transform:scale(.85)}70%{transform:scale(1.12)}100%{transform:scale(1)}}
        @keyframes ahF{0%{transform:scale(.5);opacity:.3}50%{transform:scale(1.2);opacity:1}100%{transform:scale(1);opacity:1}}
        @keyframes ahR{0%{transform:scale(.6);opacity:.7}100%{transform:scale(2.5);opacity:0}}
        @keyframes ahSh{0%{opacity:0}40%{opacity:.5}100%{opacity:.3}}
        ${kf}
      `}</style>
    </div>
  );
}
