'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);
}

/* ─── Stagger Reveal: fade+slide children on scroll ─── */
export function useStaggerReveal(
  containerSelector: string,
  childSelector: string,
  opts?: { y?: number; duration?: number; stagger?: number; start?: string; ease?: string }
) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const o = { y: 40, duration: 0.6, stagger: 0.08, start: 'top 88%', ease: 'power3.out', ...opts };
    const ctx = gsap.context(() => {
      gsap.from(childSelector, {
        scrollTrigger: { trigger: containerSelector, start: o.start, toggleActions: 'play none none none' },
        y: o.y, opacity: 0, duration: o.duration, stagger: o.stagger, ease: o.ease, clearProps: 'transform,opacity',
      });
    });
    return () => ctx.revert();
  }, [containerSelector, childSelector]);
}

/* ─── Section Reveal: single element fade+slide on scroll ─── */
export function useSectionReveal(
  selector: string,
  opts?: { y?: number; duration?: number; start?: string; delay?: number; ease?: string }
) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const o = { y: 50, duration: 0.7, start: 'top 90%', delay: 0, ease: 'power3.out', ...opts };
    const ctx = gsap.context(() => {
      gsap.from(selector, {
        scrollTrigger: { trigger: selector, start: o.start, toggleActions: 'play none none none' },
        y: o.y, opacity: 0, duration: o.duration, delay: o.delay, ease: o.ease, clearProps: 'transform,opacity',
      });
    });
    return () => ctx.revert();
  }, [selector]);
}

/* ─── Counter Animation: animate a number from 0 to target ─── */
export function useCounterAnimation(
  ref: React.RefObject<HTMLElement | null>,
  target: number,
  opts?: { duration?: number; prefix?: string; suffix?: string; decimals?: number; formatter?: (n: number) => string }
) {
  const animated = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !ref.current || animated.current) return;
    const el = ref.current;
    const o = { duration: 1.2, prefix: '', suffix: '', decimals: 0, ...opts };
    const obj = { val: 0 };
    
    ScrollTrigger.create({
      trigger: el,
      start: 'top 90%',
      onEnter: () => {
        if (animated.current) return;
        animated.current = true;
        gsap.to(obj, {
          val: target,
          duration: o.duration,
          ease: 'power2.out',
          onUpdate: () => {
            if (o.formatter) {
              el.textContent = o.formatter(obj.val);
            } else {
              el.textContent = `${o.prefix}${obj.val.toFixed(o.decimals)}${o.suffix}`;
            }
          },
        });
      },
    });
  }, [target]);
}

/* ─── Parallax Scrub: move element on scroll ─── */
export function useParallaxScrub(
  selector: string,
  opts?: { yPercent?: number; start?: string; end?: string }
) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const o = { yPercent: 15, start: 'top bottom', end: 'bottom top', ...opts };
    const ctx = gsap.context(() => {
      gsap.fromTo(selector,
        { yPercent: -o.yPercent / 2 },
        {
          yPercent: o.yPercent / 2,
          ease: 'none',
          scrollTrigger: { trigger: selector, start: o.start, end: o.end, scrub: 1.5 },
        }
      );
    });
    return () => ctx.revert();
  }, [selector]);
}

/* ─── Clip-path Wipe Reveal ─── */
export function useWipeReveal(
  selector: string,
  opts?: { direction?: 'up' | 'left' | 'right'; duration?: number; stagger?: number; start?: string }
) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const o = { direction: 'up' as const, duration: 0.8, stagger: 0.1, start: 'top 85%', ...opts };
    const clipFrom = { up: 'inset(100% 0 0 0)', left: 'inset(0 100% 0 0)', right: 'inset(0 0 0 100%)' }[o.direction];
    const ctx = gsap.context(() => {
      gsap.from(selector, {
        scrollTrigger: { trigger: selector, start: o.start, toggleActions: 'play none none none' },
        clipPath: clipFrom, opacity: 0, duration: o.duration, stagger: o.stagger, ease: 'power4.out',
        clearProps: 'clipPath,opacity',
      });
    });
    return () => ctx.revert();
  }, [selector]);
}

/* ─── Scale Pop: elastic scale entrance ─── */
export function useScalePop(
  selector: string,
  opts?: { stagger?: number; start?: string; duration?: number; delay?: number }
) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const o = { stagger: 0.06, start: 'top 88%', duration: 0.6, delay: 0, ...opts };
    const ctx = gsap.context(() => {
      gsap.from(selector, {
        scrollTrigger: { trigger: selector, start: o.start, toggleActions: 'play none none none' },
        scale: 0, opacity: 0, duration: o.duration, stagger: o.stagger, delay: o.delay,
        ease: 'elastic.out(1, 0.5)', clearProps: 'transform,opacity',
      });
    });
    return () => ctx.revert();
  }, [selector]);
}

/* ─── Magnetic Hover: element follows cursor slightly ─── */
export function useMagneticHover(ref: React.RefObject<HTMLElement | null>, strength = 0.3) {
  useEffect(() => {
    if (typeof window === 'undefined' || !ref.current) return;
    const el = ref.current;
    const move = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = (e.clientX - cx) * strength;
      const dy = (e.clientY - cy) * strength;
      gsap.to(el, { x: dx, y: dy, duration: 0.3, ease: 'power2.out' });
    };
    const leave = () => { gsap.to(el, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1, 0.4)' }); };
    el.addEventListener('mousemove', move);
    el.addEventListener('mouseleave', leave);
    return () => { el.removeEventListener('mousemove', move); el.removeEventListener('mouseleave', leave); };
  }, [strength]);
}

export { gsap, ScrollTrigger };
