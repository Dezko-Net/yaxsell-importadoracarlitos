'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getCountFromServer,
  getDocs,
} from 'firebase/firestore';
import { Query } from '@/lib/db';
import { getServices, getFirebaseConfig, PRODUCTS_COLLECTION_ID, ORDERS_COLLECTION_ID, SUPPORT_TICKETS_COLLECTION_ID } from '@/lib/db';
import { dedupeUserDocuments, isRegisteredUserProfile, listAllUserProfiles, type UserProfileDoc } from '@/lib/users-db';
import { Order, Product, DashboardStats } from '@/types/admin';
import { Package, ShoppingCart, Clock, DollarSign, TrendingUp, TrendingDown, AlertTriangle, RefreshCw, ArrowRight, Plus, ChevronRight, Users, Megaphone, BarChart3, Zap, Globe, Search, MapPin, ShoppingBag, Eye, Coins, Activity, Calendar } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { getPageViewStats } from '@/hooks/usePageViewTracker';
import { useLiveDataVisibility } from '@/hooks/useLiveDataVisibility';
import SANTIAGO_COMUNAS from './santiago_comunas.json';

/* ─── SVG Line / Area Chart ─── */
function AreaChart({ data, color = '#6366f1', height = 120 }: { data: number[]; color?: string; height?: number }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const min = 0;
  const w = 560; const h = height;
  const pad = 4;
  const points = data.map((v, i) => ({
    x: pad + (i / (data.length - 1)) * (w - pad * 2),
    y: h - pad - ((v - min) / (max - min)) * (h - pad * 2),
  }));
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${points[points.length - 1].x.toFixed(1)},${h} L${points[0].x.toFixed(1)},${h} Z`;
  const gradId = `grad-${color.replace('#', '')}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => data[i] > 0 && (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} />
      ))}
    </svg>
  );
}

/* ─── Donut chart ─── */
function DonutChart({ segments, size = 100 }: { segments: { value: number; color: string; label: string }[]; size?: number }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) return <div style={{ width: size, height: size, borderRadius: '50%', background: '#fdf2f8' }} />;
  const r = 34; const cx = 50; const cy = 50;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1f2937" strokeWidth="12" />
      {segments.map((seg, i) => {
        const pct = seg.value / total;
        const dash = pct * circumference;
        const gap = circumference - dash;
        const el = (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={seg.color} strokeWidth="12"
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-offset * circumference}
            strokeLinecap="butt"
            style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dasharray .6s' }}
          />
        );
        offset += pct;
        return el;
      })}
      <text x="50" y="47" textAnchor="middle" style={{ fontSize: 14, fontWeight: 700, fill: '#f9fafb' }}>{total}</text>
      <text x="50" y="61" textAnchor="middle" style={{ fontSize: 8, fill: '#9ca3af' }}>pedidos</text>
    </svg>
  );
}

/* ─── Mini sparkline ─── */
function Sparkline({ data, color = '#6366f1', up }: { data: number[]; color?: string; up?: boolean }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1); const h = 30; const w = 70;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
    </svg>
  );
}

/* ─── KPI Card ─── */
function KpiCard({ label, value, sub, trend, sparkData, color, icon, iconBg }: {
  label: string; value: string | number; sub?: string; trend?: number;
  sparkData?: number[]; color: string; icon: React.ReactNode; iconBg: string;
}) {
  const trendUp = (trend ?? 0) >= 0;
  return (
    <div style={{
      background: '#ecfeff', borderRadius: 16, padding: '18px 20px',
      border: '1px solid #1f2937', position: 'relative', overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
    }}>
      <div style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 80, borderRadius: '0 16px 0 80px', background: iconBg, opacity: 0.12 }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {icon}
        </div>
        {sparkData && sparkData.length > 1 && <Sparkline data={sparkData} color={color} />}
      </div>
      <p style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500, margin: '0 0 3px' }}>{label}</p>
      <p style={{ fontSize: 24, fontWeight: 800, color: '#f9fafb', margin: 0, lineHeight: 1.1 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: '#9ca3af', margin: '4px 0 0' }}>{sub}</p>}
      {trend !== undefined && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 6 }}>
          {trendUp ? <TrendingUp size={13} color="#059669" /> : <TrendingDown size={13} color="#dc2626" />}
          <span style={{ fontSize: 12, fontWeight: 600, color: trendUp ? '#059669' : '#dc2626' }}>
            {trendUp ? '+' : ''}{Math.abs(trend).toFixed(1)}%
          </span>
          <span style={{ fontSize: 11, color: '#d1d5db' }}>vs período ant.</span>
        </div>
      )}
    </div>
  );
}

/* ─── Chile SVG Regions ─── */
const CHILE_REGIONS:{key:string;paths:string[];lx:number;ly:number;roman:string}[] = [
  {key:'Arica y Parinacota',roman:'XV',paths:['M141,24.1L140.2,24.4L139.6,24.5L139.8,24.7L139.1,25.3L138.2,25.5L137.4,26L136.6,26.1L135.6,26.1L134.2,26.3L133.8,26.5L132.9,26L132.1,25.6L130.9,25.2L129.4,25.2L128,25.2L127.7,25.2L126.7,25.3L124.2,25.4L122.3,25.4L120.4,25.7L118.9,26.2L118.2,26.4L117.1,26.9L114.3,27.6L114.6,26.7L114.1,25.9L113.7,25.1L113.6,24.2L113.4,23.4L113,22.7L113.2,21.9L113.3,21.1L113.2,20.2L113.7,18.8L113.8,18.2L113.5,17.6L112.9,16.5L114.5,16.3L119,15.8L121.9,15L124.9,12.3L124,10.7L123.6,9.2L126.7,8.2L130.6,6.2L133.3,9.1L133.7,9.8L134,10.7L134.1,11.8L135,12.2L136.6,12.3L138.1,12.7L138.9,13.2L138,13.7L137.2,14.2L137.5,14.7L138.7,15.3L138.8,16.3L139,17L139,17.7L139.9,18.4L139.4,19.9L140.3,20.9L140.4,21.6L141.5,23.8Z'],lx:128.4,ly:20},
  {key:'Tarapacá',roman:'I',paths:['M117.2,39.9L117.3,37.1L117,34.1L115.5,32.4L115.5,30L114.3,27.8L118.9,26.2L124.1,25.5L127.7,25.2L130.9,25.2L133.7,26.2L135.9,26.3L138.2,25.5L139.6,24.5L141.6,24.6L147.4,28.1L148.6,32.5L146.7,34.4L148.7,38.1L145.9,39.2L146,40.6L145.2,43.3L149.7,45.1L148.9,46.7L149.8,49.3L137.8,54.6L128.9,58.1L127.4,56.8L123.4,55.8L118.8,55.6L118.1,54.4L117.8,52.4L116.8,49.9L115.9,47.7L116,45.4L116.8,43.1L117.4,41.1Z'],lx:126.6,ly:46},
  {key:'Antofagasta',roman:'II',paths:['M149.1,105.5L146.3,106.5L141.5,106.6L139.5,108.3L138.4,111.4L136.4,112.4L131.2,113.1L125.4,113.7L119.5,113.7L116.5,114L113.5,113.8L110.4,114.3L108.7,114.8L107.5,114.8L105.9,111.8L107,108.7L111.1,106.1L110.2,102.7L108.8,98.3L108.9,95L109.6,91.1L109.7,87.7L111.8,84.4L109.7,82L108.2,81.2L108.7,77.9L110,76.6L114,73.8L114.7,69.9L115.3,66.8L116,63L117.1,59.3L118.8,55.6L128,57.3L131.9,56.3L156.4,54L160.5,63.5L161.3,66.3L162.7,69.7L162.5,71.8L180.2,75.7L152,95.4L149.1,98.1L151.5,101.1L151.2,103.3Z'],lx:125.6,ly:80},
  {key:'Atacama',roman:'III',paths:['M149.1,105.5L148.7,108.3L149.8,110.4L151.3,124L153.7,128L150.7,129.2L147.6,130.2L143.8,129.9L142.6,132.2L140.4,134.2L139,136.2L137.6,140L134.7,142L132.1,144.4L128.4,146.1L126.8,147.3L125.9,149.7L125.5,152.7L124.3,155.2L121.1,157.6L119.8,159.9L121,161.6L116.8,161.9L112.4,159.9L110.3,157.9L109.3,155.6L105.4,155.8L101.9,156.6L99.6,159.4L96.6,158.7L93,156.8L89.9,156.8L89.7,154.4L92.7,151.4L94.9,148.2L96.7,145.9L96.3,142.7L98.2,139L101.1,136.9L102.3,134.7L101,131.3L102.9,129.6L104.1,127.7L104.3,125.1L105.7,123.2L106,120.3L106.9,118.3L106.8,115.9L108.7,114.8L110.2,114.4L112.1,113.8L114.3,113.5L116.8,114L121.8,113.4L125.4,113.7L130.6,113.4L135.1,112.9L138,112.1L138.1,111.1L140,107.7L141.5,106.6L145.5,106.7L147.8,105.5Z'],lx:120.2,ly:133.8},
  {key:'Coquimbo',roman:'IV',paths:['M86.8,183.3L86.4,181.2L85.8,178.5L86.1,175.9L86.4,173.6L87.6,171.9L90.8,171.1L92.5,169.9L92,168.3L94.5,167.3L93.2,164.9L93.8,162.8L93.6,160.5L90.7,157.9L92.5,156.9L95.9,157.4L98.3,159.5L100.2,158.5L101.9,156.6L105.7,156L108,155.5L109.2,156.2L110.4,158.8L112.7,159.9L116.6,162L119.1,161.9L121.2,163.6L122.1,165.3L121.9,167.3L120.7,169.7L123.8,170.6L121.8,172.8L118.7,173.9L117.3,174L116.2,176L115,177.7L114.5,179.6L114,182.5L112.7,184.1L110.3,183.8L109.5,185.7L109,187.9L108.7,190.3L110.5,191.8L112.2,194.4L115.8,195.5L113.1,196.7L113.9,198L112.7,199.7L109.9,198.5L106.9,198L105.2,196.4L101.8,197L99.4,197.1L96.2,198.2L93.2,198.9L89.2,198.6L89.6,196.8L89.6,195L89.6,193.4L88.6,190.3L87.6,187.7L86.7,184.6Z'],lx:103.6,ly:177.6},
  {key:'Valparaíso',roman:'V',paths:['M89.2,198.6L91.5,198.7L94.4,198.6L96.7,198.4L99.2,196.6L102.5,197L105.2,196.4L107,197.6L109.4,198.2L111.2,199.9L114.1,200L115.7,201.4L117,202.6L116.8,204.4L117.7,206.9L119.9,208.5L119.6,210.2L116,211.7L114.7,212.5L111.9,211.1L109.6,211.3L108.1,209.4L105.6,209.5L102,209.2L99.6,209.9L99.6,211.7L100.1,212.7L97.8,213.3L95.6,213.8L94,216L93,217.6L92,219.6L92.2,220.6L92.1,221L91.8,221.2L88.9,221.1L85.7,223.6L85.6,223.7L85.1,223.5L84.8,223.2L84.6,223.4L84.3,223.4L84.3,223.2L84.1,223.2L83.8,223L83.5,223.1L83.2,223.2L83.3,223.1L83.4,222.4L86.3,220.5L87.9,217.9L86,216L86.9,214.2L86.2,212.8L86.4,211.6L88.9,210.3L89.8,208.4L90.3,206.8L91.4,205.1L90.6,203.2L91.5,201.2L89.5,199Z'],lx:96.5,ly:207.6},
  {key:'Metropolitana de Santiago',roman:'RM',paths:['M106.8,209.5L108.4,209.8L110.4,211.3L112.5,211.6L114.7,212.5L115.9,211.9L118.7,211.6L118.7,213.1L119.8,214.6L122.8,214.1L124.3,215.7L123.4,216.9L122.4,218.9L122,220.9L122.9,222.8L122.9,223.8L122.9,225.1L122.5,226.3L122.6,228.2L120.3,228.1L118.9,228L117.1,226.9L116.6,225L114.2,225.2L113,223.9L111.2,222.2L108.8,222.7L106.7,223.5L104.6,223.6L104.1,224.3L102,225.5L101.7,226.4L101.5,226.5L97.8,226.7L97.2,226.7L94.6,225.1L92.9,225.3L92.4,225.3L92.2,225.4L91.4,224.8L90.8,224.6L90.6,224.5L88.9,224.3L88.7,224.2L88.5,224.5L88.3,224.8L88,224.6L87.3,224.4L86.8,224.3L86.4,224L86,223.9L85.8,223.7L85.7,223.6L88.9,222.5L90.5,221.3L92,221.1L92.2,221L92,220.3L92,219.6L93.4,217.7L93.1,216L95.9,214.8L96.2,213.3L98.5,213.4L100.1,212.6L99.6,211.7L99.5,210.2L100.9,209.7L104.7,209.2L106.5,209.6Z'],lx:103.3,ly:220.5},
  {key:"Libertador Gral. B. O'Higgins",roman:'VI',paths:['M80,226.8L83.3,223L83.5,223.1L84.1,223.2L84.3,223.4L84.9,223.4L85.6,223.7L85.8,223.9L86.7,224.3L88.1,224.7L88.6,224.2L90.7,224.5L92.2,225.4L93,225.3L97.6,226.7L101.5,226.3L104.1,223.4L109.7,222.7L113.5,225.2L117.7,227.2L118.7,230.9L114.1,235L112.1,238.6L109.2,237.9L108.6,237.9L108.2,238.2L106.7,238.1L106.3,237.7L105,237.1L104.3,236.7L103.1,236.7L102,236.6L101.4,236.7L100.8,236.9L100.5,236.6L100,236.3L99.6,236.1L99.2,235.8L98,236.2L96.6,235.9L95.7,236.3L92.6,237.3L92,237.2L91.7,237.3L91.5,237.2L90.9,237.2L90.2,237.2L89.9,237L88.4,236.8L87.5,236.8L86.4,237.1L86.4,237.2L86.7,237.4L84.8,237L83.1,236.3L81.9,236.1L81.1,235.7L80.9,235.3L80.4,235.1L80,234.8L79.9,234.5L79.3,234.3L79,234.2L79.5,230Z'],lx:94,ly:232.6},
  {key:'Maule',roman:'VII',paths:['M79.3,234.2L79.8,234.4L80.1,234.7L80.1,235L80.8,235.2L81.1,235.5L81.8,236.1L82.6,236.1L84.6,236.7L86.6,237.5L86.4,237.2L86.2,237.2L87.5,236.7L88,237L89.6,236.9L90.1,237.2L90.9,237.2L91.5,237.1L91.7,237.3L92,237.2L92.7,237.4L94.8,236.2L96.6,235.9L97.6,235.8L99.2,235.8L99.5,236.1L99.8,236.2L100.5,236.6L100.6,236.8L101.4,236.7L101.9,236.7L103.1,236.7L103.8,236.6L105,237L106.3,237.6L106.7,238.1L108.1,238.1L108.6,238.1L109.2,237.9L111.8,238.5L110.8,241.6L111.2,244.7L112.5,248.9L112.5,252.2L109.3,255.4L105.8,258.3L102.3,259.7L98,258.7L93.4,261.2L85.2,258L79.8,256.2L77.3,256.6L75.2,256.3L74.5,257.1L72.3,256.4L70,255.4L66.2,253.5L67.7,250.8L70.3,245.1L76.2,239.7L78.9,234.2L79.3,234.2Z'],lx:91.9,ly:242},
  {key:'Ñuble',roman:'XVI',paths:['M73,267.2L73,267.2L70.8,266.9L69,267L66.9,266.4L68.5,266L68.1,265L67.1,263.3L64.5,262.5L64,261.5L63.7,260.4L63.6,260L62.4,260L63,258.5L63.8,255.7L64.4,253.9L66.2,253.5L67.8,254.1L69.6,254.5L70,255.4L72.2,255.9L72.5,256.4L72.3,256.4L71.8,256.3L73.3,256.7L74.5,257.1L74.7,256.9L74.9,256.7L75.2,256.3L76.4,256.6L76.7,256.7L77.3,256.6L78,255.1L78,255.2L79.8,256.2L80.7,257L83.1,256.9L85.2,258L88.6,259.2L91.3,259.9L93.4,261.2L94.7,259.7L96.1,259.4L98,258.7L98.6,259.9L99.2,261.4L99.4,262.9L98.9,263.7L97.8,264L96.6,265.4L97.2,266.5L98.2,267.1L95.9,267.6L97.2,269L96.9,269.7L94.3,269.5L92.1,269L90.4,268.3L89.1,268.9L87.8,270L85,269.7L82.2,270.7L80.2,270.9L77.3,270.7L74.5,270.9L75.7,269.1L74.9,268Z'],lx:80,ly:261.9},
  {key:'Biobío',roman:'VIII',paths:['M54.5,287.4L54,289.3L53.5,290L50.5,290.1L49.4,288.8L50.8,286.2L47.2,279.1L46.4,277.4L48.2,274.9L46.7,272.2L47.9,270.4L51.4,271.6L56.6,269.9L56.4,268.4L56.1,264.8L57.5,262.9L59.8,264.1L60.5,262.1L61.5,260.8L63.6,260L64,260.6L64.7,262.2L67.9,263.9L68.5,266L67.5,266.8L71.9,267L73,267.2L76.4,268.7L75.9,270.8L80.2,270.9L83.1,269.9L88.4,269.9L89.8,268.1L92.9,269.1L96.9,269.7L97.7,271.1L96,273.5L97.5,275.4L96,277.7L96.6,279.7L97.5,281.1L99.1,283.8L98.3,284.3L97.5,284.5L96.4,284.5L94.6,284.5L91.8,284.8L88.4,286.4L85.8,286.9L86,284.3L82.1,284.1L79.5,283L75.1,281.1L71.1,279.7L69.9,277.6L66.9,277.4L62.7,277L59.8,277.4L57.7,278.7L59.2,279.5L57.8,281.5L56.3,283.9L58.5,285.5L54.7,287.2Z'],lx:71.4,ly:275.8},
  {key:'La Araucanía',roman:'IX',paths:['M64.5,276.9L67.2,277.6L69.2,277.9L70.4,278.7L72.3,280.7L75.3,281.3L79,283.2L81.4,283.5L83.7,283.6L85.8,285L86.2,286.7L87.3,287.1L89.4,286L91.8,284.8L94.1,284.6L95.4,284.5L97.4,284.5L97.6,284.5L97.7,284.4L100,286.1L100,287.3L100.3,289.4L102.5,290.7L103.3,292.2L102.3,293.5L99.6,294.4L97,295L94.6,295.5L92.5,296.7L92,298.7L92.1,300.8L92.5,302.4L91.6,303.7L91,305L89.8,306.5L89.9,307.8L87.3,307.1L85,305.8L81.6,304.5L78.2,305.7L74.6,305.9L72.4,305.8L67.6,304.9L64.7,304.7L62.3,304.4L63.3,303L60.9,302.9L58.3,304L55.4,304.1L55.4,302.8L54.3,299.4L50.2,292.9L49.7,290.2L51.7,289.3L53.6,290.2L54.3,289.4L53.5,288L54.7,287.2L57.4,285.7L58.1,284.4L55.9,283.4L57.8,281.5L59.4,280.1L59.2,278.6L57.9,278.1L59.8,277.4L61.4,277.2Z'],lx:76.6,ly:291.6},
  {key:'Los Ríos',roman:'XIV',paths:['M77.7,305.9L79.8,304.9L83.2,305.3L85.6,305.6L86,307.8L86.6,308.5L86.3,310L86.6,311.3L88.2,312.1L87.2,313L86.7,314.6L84.3,314.8L83.5,316.1L84.3,317.6L86.3,318L86.1,319.2L83.8,319.8L82.9,321.3L82.3,322.5L79.5,323.2L77.2,323.7L74.8,323.6L73.3,323.9L72.9,323.7L70.2,323.7L66.6,323.1L64.1,322.5L62.7,321.5L61.8,320.3L59.4,319.4L56.8,319L53.1,318.6L51,318.1L49.9,317.9L46.9,317.9L45.7,316.9L46.9,315.5L45.9,313.5L47.5,312.8L50.2,311.9L52,312.2L52.5,311.8L54.6,312.2L56.7,311.9L55.9,311.8L55,310.5L55.9,309.3L55.6,309.1L54.5,310.2L53.6,311.1L52.2,311.2L52.2,309.8L52.9,308.4L54.4,307.1L55.1,305.7L55.1,304.1L57.3,304.1L59.5,302.7L61.6,302.7L62.8,303.2L62.3,304.4L64.2,304.7L66.5,305L69.7,305.4L74.3,305.6L75.7,306.2Z'],lx:66.4,ly:313},
  {key:'Los Lagos',roman:'X',paths:['M63,336.8L58.8,337.9L56.8,341.5L50.2,341.6L48.5,338.8L49.9,337.6L46.4,338.2L43,333.7L41.1,328.8L44,324.5L45.2,321.2L46.4,317.6L52.3,318.6L60.8,319.8L64.6,322.8L72.9,323.7L76.7,323.7L83.3,322.7L81.8,326.7L82.6,332.1L82.7,335.3L83.3,339.2L84.2,342.8L84.5,346.9L77.9,347.2L77.7,351.2L78,355.1L77.1,358.5L81.3,361.8L84.9,364.7L82.1,367.1L84.5,369.7L86.9,372.3L86.7,375.6L83.4,377L78.8,376.3L77.7,375.3L76.1,374.9L74.9,373.9L74.1,373L73.3,371.9L70.3,373.3L67.8,373.2L64,373L64.2,371.4L62.9,373L61.6,372.4L60.5,372.2L58.2,368.4L62.1,363.5L64.5,361L63.9,358.5L64.9,353.1L68.5,353.4L63.9,349.4L69.8,350L70.6,349.7L72.2,347.4L68,345.4L62.5,343.5L69.8,340.4L74.3,335.4L72.7,339.1L66.7,338.9Z'],lx:68.4,ly:349.9},
  {key:'Aysén',roman:'XI',paths:['M31.4,440.6L32.7,439L36.2,439.1L36.3,437.8L32.4,435.5L36.2,431.3L36.3,429.7L31.3,424.2L21.4,419.5L8.8,424.2L14.7,426.1L9.1,420.9L16.6,417.5L22.5,413.7L19.7,412.7L24.4,408.5L32.4,410.4L37.7,409.1L39.3,411.8L34.9,415.1L41,413.2L45.5,419.1L49.9,413.8L52.5,408.9L49.1,407L59.1,400.9L54.5,398L54.6,395.1L65.7,389.8L67.1,384.8L56.4,380.6L59.1,375L61.6,372.3L64.2,371.4L68.3,373.4L74,372.5L74.4,374.5L77.9,376L83.1,379.1L91.8,383.7L95.1,390.5L79.7,389.9L89.2,393.9L90.2,401.8L86.1,408.5L85.3,416.3L80.9,429.3L75,435.2L70.2,444.8L71.9,452.9L64.2,462.7L38.1,457.9L41.8,455.5L40.6,451.1L27.9,446.3L39.3,445.1L50.3,449.8L55,447.8L52.3,444.9L46.3,439.5L45.3,440.7L30.3,441.1Z'],lx:51.4,ly:415.4},
  {key:'Magallanes',roman:'XII',paths:['M82.5,552.3L71.6,545.1L79.1,544.4L83.6,549.1L94.8,538.9L87.2,530.5L68.7,531L61.3,532.9L61.1,536.9L52.3,539.7L48.6,535.2L53,531.6L46.1,534.1L47.3,527.1L47.9,521.6L59.7,521.1L63.4,522L65,518.6L61.8,528.4L69.7,524.5L70.3,514.8L58.2,508.8L62.8,511.2L63.2,514.7L56.7,513.9L56,517.3L54.6,518.4L49.6,520L48.1,514.4L42.9,511.3L48.1,511.8L44.7,502.3L38.4,500.3L43.5,499.3L44.6,494.1L45.5,491.1L42,496.6L34.3,490.7L38.3,489.3L30.8,488.3L32.7,482.6L35.9,484.6L39.9,481.7L33.5,479.5L34.3,474.7L43.9,475.1L42.5,469.5L36.9,472.9L31.6,464.5L39.1,458.5L50.3,478.6L51.2,488L56.6,496.5L70.9,493.1L73,504.1L74.9,513.6L145.8,524.8L130.8,524.4L112.8,532.1L104,534.5L101,543.8L95.1,556.4Z'],lx:60.1,ly:510.8},
];

function normalizeRegion(raw: string): string {
  if (!raw) return '';
  const r = raw.toLowerCase().trim();
  if (r.includes('arica') || r.includes('parinacota'))                          return 'Arica y Parinacota';
  if (r.includes('tarapac') || r.includes('iquique'))                           return 'Tarapacá';
  if (r.includes('antofagasta') || r.includes('calama'))                        return 'Antofagasta';
  if (r.includes('atacama') || r.includes('copiap'))                            return 'Atacama';
  if (r.includes('coquimbo') || r.includes('la serena') || r.includes('ovalle'))return 'Coquimbo';
  if (r.includes('valpara') || r.includes('viña del mar') || r.includes('viña'))return 'Valparaíso';
  if (r.includes('metropolitana') || r.includes('santiago') || r === 'rm')      return 'Metropolitana de Santiago';
  if (r.includes("o'higgins") || r.includes('ohiggins') || r.includes('libertador') || r.includes('rancagua')) return "Libertador Gral. B. O'Higgins";
  if (r.includes('maule') || r.includes('talca') || r.includes('curic'))        return 'Maule';
  if (r.includes('ñuble') || r.includes('nuble') || r.includes('chillán') || r.includes('chillan')) return 'Ñuble';
  if (r.includes('biob') || r.includes('concepci') || r.includes('coronel'))    return 'Biobío';
  if (r.includes('araucan') || r.includes('temuco'))                            return 'La Araucanía';
  if (r.includes('los ríos') || r.includes('los rios') || r.includes('valdivia'))return 'Los Ríos';
  if (r.includes('los lagos') || r.includes('puerto montt') || r.includes('osorno') || r.includes('chiloe') || r.includes('chiloé')) return 'Los Lagos';
  if (r.includes('ays') || r.includes('coihaique') || r.includes('coyhaique'))  return 'Aysén';
  if (r.includes('magallanes') || r.includes('punta arenas'))                   return 'Magallanes';
  return raw;
}

// Regiones visibles (sin Aysén ni Magallanes que se ven feas al sur)
const VISIBLE_REGIONS = CHILE_REGIONS.filter(r => r.key !== 'Aysén' && r.key !== 'Magallanes');

function ChileMap({ regionCounts }: { regionCounts: Record<string, number> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef(regionCounts);
  dataRef.current = regionCounts;
  
  const [selectedRegion, setSelectedRegion] = useState<string | null>('Metropolitana de Santiago');
  const selectedRef = useRef<string | null>('Metropolitana de Santiago');
  selectedRef.current = selectedRegion;

  const panRef = useRef({ offsetY: 0, dragging: false, startY: 0 });
  const hoverRef = useRef<string | null>(null);
  const liftRef = useRef<Record<string, number>>({});
  const tooltipRef = useRef<HTMLDivElement>(null);
  const bgCache = useRef<CanvasGradient | null>(null);
  const gradientCache = useRef<Record<string, { norm: CanvasGradient, hov: CanvasGradient }>>({});

  const W = 320, H = 640;

  // 1. PRECOMPUTE GEOMETRY ONCE (O(N) executed once instead of O(N) at 60fps)
  const precomputedRegions = useMemo(() => {
    const rotRad = (-14 * Math.PI) / 180;
    const cosR = Math.cos(rotRad), sinR = Math.sin(rotRad);
    const centerX = 95, centerY = 200;
    
    const tx = (x: number, y: number) => W / 2 + 15 + ((x - centerX) * cosR - (y - centerY) * sinR) * 2.1;
    const ty = (x: number, y: number) => H / 2 - 30 + ((x - centerX) * sinR + (y - centerY) * cosR) * 2.1;

    return VISIBLE_REGIONS.map(r => {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      
      const polys = r.paths.map(p => {
        const pts: [number, number][] = [];
        const re = /([ML])([\d.\-]+),([\d.\-]+)/g;
        let m;
        while ((m = re.exec(p)) !== null) {
           const px = tx(parseFloat(m[2]), parseFloat(m[3]));
           const py = ty(parseFloat(m[2]), parseFloat(m[3]));
           pts.push([px, py]);
           if (px < minX) minX = px; if (px > maxX) maxX = px;
           if (py < minY) minY = py; if (py > maxY) maxY = py;
        }
        return pts;
      });

      // Browser native C++ Path2D engine handles drawing instantly
      const fullPath = new Path2D();
      polys.forEach(pts => {
        pts.forEach(([x, y], i) => i === 0 ? fullPath.moveTo(x, y) : fullPath.lineTo(x, y));
        fullPath.closePath();
      });
      
      const innerGlowPath = new Path2D();
      polys.forEach(pts => {
        pts.forEach(([x, y], i) => i === 0 ? innerGlowPath.moveTo(x+1, y+1) : innerGlowPath.lineTo(x+1, y+1));
        innerGlowPath.closePath();
      });

      return {
        key: r.key, roman: r.roman, lx: tx(r.lx, r.ly), ly: ty(r.lx, r.ly),
        fullPath, innerGlowPath, bounds: { minX, maxX, minY, maxY }
      };
    });
  }, []);

  const precomputedSantiago = useMemo(() => {
    const rotRad = (-14 * Math.PI) / 180;
    const cosR = Math.cos(rotRad), sinR = Math.sin(rotRad);
    const centerX = 95, centerY = 200;
    const x = 85, y = 240;
    return {
      sx: W / 2 + 15 + ((x - centerX) * cosR - (y - centerY) * sinR) * 2.1,
      sy: H / 2 - 30 + ((x - centerX) * sinR + (y - centerY) * cosR) * 2.1
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = '100%'; canvas.style.height = '100%';
    canvas.style.minHeight = '640px';
    canvas.style.objectFit = 'contain';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (Object.keys(gradientCache.current).length === 0) {
      precomputedRegions.forEach(reg => {
        const { minX, minY, maxX, maxY } = reg.bounds;
        const norm = ctx.createLinearGradient(minX, minY, maxX, maxY);
        norm.addColorStop(0, '#ffffff');
        norm.addColorStop(1, '#f1f5f9');
        
        const hov = ctx.createLinearGradient(minX, minY, maxX, maxY);
        hov.addColorStop(0, '#38bdf8'); // Sky 400
        hov.addColorStop(1, '#818cf8'); // Indigo 400
        gradientCache.current[reg.key] = { norm, hov };
      });
    }

    let frame = 0, animId: number;
    const palette = ['#6366f1','#e396bf','#10b981','#f59e0b','#8b5cf6','#ef4444','#14b8a6','#eab308','#a855f7','#f43f5e','#06b6d4','#84cc16','#d946ef','#f97316','#0ea5e9','#22c55e'];

    function draw() {
      frame++;
      const counts = dataRef.current;
      const maxC = Math.max(...Object.values(counts), 1);
      const hov = hoverRef.current;

      for (const reg of precomputedRegions) {
        const target = hov === reg.key ? 1 : 0;
        const cur = liftRef.current[reg.key] || 0;
        liftRef.current[reg.key] = cur + (target - cur) * 0.12;
      }

      ctx!.clearRect(0, 0, W, H);

      // Grid Background
      ctx!.fillStyle = '#ffffff';
      ctx!.fillRect(0, 0, W, H);
      ctx!.fillStyle = '#e2e8f0'; // Slate 200 dots
      for(let x = 0; x < W; x += 16) {
        for(let y = 0; y < H; y += 16) {
          ctx!.beginPath(); ctx!.arc(x, y, 1.2, 0, Math.PI * 2); ctx!.fill();
        }
      }

      // Pan Translation for Map Elements
      ctx!.save();
      ctx!.translate(0, panRef.current.offsetY);

      // Pass 1: Drop Shadow
      ctx!.save();
      for (const reg of precomputedRegions) {
        const lift = liftRef.current[reg.key] || 0;
        if (lift < 0.01) continue;
        ctx!.save();
        ctx!.translate(4 * lift, 8 * lift);
        ctx!.globalAlpha = lift * 0.6;
        ctx!.fillStyle = '#cbd5e1'; // Solid isometric shadow
        ctx!.fill(reg.fullPath);
        ctx!.restore();
      }
      ctx!.restore();

      // Pass 2: Main Map Elements (Regions, Neon Borders, Heatmap)
      const selected = selectedRef.current;
      for (let i = 0; i < precomputedRegions.length; i++) {
        const reg = precomputedRegions[i];
        const isSelected = selected === reg.key;
        const isHov = hov === reg.key;
        const highlight = isHov || isSelected;
        const lift = liftRef.current[reg.key] || 0;
        const off = -lift * 4;

        ctx!.save();
        ctx!.translate(off, off);

        // Base Gradient
        ctx!.fillStyle = gradientCache.current[reg.key].norm;
        ctx!.fill(reg.fullPath);

        // Heatmap / Hover / Selection Highlight
        if (highlight) {
          ctx!.fillStyle = isHov ? gradientCache.current[reg.key].hov : 'rgba(56, 189, 248, 0.2)'; // Sky soft highlight for selection
          ctx!.fill(reg.fullPath);
        }

        // Professional Clean Border
        ctx!.strokeStyle = isHov ? '#818cf8' : (isSelected ? '#60a5fa' : '#cbd5e1');
        ctx!.lineWidth = isHov ? 2 : (isSelected ? 1.5 : 1.2);
        if (isHov) {
          ctx!.shadowColor = 'rgba(129, 140, 248, 0.4)';
          ctx!.shadowBlur = 8;
        } else {
          ctx!.shadowBlur = 0;
        }
        ctx!.stroke(reg.fullPath);

        ctx!.restore(); // End offset translation
      }

      // ═══ REGION LABELS (Cyberpunk Minimal) ═══
      for (const reg of precomputedRegions) {
        const isSelected = selected === reg.key;
        const isHov = hov === reg.key;
        if (!isHov && !isSelected) continue; // Only show text for hovered or selected regions
        
        ctx!.save();
        ctx!.font = `600 ${isHov ? 10 : 8}px 'Inter', sans-serif`;
        ctx!.textAlign = 'center'; ctx!.textBaseline = 'middle';
        
        ctx!.fillStyle = isHov ? '#4f46e5' : '#1e3a8a'; // Indigo 600 or Blue 900
        if (isHov) {
          ctx!.shadowColor = 'rgba(199, 210, 254, 0.6)';
          ctx!.shadowBlur = 4;
        } else {
          ctx!.shadowBlur = 0;
        }
        ctx!.fillText(reg.roman, reg.lx, reg.ly);
        ctx!.restore();
      }

      // ═══ SANTIAGO PIN (Neon Pulse) ═══
      const { sx, sy } = precomputedSantiago;
      const pT = frame * 0.05;
      const pulseSize = 3 + Math.abs(Math.sin(pT)) * 4;
      const pulseAlpha = 0.8 - Math.abs(Math.sin(pT)) * 0.8;
      
      ctx!.save();
      // Outer glow pulse
      ctx!.beginPath(); ctx!.arc(sx, sy, pulseSize, 0, Math.PI * 2);
      ctx!.fillStyle = `rgba(59, 130, 246, ${pulseAlpha})`; // Blue 500
      ctx!.fill(); 
      // Core dot
      ctx!.beginPath(); ctx!.arc(sx, sy, 2.5, 0, Math.PI * 2);
      ctx!.fillStyle = '#3b82f6'; // Blue 500
      ctx!.shadowColor = 'rgba(59, 130, 246, 0.5)'; ctx!.shadowBlur = 6;
      ctx!.fill();
      // Thin Tooltip text
      ctx!.font = '500 9px "Inter", sans-serif';
      ctx!.fillStyle = '#1e3a8a'; // Blue 900
      ctx!.shadowBlur = 0;
      ctx!.fillText('STGO', sx + 8, sy + 3);
      ctx!.restore();

      ctx!.restore(); // END PAN TRANSLATION

      animId = requestAnimationFrame(draw);
    }
    draw();

    // ── NATIVE RAYCASTING FOR HOVER ──
    const onHover = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const canvasRatio = W / H;
      const rectRatio = rect.width / rect.height;
      let actualW = rect.width;
      let actualH = rect.height;
      let offsetX = 0;
      let offsetY = 0;
      
      if (rectRatio > canvasRatio) { // Pillarbox (ultrawide)
        actualW = rect.height * canvasRatio;
        offsetX = (rect.width - actualW) / 2;
      } else { // Letterbox
        actualH = rect.width / canvasRatio;
        offsetY = (rect.height - actualH) / 2;
      }
      
      const scaleX = W / actualW;
      const scaleY = H / actualH;
      const mx = (e.clientX - rect.left - offsetX) * scaleX;
      // Adjust mouse Y coordinate by current pan offset for correct native collision
      const myPan = ((e.clientY - rect.top - offsetY) * scaleY) - panRef.current.offsetY; 
      
      let found: string | null = null;
      for (const reg of precomputedRegions) {
        // C++ native hit detection - instant O(1) performance
        if (ctx!.isPointInPath(reg.fullPath, mx, myPan)) { 
          found = reg.key; break; 
        }
      }
      hoverRef.current = found;
      canvas.style.cursor = found ? 'pointer' : (panRef.current.dragging ? 'grabbing' : 'grab');
      
      const tip = tooltipRef.current;
      if (tip) {
        if (found) {
          const c = dataRef.current[found] || 0;
          const line2 = c > 0 ? `${c} pedido${c > 1 ? 's' : ''}` : 'Sin pedidos';
          tip.innerHTML = `<div style="font-weight:700;font-size:12px;color:#1e293b;letter-spacing:0.02em;">${found}</div><div style="font-size:11px;font-weight:600;color:${c > 0 ? '#4f46e5' : '#64748b'};margin-top:2px;">${line2}</div>`;
          tip.style.display = 'block';
          const cssX = e.clientX - rect.left;
          const cssY = e.clientY - rect.top;
          const tipW = tip.offsetWidth || 140;
          const left = cssX + tipW + 20 > rect.width ? cssX - tipW - 8 : cssX + 14;
          tip.style.left = left + 'px';
          tip.style.top = (cssY - 50) + 'px';
        } else {
          tip.style.display = 'none';
        }
      }
    };

    const down = (e: MouseEvent) => { panRef.current.dragging = true; panRef.current.startY = e.clientY; canvas.style.cursor = 'grabbing'; };
    const move = (e: MouseEvent) => {
      onHover(e);
      if (!panRef.current.dragging) return;
      panRef.current.offsetY += (e.clientY - panRef.current.startY); panRef.current.startY = e.clientY;
    };
    const up = () => { panRef.current.dragging = false; };
    const tdown = (e: TouchEvent) => { panRef.current.dragging = true; panRef.current.startY = e.touches[0].clientY; };
    const tmove = (e: TouchEvent) => { if (!panRef.current.dragging) return; panRef.current.offsetY += (e.touches[0].clientY - panRef.current.startY); panRef.current.startY = e.touches[0].clientY; };
    
    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const canvasRatio = W / H;
      const rectRatio = rect.width / rect.height;
      let actualW = rect.width;
      let actualH = rect.height;
      let offsetX = 0;
      let offsetY = 0;
      
      if (rectRatio > canvasRatio) { // Pillarbox (ultrawide)
        actualW = rect.height * canvasRatio;
        offsetX = (rect.width - actualW) / 2;
      } else { // Letterbox
        actualH = rect.width / canvasRatio;
        offsetY = (rect.height - actualH) / 2;
      }
      
      const scaleX = W / actualW;
      const scaleY = H / actualH;
      const mx = (e.clientX - rect.left - offsetX) * scaleX;
      const myPan = ((e.clientY - rect.top - offsetY) * scaleY) - panRef.current.offsetY; 
      
      let found: string | null = null;
      for (const reg of precomputedRegions) {
        if (ctx!.isPointInPath(reg.fullPath, mx, myPan)) { 
          found = reg.key; 
          break; 
        }
      }
      
      if (found) {
        setSelectedRegion(found);
      }
    };

    canvas.addEventListener('mousedown', down); window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    canvas.addEventListener('touchstart', tdown, { passive: true }); window.addEventListener('touchmove', tmove, { passive: true }); window.addEventListener('touchend', up);
    canvas.addEventListener('click', onClick);
    return () => { cancelAnimationFrame(animId);
      canvas.removeEventListener('mousedown', down); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
      canvas.removeEventListener('touchstart', tdown); window.removeEventListener('touchmove', tmove); window.removeEventListener('touchend', up);
      canvas.removeEventListener('click', onClick);
    };
  }, [precomputedRegions, precomputedSantiago]);

  return (
    <div style={{ borderRadius: 14, background: '#ffffff', position: 'relative', overflow: 'hidden', border: '1px solid #e5e7eb', boxShadow: 'inset 0 0 40px rgba(0,0,0,0.02)' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', cursor: 'grab', borderRadius: 14 }} />
      <div ref={tooltipRef} style={{ display: 'none', position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 20, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', borderRadius: 8, padding: '8px 12px', boxShadow: '0 4px 14px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0', whiteSpace: 'nowrap', minWidth: 80 }} />
      <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(4px)', borderRadius: 20, padding: '4px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>☰</span>
        <span style={{ fontSize: 9, color: '#64748b', fontWeight: 600, letterSpacing: '0.05em' }}>ARRASTRA PARA MOVER</span>
      </div>
    </div>
  );
}

function normalizeName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function SantiagoMap({ comunaCounts }: { comunaCounts: Record<string, number> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef(comunaCounts);
  dataRef.current = comunaCounts;
  
  const [selectedComuna, setSelectedComuna] = useState<string | null>('Santiago');
  const selectedRef = useRef<string | null>('Santiago');
  selectedRef.current = selectedComuna;

  const panRef = useRef({ offsetX: -36, offsetY: 54, dragging: false, startX: 0, startY: 0 });
  const hoverRef = useRef<string | null>(null);
  const liftRef = useRef<Record<string, number>>({});
  const tooltipRef = useRef<HTMLDivElement>(null);
  const gradientCache = useRef<Record<string, { norm: CanvasGradient, hov: CanvasGradient, active: CanvasGradient }>>({});

  const [zoom, setZoom] = useState(1.8);
  const zoomRef = useRef(1.8);
  zoomRef.current = zoom;

  const W = 400, H = 400;

  const precomputedComunas = useMemo(() => {
    return SANTIAGO_COMUNAS.map(c => {
      const fullPath = new Path2D();
      const pts: [number, number][] = [];
      const matches = c.paths[0].matchAll(/([ML])([\d.\-]+),([\d.\-]+)/g);
      for (const match of matches) {
        pts.push([parseFloat(match[2]), parseFloat(match[3])]);
      }
      
      pts.forEach(([px, py], idx) => {
        if (idx === 0) fullPath.moveTo(px, py);
        else fullPath.lineTo(px, py);
      });
      fullPath.closePath();

      return {
        key: c.key,
        provincia: c.provincia,
        code: c.code,
        lx: c.lx,
        ly: c.ly,
        fullPath,
        normKey: normalizeName(c.key)
      };
    });
  }, []);

  const topCommuneInfo = useMemo(() => {
    let topName = '';
    let topVal = -1;
    let lx = W / 2;
    let ly = H / 2;
    
    precomputedComunas.forEach(c => {
      const count = dataRef.current[c.normKey] || 0;
      if (count > topVal && count > 0) {
        topVal = count;
        topName = c.key;
        lx = c.lx;
        ly = c.ly;
      }
    });
    
    return topName ? { name: topName, lx, ly } : null;
  }, [comunaCounts, precomputedComunas]);

  const handleZoomIn = () => {
    setZoom(prev => Math.min(6, prev + 0.3));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(0.6, prev - 0.3));
  };

  const handleZoomReset = () => {
    setZoom(1.8);
    panRef.current.offsetX = -36;
    panRef.current.offsetY = 54;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.minHeight = '400px';
    canvas.style.objectFit = 'contain';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    precomputedComunas.forEach(c => {
      if (!gradientCache.current[c.key]) {
        const lx = c.lx;
        const ly = c.ly;
        
        const norm = ctx.createLinearGradient(lx - 20, ly - 20, lx + 20, ly + 20);
        norm.addColorStop(0, '#ffffff');
        norm.addColorStop(1, '#f8fafc');
        
        const active = ctx.createLinearGradient(lx - 20, ly - 20, lx + 20, ly + 20);
        active.addColorStop(0, '#bae6fd');
        active.addColorStop(1, '#7dd3fc');
        
        const hov = ctx.createLinearGradient(lx - 20, ly - 20, lx + 20, ly + 20);
        hov.addColorStop(0, '#38bdf8');
        hov.addColorStop(1, '#818cf8');
        
        gradientCache.current[c.key] = { norm, active, hov };
      }
    });

    let frame = 0, animId: number;

    function draw() {
      frame++;
      const counts = dataRef.current;
      const hov = hoverRef.current;
      const curZoom = zoomRef.current;

      for (const c of precomputedComunas) {
        const target = hov === c.key ? 1 : 0;
        const cur = liftRef.current[c.key] || 0;
        liftRef.current[c.key] = cur + (target - cur) * 0.15;
      }

      ctx!.clearRect(0, 0, W, H);

      ctx!.fillStyle = '#ffffff';
      ctx!.fillRect(0, 0, W, H);
      ctx!.fillStyle = '#e2e8f0';
      for(let x = 0; x < W; x += 16) {
        for(let y = 0; y < H; y += 16) {
          ctx!.beginPath(); ctx!.arc(x, y, 1.2, 0, Math.PI * 2); ctx!.fill();
        }
      }

      ctx!.save();
      ctx!.translate(W / 2 + panRef.current.offsetX, H / 2 + panRef.current.offsetY);
      ctx!.scale(curZoom, curZoom);
      ctx!.translate(-W / 2, -H / 2);

      ctx!.save();
      for (const c of precomputedComunas) {
        const lift = liftRef.current[c.key] || 0;
        if (lift < 0.01) continue;
        ctx!.save();
        ctx!.translate(3 * lift, 6 * lift);
        ctx!.globalAlpha = lift * 0.5;
        ctx!.fillStyle = '#cbd5e1';
        ctx!.fill(c.fullPath);
        ctx!.restore();
      }
      ctx!.restore();

      const selected = selectedRef.current;
      for (const c of precomputedComunas) {
        const isSelected = selected === c.key;
        const isHov = hov === c.key;
        const highlight = isHov || isSelected;
        const lift = liftRef.current[c.key] || 0;
        const off = -lift * 3;

        ctx!.save();
        ctx!.translate(off, off);

        const gradients = gradientCache.current[c.key];
        if (isHov) {
          ctx!.fillStyle = gradients.hov;
        } else if (isSelected) {
          ctx!.fillStyle = gradients.active;
        } else {
          ctx!.fillStyle = gradients.norm;
        }
        
        ctx!.fill(c.fullPath);

        ctx!.strokeStyle = isHov ? '#818cf8' : (isSelected ? '#60a5fa' : '#cbd5e1');
        ctx!.lineWidth = isHov ? 1.8 / curZoom : (isSelected ? 1.2 / curZoom : 0.8 / curZoom);
        
        if (isHov) {
          ctx!.shadowColor = 'rgba(129, 140, 248, 0.4)';
          ctx!.shadowBlur = 6 / curZoom;
        } else {
          ctx!.shadowBlur = 0;
        }
        ctx!.stroke(c.fullPath);

        ctx!.restore();
      }

      const labelsToDraw = precomputedComunas.map(c => {
        const isSelected = selected === c.key;
        const isHov = hov === c.key;
        const count = counts[c.normKey] || 0;
        return { c, isHov, isSelected, count };
      });

      labelsToDraw.sort((a, b) => {
        if (a.isHov) return -1;
        if (b.isHov) return 1;
        if (a.isSelected) return -1;
        if (b.isSelected) return 1;
        return b.count - a.count;
      });

      const drawnRects: { x1: number; y1: number; x2: number; y2: number }[] = [];

      for (const { c, isHov, isSelected, count } of labelsToDraw) {
        const hasVisits = count > 0;
        
        if (isHov || isSelected || hasVisits || curZoom > 1.8) {
          const lift = liftRef.current[c.key] || 0;
          const off = -lift * 3;
          
          ctx!.save();
          ctx!.translate(off, off);
          
          const fontSize = isHov ? 9 : (curZoom > 2.5 ? 6.5 : 7.5);
          ctx!.font = `600 ${fontSize}px 'Inter', sans-serif`;
          
          const textWidth = ctx!.measureText(c.key).width;
          const textHeight = fontSize;
          
          // Collision padding decreases as zoom increases, allowing denser labels zoomed-in
          const paddingX = Math.max(2, 7 - curZoom * 1.8);
          const paddingY = Math.max(1.5, 4.5 - curZoom);
          
          const x1 = c.lx - textWidth / 2 - paddingX;
          const x2 = c.lx + textWidth / 2 + paddingX;
          const y1 = c.ly - textHeight / 2 - paddingY;
          const y2 = c.ly + textHeight / 2 + paddingY;
          
          const overlaps = drawnRects.some(rect => {
            return !(x2 < rect.x1 || x1 > rect.x2 || y2 < rect.y1 || y1 > rect.y2);
          });
          
          // Hovered label is ALWAYS rendered; others render only if they don't overlap
          if (isHov || !overlaps) {
            ctx!.textAlign = 'center';
            ctx!.textBaseline = 'middle';
            ctx!.fillStyle = isHov ? '#4f46e5' : (isSelected ? '#1e3a8a' : '#64748b');
            
            if (isHov) {
              ctx!.shadowColor = 'rgba(199, 210, 254, 0.6)';
              ctx!.shadowBlur = 4;
            }
            ctx!.fillText(c.key, c.lx, c.ly);
            drawnRects.push({ x1, y1, x2, y2 });
          }
          ctx!.restore();
        }
      }

      if (topCommuneInfo) {
        const { lx, ly } = topCommuneInfo;
        const pT = frame * 0.05;
        const pulseSize = 4 + Math.abs(Math.sin(pT)) * 6;
        const pulseAlpha = 0.8 - Math.abs(Math.sin(pT)) * 0.8;
        
        ctx!.save();
        ctx!.beginPath();
        ctx!.arc(lx, ly, pulseSize / curZoom, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(59, 130, 246, ${pulseAlpha})`;
        ctx!.fill();
        
        ctx!.beginPath();
        ctx!.arc(lx, ly, 3.5 / curZoom, 0, Math.PI * 2);
        ctx!.fillStyle = '#2563eb';
        ctx!.shadowColor = 'rgba(37, 99, 235, 0.5)';
        ctx!.shadowBlur = 4 / curZoom;
        ctx!.fill();
        ctx!.restore();
      }

      ctx!.restore();

      animId = requestAnimationFrame(draw);
    }
    
    draw();

    const onHover = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const canvasRatio = W / H;
      const rectRatio = rect.width / rect.height;
      let actualW = rect.width;
      let actualH = rect.height;
      let offsetX = 0;
      let offsetY = 0;
      
      if (rectRatio > canvasRatio) {
        actualW = rect.height * canvasRatio;
        offsetX = (rect.width - actualW) / 2;
      } else {
        actualH = rect.width / canvasRatio;
        offsetY = (rect.height - actualH) / 2;
      }
      
      const scaleX = W / actualW;
      const scaleY = H / actualH;
      
      const mx = ((e.clientX - rect.left - offsetX) * scaleX);
      const my = ((e.clientY - rect.top - offsetY) * scaleY);
      
      const mapX = ((mx - W / 2 - panRef.current.offsetX) / zoomRef.current) + W / 2;
      const mapY = ((my - H / 2 - panRef.current.offsetY) / zoomRef.current) + H / 2;
      
      let found: typeof precomputedComunas[number] | null = null;
      for (const c of precomputedComunas) {
        if (ctx!.isPointInPath(c.fullPath, mapX, mapY)) {
          found = c;
          break;
        }
      }

      hoverRef.current = found ? found.key : null;
      canvas.style.cursor = found ? 'pointer' : (panRef.current.dragging ? 'grabbing' : 'grab');

      const tip = tooltipRef.current;
      if (tip) {
        if (found) {
          const count = dataRef.current[found.normKey] || 0;
          tip.innerHTML = `
            <div style="font-weight:700;font-size:11px;color:#1e293b;letter-spacing:0.02em;">${found.key}</div>
            <div style="font-size:9px;color:#64748b;margin-top:1px;">Provincia: ${found.provincia}</div>
            <div style="font-size:10px;font-weight:600;color:${count > 0 ? '#2563eb' : '#64748b'};margin-top:3px;">
              ${count > 0 ? `${count} visita${count !== 1 ? 's' : ''}` : 'Sin visitas recientes'}
            </div>
          `;
          tip.style.display = 'block';
          const cssX = e.clientX - rect.left;
          const cssY = e.clientY - rect.top;
          const tipW = tip.offsetWidth || 140;
          const left = cssX + tipW + 20 > rect.width ? cssX - tipW - 8 : cssX + 14;
          tip.style.left = left + 'px';
          tip.style.top = (cssY - 55) + 'px';
        } else {
          tip.style.display = 'none';
        }
      }
    };

    const down = (e: MouseEvent) => {
      panRef.current.dragging = true;
      panRef.current.startX = e.clientX;
      panRef.current.startY = e.clientY;
      canvas.style.cursor = 'grabbing';
      canvas.dataset.startX = e.clientX.toString();
      canvas.dataset.startY = e.clientY.toString();
    };

    const move = (e: MouseEvent) => {
      onHover(e);
      if (!panRef.current.dragging) return;
      panRef.current.offsetX += (e.clientX - panRef.current.startX);
      panRef.current.offsetY += (e.clientY - panRef.current.startY);
      panRef.current.startX = e.clientX;
      panRef.current.startY = e.clientY;
    };

    const up = () => {
      panRef.current.dragging = false;
    };

    const tdown = (e: TouchEvent) => {
      panRef.current.dragging = true;
      panRef.current.startX = e.touches[0].clientX;
      panRef.current.startY = e.touches[0].clientY;
    };

    const tmove = (e: TouchEvent) => {
      if (!panRef.current.dragging) return;
      panRef.current.offsetX += (e.touches[0].clientX - panRef.current.startX);
      panRef.current.offsetY += (e.touches[0].clientY - panRef.current.startY);
      panRef.current.startX = e.touches[0].clientX;
      panRef.current.startY = e.touches[0].clientY;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomSpeed = 0.08;
      const direction = e.deltaY < 0 ? 1 : -1;
      setZoom(prev => {
        let newZoom = prev + direction * zoomSpeed;
        return Math.max(0.6, Math.min(6, newZoom));
      });
    };

    const onClick = (e: MouseEvent) => {
      const startX = parseInt(canvas.dataset.startX || '0');
      const startY = parseInt(canvas.dataset.startY || '0');
      const dx = Math.abs(e.clientX - startX);
      const dy = Math.abs(e.clientY - startY);
      if (dx > 5 || dy > 5) return; // Dragged, ignore selection click
      
      const rect = canvas.getBoundingClientRect();
      const canvasRatio = W / H;
      const rectRatio = rect.width / rect.height;
      let actualW = rect.width;
      let actualH = rect.height;
      let offsetX = 0;
      let offsetY = 0;
      
      if (rectRatio > canvasRatio) {
        actualW = rect.height * canvasRatio;
        offsetX = (rect.width - actualW) / 2;
      } else {
        actualH = rect.width / canvasRatio;
        offsetY = (rect.height - actualH) / 2;
      }
      
      const scaleX = W / actualW;
      const scaleY = H / actualH;
      
      const mx = ((e.clientX - rect.left - offsetX) * scaleX);
      const my = ((e.clientY - rect.top - offsetY) * scaleY);
      
      const mapX = ((mx - W / 2 - panRef.current.offsetX) / zoomRef.current) + W / 2;
      const mapY = ((my - H / 2 - panRef.current.offsetY) / zoomRef.current) + H / 2;
      
      let found: typeof precomputedComunas[number] | null = null;
      for (const c of precomputedComunas) {
        if (ctx!.isPointInPath(c.fullPath, mapX, mapY)) {
          found = c;
          break;
        }
      }

      if (found) {
        setSelectedComuna(found.key);
      }
    };

    canvas.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    canvas.addEventListener('touchstart', tdown, { passive: true });
    window.addEventListener('touchmove', tmove, { passive: true });
    window.addEventListener('touchend', up);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('click', onClick);

    return () => {
      cancelAnimationFrame(animId);
      canvas.removeEventListener('mousedown', down);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      canvas.removeEventListener('touchstart', tdown);
      window.removeEventListener('touchmove', tmove);
      canvas.removeEventListener('touchend', up);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('click', onClick);
    };
  }, [precomputedComunas, topCommuneInfo]);

  return (
    <div style={{ borderRadius: 14, background: '#ffffff', position: 'relative', overflow: 'hidden', border: '1px solid #e5e7eb', boxShadow: 'inset 0 0 40px rgba(0,0,0,0.02)', gridColumn: 'span 1' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', cursor: 'grab', borderRadius: 14 }} />
      <div ref={tooltipRef} style={{ display: 'none', position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 20, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', borderRadius: 8, padding: '8px 12px', boxShadow: '0 4px 14px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0', whiteSpace: 'nowrap', minWidth: 100 }} />
      
      <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(4px)', borderRadius: 20, padding: '4px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
        <span style={{ fontSize: 11, color: '#3b82f6' }}>✥</span>
        <span style={{ fontSize: 9, color: '#1e3a8a', fontWeight: 600, letterSpacing: '0.05em' }}>ARRASTRA Y GIRA RUEDA (ZOOM: {Math.round(zoom * 100)}%)</span>
      </div>

      <div style={{ position: 'absolute', bottom: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 6, zIndex: 10 }}>
        <button 
          onClick={handleZoomIn}
          style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(4px)', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: '700', color: '#1e3a8a', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', transition: 'all 0.2s', outline: 'none' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.borderColor = '#3b82f6'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.9)'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
        >
          +
        </button>
        <button 
          onClick={handleZoomOut}
          style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(4px)', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: '700', color: '#1e3a8a', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', transition: 'all 0.2s', outline: 'none' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.borderColor = '#3b82f6'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.9)'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
        >
          −
        </button>
        <button 
          onClick={handleZoomReset}
          style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(4px)', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: '800', color: '#64748b', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', transition: 'all 0.2s', outline: 'none' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#1e293b'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.9)'; e.currentTarget.style.color = '#64748b'; }}
        >
          RESET
        </button>
      </div>
    </div>
  );
}

const STATUS_CONF: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  pending:           { label: 'Stock Confirmado', color: '#047857', bg: '#ecfdf5', dot: '#10b981' },
  pending_stock:     { label: 'Stock Confirmado', color: '#047857', bg: '#ecfdf5', dot: '#10b981' },
  processing:        { label: 'Stock Confirmado', color: '#047857', bg: '#ecfdf5', dot: '#10b981' },
  paid:              { label: 'Stock confirmado', color: '#047857', bg: '#ecfdf5', dot: '#10b981' },
  payment_expired:   { label: 'Pago vencido',     color: '#be123c', bg: '#fff1f2', dot: '#e11d48' },
  payment_review:    { label: 'Revisando Pago',   color: '#1d4ed8', bg: '#eff6ff', dot: '#2563eb' },
  payment_confirmed: { label: 'Pago confirmado',  color: '#059669', bg: '#d1fae5', dot: '#34d399' },
  negotiation:       { label: 'Negociando',       color: '#be185d', bg: '#fdf2f8', dot: '#ec4899' },
  shipped:           { label: 'Embalado',         color: '#6d28d9', bg: '#f5f3ff', dot: '#8b5cf6' },
  delivered:         { label: 'Entregado agencia',color: '#0e7490', bg: '#ecfeff', dot: '#06b6d4' },
  cancelled:         { label: 'Cancelado',        color: '#b91c1c', bg: '#fef2f2', dot: '#ef4444' },
};

type DateRange = '7d' | '30d' | '90d' | 'all';
const RANGE_LABELS: Record<DateRange, string> = { '7d': '7d', '30d': '30d', '90d': '90d', 'all': 'Todo' };

// --- Shopify-like Live Globe Component ---
function AnimatedGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<{x: number, y: number, z: number}[]>([]);
  const zoomRef = useRef(1.25);
  const [liveVisitors, setLiveVisitors] = useState(1);
  // Puntos fijos en Chile (ciudades principales)
  const chilePings = useRef([
    { lat: -33.45, lon: -70.65 },  // Santiago
    { lat: -36.82, lon: -73.05 },  // Concepción
    { lat: -23.65, lon: -70.40 },  // Antofagasta
    { lat: -38.74, lon: -72.60 },  // Temuco
    { lat: -29.97, lon: -71.34 },  // La Serena
    { lat: -41.47, lon: -72.94 },  // Puerto Montt
    { lat: -33.05, lon: -71.61 },  // Valparaíso
    { lat: -20.21, lon: -70.15 },  // Iquique
  ]);
  
  // Rotation and Interaction State
  const rotationRef = useRef({ y: 0, x: 0 });
  const autoRotationEnabled = useRef(true); 
  const lastInteractTime = useRef(Date.now());

  // Presencia en tiempo real (tabs/ventanas activas)
  useEffect(() => {
    const storagePrefix = 'yaxsel-admin-live-presence';
    const instanceId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const storageKey = `${storagePrefix}:${instanceId}`;
    const ttlMs = 16000;
    const heartbeatMs = 5000;

    const computePresence = () => {
      const now = Date.now();
      let count = 0;

      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(`${storagePrefix}:`)) continue;

        const raw = localStorage.getItem(key);
        const ts = raw ? Number(raw) : 0;
        if (!ts || now - ts > ttlMs) {
          localStorage.removeItem(key);
          continue;
        }
        count++;
      }

      setLiveVisitors(Math.max(1, count));
    };

    const channel = typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel('yaxsel-admin-live-presence')
      : null;

    const heartbeat = () => {
      localStorage.setItem(storageKey, Date.now().toString());
      computePresence();
      channel?.postMessage('presence-update');
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key.startsWith(`${storagePrefix}:`)) computePresence();
    };

    const onChannelMessage = () => computePresence();

    window.addEventListener('storage', onStorage);
    channel?.addEventListener('message', onChannelMessage);

    heartbeat();
    const intervalId = window.setInterval(heartbeat, heartbeatMs);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('storage', onStorage);
      channel?.removeEventListener('message', onChannelMessage);
      localStorage.removeItem(storageKey);
      channel?.postMessage('presence-update');
      channel?.close();
    };
  }, []);

  // 1. Fetch geographic data
  useEffect(() => {
    fetch('https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json')
      .then(res => res.json())
      .then(data => {
        const pW = 512, pH = 256; 
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = pW; tmpCanvas.height = pH;
        const tctx = tmpCanvas.getContext('2d');
        if (!tctx) return;
        tctx.fillStyle = '#fff';
        // Filtrar islas pequeñas que aparecen como puntos sueltos en el océano
        const skipNames = [
          'Falkland Islands',
          'Falkland Is.',
          'Fr. S. Antarctic Lands',
          'Heard I. and McDonald Is.',
          'S. Geo. and S. Sandw. Is.',
          'Br. Indian Ocean Ter.',
        ];
        data.features.filter((f: any) => !skipNames.includes(f.properties?.name)).forEach((f: any) => {
          const geoms = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : (f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : []);
          geoms.forEach((poly: any) => {
            tctx.beginPath();
            poly[0].forEach((pt: [number, number], i: number) => {
               const x = (pt[0] + 180) / 360 * pW;
               const y = (90 - pt[1]) / 180 * pH;
               if (i === 0) tctx.moveTo(x, y); else tctx.lineTo(x, y);
            });
            tctx.fill();
          });
        });
        // Structured Hex-like grid
        const pixels = tctx.getImageData(0, 0, pW, pH).data;
        const pts: {x: number, y: number, z: number}[] = [];
        const latsCount = 85; 
        for (let i = 0; i <= latsCount; i++) {
            const lat = 90 - (i * 180 / latsCount);
            const ry = Math.sin(lat * Math.PI / 180);
            const ringRadius = Math.cos(lat * Math.PI / 180); 
            const lonsCount = Math.max(1, Math.floor(180 * ringRadius)); 
            for (let j = 0; j < lonsCount; j++) {
                 const lon = -180 + (j * 360 / lonsCount);
                 // Apply slight hex-offset for organic grid
                 const offsetLon = (i % 2 === 0) ? lon : lon + (180/lonsCount);
                 const px = Math.floor(((offsetLon + 180) % 360) / 360 * pW);
                 const py = Math.floor((90 - lat) / 180 * pH);
                 if (pixels[(py * pW + px) * 4 + 3] > 100) {
                     pts.push({ 
                         x: ringRadius * Math.cos(offsetLon * Math.PI / 180), 
                         y: ry, 
                         z: ringRadius * Math.sin(offsetLon * Math.PI / 180) 
                     });
                 }
            }
        }
        // Agregar punto de refuerzo directamente al array (evita spread cada frame)
        const patchLat = -43;
        const patchLon = -74;
        const patchPhi = (90 - patchLat) * (Math.PI / 180);
        const patchTheta = patchLon * (Math.PI / 180);
        pts.push({
          x: Math.sin(patchPhi) * Math.cos(patchTheta),
          y: Math.cos(patchPhi),
          z: Math.sin(patchPhi) * Math.sin(patchTheta),
        });
        pointsRef.current = pts;
      });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // UI high-res setup
    const dpr = window.devicePixelRatio || 1;
    const W = 500, H = 500; 
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = '100%'; 
    canvas.style.height = '100%';
    ctx.scale(dpr, dpr);

    const baseRadius = 185; 
    const cx = W / 2;
    const cy = H / 2;
    
    const mouse = { x: -1000, y: -1000 };

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = W / rect.width;
      const scaleY = H / rect.height;
      mouse.x = (e.clientX - rect.left) * scaleX;
      mouse.y = (e.clientY - rect.top) * scaleY;
    };
    
    window.addEventListener('mousemove', onMouseMove);

    const autoPhase = -3.8;
    let frame = 0;
    let animId: number;

    // Pre-compute hex vertex unit offsets
    const hexCos = new Float64Array(6);
    const hexSin = new Float64Array(6);
    for (let i = 0; i < 6; i++) {
      const ang = (i * Math.PI) / 3;
      hexCos[i] = Math.cos(ang);
      hexSin[i] = Math.sin(ang);
    }

    const drawHexOn = (c: CanvasRenderingContext2D, x: number, y: number, r: number) => {
      c.beginPath();
      c.moveTo(x + r * hexCos[0], y + r * hexSin[0]);
      c.lineTo(x + r * hexCos[1], y + r * hexSin[1]);
      c.lineTo(x + r * hexCos[2], y + r * hexSin[2]);
      c.lineTo(x + r * hexCos[3], y + r * hexSin[3]);
      c.lineTo(x + r * hexCos[4], y + r * hexSin[4]);
      c.lineTo(x + r * hexCos[5], y + r * hexSin[5]);
      c.closePath();
      c.fill();
    };

    // ── Offscreen canvas: pre-render static globe ONCE ──
    const offscreen = document.createElement('canvas');
    offscreen.width = W * dpr; offscreen.height = H * dpr;
    const oCtx = offscreen.getContext('2d')!;
    oCtx.scale(dpr, dpr);
    let offscreenReady = false;
    // Cached sorted dot positions for hover detection
    let cachedDots: {x: number, y: number, z: number, scale: number}[] = [];

    // Pre-compute ping spherical coords (they never change)
    const z = zoomRef.current;
    const radius = baseRadius * z;
    const R = radius * 0.98;
    const ry0 = rotationRef.current.y + autoPhase;
    const rx0 = rotationRef.current.x + 0.15;
    const cosRx = Math.cos(rx0), sinRx = Math.sin(rx0);
    const cosRy = Math.cos(ry0), sinRy = Math.sin(ry0);

    const pingPositions: {pX: number, pY: number}[] = [];
    const cPings = chilePings.current;
    for (let pi = 0; pi < cPings.length; pi++) {
      const b = cPings[pi];
      const phi = (90 - b.lat) * (Math.PI / 180);
      const theta = b.lon * (Math.PI / 180);
      const ppx = Math.sin(phi) * Math.cos(theta);
      const ppy = Math.cos(phi);
      const ppz = Math.sin(phi) * Math.sin(theta);
      const y1 = ppy * cosRx - ppz * sinRx;
      const z1 = ppy * sinRx + ppz * cosRx;
      const x2 = ppx * cosRy - z1 * sinRy;
      const z2 = ppx * sinRy + z1 * cosRy;
      if (z2 > 0) {
        pingPositions.push({ pX: cx - x2 * R + 120, pY: cy - y1 * R });
      }
    }

    function renderOffscreen() {
      if (offscreenReady) return;
      const pts = pointsRef.current;
      if (pts.length === 0) return;

      oCtx.clearRect(0, 0, W, H);

      // Globe background
      const grad = oCtx.createRadialGradient(cx - radius * 0.2, cy - radius * 0.2, 0, cx, cy, radius * 1.1);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.3, '#f8fafc');
      grad.addColorStop(1, '#e2e8f0');
      oCtx.beginPath();
      oCtx.arc(cx, cy, radius, 0, Math.PI * 2);
      oCtx.fillStyle = grad;
      oCtx.fill();

      // Project & sort dots
      const dots: {x: number, y: number, z: number, scale: number}[] = [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const y1 = p.y * cosRx - p.z * sinRx;
        const z1 = p.y * sinRx + p.z * cosRx;
        const x2 = p.x * cosRy - z1 * sinRy;
        const z2 = p.x * sinRy + z1 * cosRy;
        if (z2 > -0.1) {
          dots.push({ x: cx + x2 * R, y: cy - y1 * R, z: z2, scale: 0.4 + z2 * 0.6 });
        }
      }
      dots.sort((a, b) => a.z - b.z);
      cachedDots = dots;

      // Draw ALL dots with shadows (done only ONCE)
      oCtx.shadowBlur = 2 * z;
      oCtx.shadowColor = 'rgba(0,0,0,0.05)';
      oCtx.fillStyle = 'rgba(148, 163, 184, 0.4)';
      for (let i = 0; i < dots.length; i++) {
        const d = dots[i];
        drawHexOn(oCtx, d.x, d.y, 2.1 * d.scale * z);
      }
      oCtx.shadowBlur = 0;

      offscreenReady = true;
    }

    function draw() {
      frame++;
      // Try to build offscreen if not ready (waiting for geojson)
      renderOffscreen();

      ctx!.clearRect(0, 0, W, H);

      if (offscreenReady) {
        // 1 drawImage instead of ~3000 shadowed hex draws
        ctx!.setTransform(1, 0, 0, 1, 0, 0);
        ctx!.drawImage(offscreen, 0, 0);
        ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Hover effects (only draw the ~5 dots near mouse)
        const hoverDist = 20 * z;
        const hoverDist2 = hoverDist * hoverDist;
        for (let i = cachedDots.length - 1; i >= 0; i--) {
          const d = cachedDots[i];
          const dx = d.x - mouse.x;
          const dy = d.y - mouse.y;
          const dist2 = dx * dx + dy * dy;
          if (dist2 < hoverDist2) {
            const dist = Math.sqrt(dist2);
            const intensity = 1 - (dist / hoverDist);
            const lift = intensity * 0.14 * z;
            const hx = d.x + (d.x - cx) * lift;
            const hy = d.y + (d.y - cy) * lift;
            const hexR = 2.1 * d.scale * z + intensity * 1.4 * d.scale * z;
            ctx!.fillStyle = 'rgba(99, 102, 241, 1.0)';
            drawHexOn(ctx!, hx, hy, hexR);
          }
        }
      }

      // Pings azules (solo pulso animado, posiciones pre-calculadas)
      const activeCount = Math.max(1, liveVisitors);
      const pingR = 1.8 * z;
      const pingLw = 1.5 * z;
      ctx!.shadowBlur = 8 * z;
      ctx!.shadowColor = 'rgba(14, 165, 233, 0.4)';
      ctx!.fillStyle = '#0ea5e9';
      for (let pi = 0; pi < activeCount; pi++) {
        const pos = pingPositions[pi % pingPositions.length];
        if (!pos) continue;
        // Sensor pattern: linear 0→1 sawtooth, ring expands + fades, then snaps back
        const t = (frame * 0.007 + pi * 0.5) % 1;
        const eased = Math.pow(t, 0.55); // slight ease-out for natural ring expansion

        ctx!.beginPath();
        ctx!.arc(pos.pX, pos.pY, pingR, 0, Math.PI * 2);
        ctx!.fill();

        // Second smaller inner ring for depth
        ctx!.shadowBlur = 0;
        ctx!.beginPath();
        ctx!.strokeStyle = `rgba(14, 165, 233, ${(1 - eased) * 0.65})`;
        ctx!.lineWidth = pingLw * 1.2;
        ctx!.arc(pos.pX, pos.pY, eased * 18 * z, 0, Math.PI * 2);
        ctx!.stroke();
        // Thin outer trailing ring
        if (eased > 0.35) {
          const t2 = eased - 0.35;
          ctx!.beginPath();
          ctx!.strokeStyle = `rgba(14, 165, 233, ${(1 - eased) * 0.3})`;
          ctx!.lineWidth = 0.8 * z;
          ctx!.arc(pos.pX, pos.pY, t2 * 28 * z, 0, Math.PI * 2);
          ctx!.stroke();
        }
        ctx!.shadowBlur = 8 * z;
      }
      ctx!.shadowBlur = 0;

      animId = requestAnimationFrame(draw);
    }
    draw();
    return () => {
       cancelAnimationFrame(animId);
       window.removeEventListener('mousemove', onMouseMove);
    };
  }, [liveVisitors]);

  return (
    <div style={{ width: '100%', maxWidth: '100%', aspectRatio: '1/1', position: 'relative', overflow: 'visible', userSelect: 'none' }}>
      <canvas ref={canvasRef} style={{ display: 'block', touchAction: 'none', width: '100%', height: '100%' }} />
      <div style={{ pointerEvents: 'none', position: 'absolute', bottom: 12, right: 12, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(15,23,42,0.85)', padding: '4px 10px', borderRadius: 20, boxShadow: '0 2px 4px rgba(0,0,0,0.2)', zIndex: 10 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#0ea5e9', display: 'inline-block', boxShadow: '0 0 4px #0ea5e9', animation: 'db-fade-up 1s infinite alternate' }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: '#bae6fd' }}>{liveVisitors} visitante{liveVisitors === 1 ? '' : 's'} ahora</span>
      </div>
    </div>
  );
}

interface DashboardCacheData {
  openSupport: number;
  newUsers: number;
  allOrders: any[];
  totalProducts: number;
  lowStockCount: number;
  todayOrders: number;
  lowStockProducts: any[];
  topProducts: any[];
  pageViews: any;
  topViewedProducts: any[];
  lastRefresh: Date;
}

let dashboardCache: {
  timestamp: number;
  data: DashboardCacheData;
} | null = null;

export default function DashboardPage() {
  const { user } = useAuth();
  const liveDataVisible = useLiveDataVisibility();
  const [userPhotoUrl, setUserPhotoUrl] = useState('')
  useEffect(() => {
    if (!user?.email) return
    ;(async () => {
      try {
        const { getErpUserByEmail } = await import('@/lib/erpUserService')
        const info = await getErpUserByEmail(user.email!)
        if (info?.photoURL) setUserPhotoUrl(info.photoURL)
      } catch {}
    })()
  }, [user?.email])
  const [stats, setStats] = useState<DashboardStats>({ totalProducts: 0, totalOrders: 0, pendingOrders: 0, totalRevenue: 0, lowStockCount: 0, todayOrders: 0, avgTicket: 0, avgDailyRevenue: 0 });
  const [recentOrders, setRecentOrders]       = useState<Order[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);
  const [allOrders, setAllOrders]             = useState<Order[]>([]);
  const [rangeOrders, setRangeOrders]         = useState<Order[]>([]);
  const [topProducts, setTopProducts]         = useState<Product[]>([]);
  const [topViewedProducts, setTopViewedProducts] = useState<(Product & { viewCount: number })[]>([]);
  const [isLoading, setIsLoading]             = useState(true);
  const [isRealtimeActive, setIsRealtimeActive] = useState(false);
  const [error, setError]                     = useState('');
  const [lastRefresh, setLastRefresh]         = useState<Date>(new Date());
  const [dateRange, setDateRange]             = useState<DateRange>('30d');
  const [openSupport, setOpenSupport]         = useState(0);
  const [newUsers, setNewUsers]               = useState(0);
  const [prevRevenue, setPrevRevenue]         = useState(0);
  const [prevOrders, setPrevOrders]           = useState(0);
  const [pageViews, setPageViews]             = useState<{ totalViews: number; todayViews: number; topPages: { page: string; views: number }[]; topComunas: { comuna: string; count: number; lat: number; lng: number }[]; visitorMarkers: { comuna: string; region: string; lat: number; lng: number; count: number; users: string[] }[] }>({ totalViews: 0, todayViews: 0, topPages: [], topComunas: [], visitorMarkers: [] });
  const [isLoaded, setIsLoaded] = useState(false);

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  // 1. Auxiliary metrics (products, low stock, users, support, pageviews) with 5-minute TTL cache
  const loadData = useCallback(async (options?: { force?: boolean }) => {
    const force = options?.force ?? false;
    const DASH_SESSION_KEY = 'admin_dashboard_aux_cache_v1';

    if (!force && !dashboardCache && typeof window !== 'undefined') {
      try {
        const raw = sessionStorage.getItem(DASH_SESSION_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.data && Number(parsed.timestamp) > 0 && Date.now() - Number(parsed.timestamp) < 300_000) {
            dashboardCache = {
              timestamp: Number(parsed.timestamp),
              data: {
                ...parsed.data,
                lastRefresh: new Date(parsed.data.lastRefresh || parsed.timestamp),
              },
            };
          }
        }
      } catch {}
    }

    if (!force && dashboardCache && Date.now() - dashboardCache.timestamp < 300_000) {
      const cached = dashboardCache.data;
      setOpenSupport(cached.openSupport);
      setNewUsers(cached.newUsers);
      setStats(s => ({
        ...s,
        totalProducts: cached.totalProducts,
        lowStockCount: cached.lowStockCount,
      }));
      setLowStockProducts(cached.lowStockProducts);
      setTopProducts(cached.topProducts);
      setPageViews(cached.pageViews);
      setTopViewedProducts(cached.topViewedProducts);
      setLastRefresh(cached.lastRefresh);
      return;
    }

    try {
      const refreshDate = new Date();
      setLastRefresh(refreshDate);

      // Server-side counts (cost: 1 read per 1000 docs)
      let totalProducts = 0;
      try {
        const pSnap = await getCountFromServer(collection(db, PRODUCTS_COLLECTION_ID));
        totalProducts = pSnap.data().count;
      } catch (e) {
        console.warn('Error fetching total products count:', e);
      }

      let lowStockCount = 0;
      try {
        const lsSnap = await getCountFromServer(query(collection(db, PRODUCTS_COLLECTION_ID), where('STOCK', '<=', 5)));
        lowStockCount = lsSnap.data().count;
      } catch {}

      let userCount = 0;
      try {
        const uSnap = await getCountFromServer(collection(db, 'users'));
        userCount = uSnap.data().count;
      } catch {}

      let openSupportCount = 0;
      try {
        const sSnap = await getCountFromServer(query(collection(db, SUPPORT_TICKETS_COLLECTION_ID), where('status', '==', 'open')));
        openSupportCount = sSnap.data().count;
      } catch {}

      let pvData = { totalViews: 0, todayViews: 0, topPages: [], topComunas: [], visitorMarkers: [] };
      try {
        pvData = (await getPageViewStats(30)) as any;
      } catch {}

      setOpenSupport(openSupportCount);
      setNewUsers(userCount);
      setStats(s => ({
        ...s,
        totalProducts,
        lowStockCount,
      }));
      setPageViews(pvData);

      dashboardCache = {
        timestamp: Date.now(),
        data: {
          openSupport: openSupportCount,
          newUsers: userCount,
          allOrders: [],
          totalProducts,
          lowStockCount,
          todayOrders: 0,
          lowStockProducts: [],
          topProducts: [],
          pageViews: pvData,
          topViewedProducts: [],
          lastRefresh: refreshDate,
        }
      };
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(DASH_SESSION_KEY, JSON.stringify(dashboardCache));
        } catch {}
      }
    } catch (e) {
      console.error('Error loading dashboard auxiliary stats:', e);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 2. Real-time Firestore WebSocket for Orders (0 polling reads; 1 read per incoming/modified order)
  useEffect(() => {
    if (!liveDataVisible) {
      setIsRealtimeActive(false);
      return;
    }
    let isMounted = true;
    setIsLoading(true);

    const q = query(
      collection(db, ORDERS_COLLECTION_ID),
      orderBy('CREATEDAT', 'desc'),
      limit(150)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!isMounted) return;
      const list: Order[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        list.push({
          $id: docSnap.id,
          $createdAt: d.CREATEDAT ? new Date(d.CREATEDAT).toISOString() : (d.$createdAt || new Date().toISOString()),
          $updatedAt: d.UPDATEDAT ? new Date(d.UPDATEDAT).toISOString() : (d.$updatedAt || new Date().toISOString()),
          ...d,
        } as Order);
      });
      setAllOrders(list);
      setIsRealtimeActive(true);
      setIsLoading(false);
      setLastRefresh(new Date());
    }, (err) => {
      console.warn('[Admin Dashboard] onSnapshot fallback to getDocs:', err);
      if (!isMounted) return;
      setIsRealtimeActive(false);
      getDocs(q).then((snap) => {
        if (!isMounted) return;
        const list: Order[] = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          list.push({
            $id: docSnap.id,
            $createdAt: d.CREATEDAT ? new Date(d.CREATEDAT).toISOString() : (d.$createdAt || new Date().toISOString()),
            ...d,
          } as Order);
        });
        setAllOrders(list);
      }).catch((e) => {
        console.error('[Admin Dashboard] getDocs fallback error:', e);
        setError('Error al conectar con las órdenes');
      }).finally(() => {
        if (isMounted) setIsLoading(false);
      });
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [liveDataVisible]);

  // 3. Reactive in-memory computation of range stats, revenue and tickets
  useEffect(() => {
    if (allOrders.length === 0 && !isLoading) return;
    const now = Date.now();
    const days = dateRange === 'all' ? 0 : { '7d': 7, '30d': 30, '90d': 90 }[dateRange as '7d' | '30d' | '90d'];
    const cutoff     = dateRange === 'all' ? 0 : now - days * 86400000;
    const prevCutoff = dateRange === 'all' ? 0 : cutoff - days * 86400000;
    const rOrders  = dateRange === 'all' ? allOrders : allOrders.filter(o => {
      const ts = o.CREATEDAT || (o.$createdAt ? new Date(o.$createdAt).getTime() : 0);
      return ts >= cutoff;
    });
    const prevPeriod = dateRange === 'all' ? [] : allOrders.filter(o => {
      const ts = o.CREATEDAT || (o.$createdAt ? new Date(o.$createdAt).getTime() : 0);
      return ts >= prevCutoff && ts < cutoff;
    });
    let totalRevenue = 0, pendingOrders = 0, paidCount = 0;
    const paidStatuses = ['paid', 'payment_confirmed', 'negotiation', 'shipped', 'delivered'];
    for (const o of rOrders) {
      if (['paid', 'pending', 'pending_stock', 'processing', 'payment_expired'].includes(o.STATUS) && !o.PAYMENTPROOFURL) pendingOrders++;
      if (paidStatuses.includes(o.STATUS)) { totalRevenue += (o.TOTAL || 0); paidCount++; }
    }
    const avgTicket = paidCount > 0 ? Math.round(totalRevenue / paidCount) : 0;
    const effectiveDays = dateRange === 'all' ? 0 : Number({ '7d': 7, '30d': 30, '90d': 90 }[dateRange as '7d' | '30d' | '90d']);
    const avgDailyRevenue = effectiveDays > 0 ? Math.round(totalRevenue / effectiveDays) : 0;
    let pRev = 0;
    for (const o of prevPeriod) { if (paidStatuses.includes(o.STATUS)) pRev += (o.TOTAL || 0); }

    const todayOrdersCount = allOrders.filter(o => {
      const ts = o.CREATEDAT || (o.$createdAt ? new Date(o.$createdAt).getTime() : 0);
      return ts >= todayStart;
    }).length;

    setPrevRevenue(pRev);
    setPrevOrders(prevPeriod.length);
    setRangeOrders(rOrders);
    setStats(s => ({
      ...s,
      totalOrders: rOrders.length,
      pendingOrders,
      totalRevenue,
      avgTicket,
      avgDailyRevenue,
      todayOrders: todayOrdersCount,
    }));
    setRecentOrders(rOrders.slice(0, 8));
  }, [allOrders, dateRange, isLoading, todayStart]);
  const fmt = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

  /* ── CSS Dashboard Animations ── */
  useEffect(() => {
    if (typeof window === 'undefined' || isLoading) return;
    const t = setTimeout(() => setIsLoaded(true), 100);
    return () => clearTimeout(t);
  }, [isLoading]);

  const greeting = (() => { const h = new Date().getHours(); if (h < 12) return 'Buenos días'; if (h < 18) return 'Buenas tardes'; return 'Buenas noches'; })();
  const userName = user?.name?.split(' ')[0] || 'Admin';

  /* ─── Revenue chart buckets ─── */
  const chartBuckets = (() => {
    const days = 14;
    const result: { label: string; revenue: number; orders: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      const dayOrders = rangeOrders.filter(o => { const ts = o.CREATEDAT || new Date(o.$createdAt).getTime(); return ts >= d.getTime() && ts < next.getTime(); });
      const rev = dayOrders.filter(o => ['paid', 'payment_confirmed', 'negotiation', 'shipped', 'delivered'].includes(o.STATUS)).reduce((s, o) => s + o.TOTAL, 0);
      result.push({ label: d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }), revenue: rev, orders: dayOrders.length });
    }
    return result;
  })();

  /* ─── Sparkline data for KPI cards (7 points = last 7 days) ─── */
  const revenueSparkData = (() => {
    const pts: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      const rev = rangeOrders.filter(o => { const ts = o.CREATEDAT || 0; return ts >= d.getTime() && ts < next.getTime() && ['paid', 'payment_confirmed', 'negotiation', 'shipped', 'delivered'].includes(o.STATUS); }).reduce((s, o) => s + o.TOTAL, 0);
      pts.push(rev);
    }
    return pts;
  })();

  const ordersSparkData = (() => {
    const pts: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      pts.push(rangeOrders.filter(o => { const ts = o.CREATEDAT || 0; return ts >= d.getTime() && ts < next.getTime(); }).length);
    }
    return pts;
  })();

  /* ─── Order status donut segments ─── */
  const donutSegments = Object.entries(STATUS_CONF).map(([status, conf]) => ({
    value: rangeOrders.filter(o => o.STATUS === status).length,
    color: conf.dot, label: conf.label,
  })).filter(s => s.value > 0);

  const maxRevDay = Math.max(...chartBuckets.map(b => b.revenue), 1);

  /* ─── Dashboard status semaphore ─── */
  // todayStart declarado arriba con useMemo
  const todayRevenue = allOrders.filter(o => (o.CREATEDAT||0) >= todayStart && ['paid', 'payment_confirmed', 'negotiation', 'shipped', 'delivered'].includes(o.STATUS)).reduce((s,o) => s+o.TOTAL, 0);
  const topRegions = (() => {
    const map: Record<string, number> = {};
    for (const o of allOrders) { const r = (o.REGION || 'Sin región') as string; map[r] = (map[r]||0)+1; }
    return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,5);
  })();

  const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
  const stalePendingOrders = allOrders.filter(o =>
    (o.STATUS === 'pending' || o.STATUS === 'pending_stock') && (o.CREATEDAT || 0) > 0 && (o.CREATEDAT || 0) < threeHoursAgo
  ).length;
  const dashStatus: 'ok' | 'warning' | 'critical' =
    stalePendingOrders > 0 ? 'critical' :
    (stats.pendingOrders > 0 || stats.lowStockCount > 0 || openSupport > 0) ? 'warning' :
    'ok';
  const svgCol = {
    ok:       { bg: '#064e3b', border: '#059669', star: '#34d399', d1: '#10b981', d2: '#34d399' },
    warning:  { bg: '#451a03', border: '#d97706', star: '#fbbf24', d1: '#f59e0b', d2: '#fcd34d' },
    critical: { bg: '#450a0a', border: '#dc2626', star: '#f87171', d1: '#ef4444', d2: '#fca5a5' },
  }[dashStatus];

  return (
    <div style={{ width: '100%', background: '#ffffff' }}>
      <style>{`
        @keyframes db-fade-up { from{opacity:0;transform:translateY(12px);} to{opacity:1;transform:translateY(0);} }
        @keyframes db-header-drop { from{opacity:0;transform:translateY(-18px);} to{opacity:1;transform:translateY(0);} }
        @keyframes db-header-sub { from{opacity:0;transform:translateY(-8px);} to{opacity:1;transform:translateY(0);} }
        @keyframes db-panel-in { from{opacity:0;transform:translateY(20px) scale(0.985);} to{opacity:1;transform:translateY(0) scale(1);} }
        @keyframes db-icon-in { from{opacity:0;transform:scale(0.5) rotate(-20deg);} to{opacity:1;transform:scale(1) rotate(0deg);} }
        @keyframes db-icon-glow { 0%,100%{filter:drop-shadow(0 0 1px rgba(34,197,94,0.2));} 50%{filter:drop-shadow(0 0 3px rgba(34,197,94,0.35));} }
        @keyframes db-icon-pulse { 0%,100%{transform:scale(1);filter:drop-shadow(0 0 0 rgba(239,68,68,0));} 50%{transform:scale(1.06);filter:drop-shadow(0 0 5px rgba(239,68,68,0.4));} }
        @keyframes db-icon-warn { 0%,100%{filter:drop-shadow(0 0 1px rgba(245,158,11,0.15));} 50%{filter:drop-shadow(0 0 3px rgba(245,158,11,0.3));} }
        @keyframes db-dot-bounce { 0%,80%,100%{transform:translateY(0);opacity:0.4} 40%{transform:translateY(-4px);opacity:1} }
        @keyframes db-bubble-in { from{opacity:0;transform:translateX(-8px) scale(0.95);} to{opacity:1;transform:translateX(0) scale(1);} }
        .db-icon { animation: db-icon-in 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.1s both; }
        .db-icon-ok { animation: db-icon-in 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.1s both, db-icon-glow 2.5s ease-in-out infinite; }
        .db-icon-warning { animation: db-icon-in 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.1s both, db-icon-warn 2s ease-in-out infinite; }
        .db-icon-critical { animation: db-icon-in 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.1s both, db-icon-pulse 1.2s ease-in-out infinite; }
        .db-typing-dot { display:inline-block; width:5px; height:5px; border-radius:50%; background:#ef4444; animation:db-dot-bounce 1.2s ease-in-out infinite; }
        .db-typing-dot:nth-child(2){animation-delay:.2s} .db-typing-dot:nth-child(3){animation-delay:.4s}
        .db-alert-bubble { animation: db-bubble-in 0.4s cubic-bezier(0.16,1,0.3,1) 0.3s both; }
        .db-greeting { animation: db-header-drop 0.55s cubic-bezier(0.16,1,0.3,1) both; }
        .db-greeting-sub { animation: db-header-sub 0.55s cubic-bezier(0.16,1,0.3,1) 0.12s both; }
        .db-stats-panel { animation: db-panel-in 0.6s cubic-bezier(0.16,1,0.3,1) 0.18s both; }
        .db-card { animation: db-fade-up 0.4s cubic-bezier(0.16,1,0.3,1) both; }
        .db-card:nth-child(1){animation-delay:.04s} .db-card:nth-child(2){animation-delay:.08s}
        .db-card:nth-child(3){animation-delay:.12s} .db-card:nth-child(4){animation-delay:.16s}
        .db-card:nth-child(5){animation-delay:.20s} .db-card:nth-child(6){animation-delay:.24s}
        .db-row-link:hover { background:#f8fafc !important; }
        .db-range-btn { border:none; cursor:pointer; transition:all .15s; }
        .db-range-btn:hover { color:#111827 !important; font-weight: 600 !important; }
        .db-bar-col:hover .db-bar-tip { display:flex !important; }
        .db-kpi-grid > div { animation: db-fade-up 0.45s cubic-bezier(0.16,1,0.3,1) both; }
        .db-kpi-grid > div:nth-child(1){animation-delay:.05s} .db-kpi-grid > div:nth-child(2){animation-delay:.10s}
        .db-kpi-grid > div:nth-child(3){animation-delay:.15s} .db-kpi-grid > div:nth-child(4){animation-delay:.20s}
        .db-kpi-grid > div:nth-child(5){animation-delay:.25s} .db-kpi-grid > div:nth-child(6){animation-delay:.30s}
        @keyframes db-pulse { 0%, 100% { opacity: 0.3; transform: scale(0.9); } 50% { opacity: 1; transform: scale(1.1); } }
        @keyframes pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 0.35; } }
      `}</style>

      {/* ═══ Header ═══ */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Foto del usuario */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <img
              src={userPhotoUrl || 'https://storage.googleapis.com/asistoraerp.firebasestorage.app/logoasis.png'}
              alt={user?.name || 'Usuario'}
              style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', border: '2px solid #fff', boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }}
            />
            {/* Punto de estado */}
            <span style={{
              position: 'absolute', bottom: 1, right: 1,
              width: 12, height: 12, borderRadius: '50%',
              background: dashStatus === 'critical' ? '#ef4444' : dashStatus === 'warning' ? '#f59e0b' : '#22c55e',
              border: '2px solid #fff',
            }} />
          </div>
          {/* Texto del saludo */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#94a3b8', textTransform: 'capitalize' }}>{greeting}</span>
              {dashStatus === 'critical' && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 500, color: '#991b1b' }}>
                  <span style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <span className="db-typing-dot" />
                    <span className="db-typing-dot" />
                    <span className="db-typing-dot" />
                  </span>
                  {stalePendingOrders} sin procesar +3h
                </span>
              )}
              {dashStatus === 'warning' && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 500, color: '#92400e' }}>
                  ⚠ Revisar
                </span>
              )}
            </div>
            <h1 className="db-greeting" style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '2px 0 0', lineHeight: 1.2 }}>
              {user?.name || user?.email?.split('@')[0] || 'Usuario'}
            </h1>
            <p className="db-greeting-sub" style={{ fontSize: 12, color: '#94a3b8', margin: '3px 0 0' }}>
              {lastRefresh.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })} · {lastRefresh.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
        {/* Quick stats pills */}
        <div className="db-greeting-sub" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 500, color: '#64748b' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
            {stats.todayOrders} pedido{stats.todayOrders !== 1 ? 's' : ''} hoy
          </span>
          {stats.pendingOrders > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 500, color: '#64748b' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
              {stats.pendingOrders} pendiente{stats.pendingOrders !== 1 ? 's' : ''}
            </span>
          )}
          {stats.lowStockCount > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 500, color: '#64748b' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
              {stats.lowStockCount} stock bajo
            </span>
          )}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 500, color: '#64748b' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#6366f1', display: 'inline-block' }} />
            {stats.totalProducts} productos
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: isRealtimeActive ? '#ecfdf5' : '#f8fafc',
            border: `1px solid ${isRealtimeActive ? '#a7f3d0' : '#e2e8f0'}`,
            borderRadius: 20,
            padding: '5px 12px',
            fontSize: 12,
            fontWeight: 700,
            color: isRealtimeActive ? '#059669' : '#64748b'
          }}>
            <span style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: isRealtimeActive ? '#10b981' : '#94a3b8',
              boxShadow: isRealtimeActive ? '0 0 6px #10b981' : 'none',
              animation: isRealtimeActive ? 'db-pulse 2s infinite' : 'none',
            }} />
            {isRealtimeActive ? 'En vivo' : 'Offline'}
          </div>
          <div style={{ display: 'flex', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            {(Object.keys(RANGE_LABELS) as DateRange[]).map(r => (
              <button key={r} onClick={() => setDateRange(r)} className="db-range-btn" style={{
                padding: '7px 14px', fontSize: 13, fontWeight: dateRange === r ? 700 : 500,
                background: dateRange === r ? '#e2e8f0' : 'transparent',
                color: dateRange === r ? '#111827' : '#64748b',
              }}>{RANGE_LABELS[r]}</button>
            ))}
          </div>
          <button onClick={() => loadData({ force: true })} disabled={isLoading} style={{
            width: 38, height: 38, borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6b7280',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #7f1d1d', borderRadius: 12, marginBottom: 20, display: 'flex', gap: 8, fontSize: 14, color: '#7f1d1d' }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
        </div>
      )}

      {/* ═══ Panel Estadístico Empresarial ═══ */}
      <div className="db-card db-stats-panel" style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', marginBottom: 24 }}>
        {/* KPIs compactos en fila */}
        <div className="db-kpi-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${newUsers > 0 ? 7 : 6}, 1fr)`, gap: 0, marginBottom: 20, borderBottom: '1px solid #f1f5f9', paddingBottom: 20 }}>
          {[
            { label: 'Ingresos totales', value: fmt(stats.totalRevenue), icon: <DollarSign size={14} color="#4f46e5" />, color: '#4f46e5', bg: '#eef2ff', trend: dateRange !== 'all' && prevRevenue > 0 ? ((stats.totalRevenue - prevRevenue) / prevRevenue) * 100 : undefined },
            { label: 'Pedidos Hoy', value: String(stats.todayOrders), icon: <ShoppingCart size={14} color="#0891b2" />, color: '#0891b2', bg: '#ecfeff' },
            { label: 'Ticket promedio', value: fmt(stats.avgTicket), icon: <TrendingUp size={14} color="#b45309" />, color: '#b45309', bg: '#fffbeb' },
            { label: 'Productos', value: String(stats.totalProducts), icon: <Package size={14} color="#6d28d9" />, color: '#6d28d9', bg: '#f5f3ff' },
            { label: 'Visitas hoy', value: String(pageViews.todayViews), icon: <Eye size={14} color="#0f766e" />, color: '#0f766e', bg: '#f0fdf4' },
            { label: 'Visitas 30d', value: String(pageViews.totalViews), icon: <Globe size={14} color="#7c3aed" />, color: '#7c3aed', bg: '#f5f3ff' },
            ...(newUsers > 0 ? [{ label: 'Nuevos usuarios', value: String(newUsers), icon: <Users size={14} color="#db2777" />, color: '#db2777', bg: '#fdf2f8' }] : []),
          ].map((kpi, i, arr) => (
            <div key={i} className="db-kpi-item" style={{ textAlign: 'center', borderRight: i < arr.length - 1 ? '1px solid #e2e8f0' : 'none', padding: '0 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, marginBottom: 6 }}>
                <span style={{ width: 24, height: 24, borderRadius: 6, background: kpi.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{kpi.icon}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{kpi.label}</span>
              </div>
              <p className="db-kpi-value" style={{ fontSize: 22, fontWeight: 800, color: '#111827', margin: '0 0 2px', lineHeight: 1.1 }}>{kpi.value}</p>
              {kpi.trend !== undefined && (
                <span style={{ fontSize: 11, fontWeight: 700, color: kpi.trend >= 0 ? '#059669' : '#dc2626' }}>
                  {kpi.trend >= 0 ? '▲' : '▼'} {Math.abs(kpi.trend).toFixed(1)}%
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Gráfica de líneas/puntos empresarial */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#374151', margin: 0 }}>Rendimiento — últimos 14 días</h3>
          <div style={{ display: 'flex', gap: 16, fontSize: 11 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 3, borderRadius: 2, background: '#4f46e5', display: 'inline-block' }} /> Ingresos</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 3, borderRadius: 2, background: '#0891b2', display: 'inline-block' }} /> Pedidos</span>
          </div>
        </div>
        <svg viewBox="0 0 700 220" style={{ width: '100%', height: 220, overflow: 'visible' }}>
          {/* Grid horizontal */}
          {[0, 1, 2, 3, 4].map(i => {
            const y = 20 + i * 45;
            return <g key={`grid-${i}`}>
              <line x1="50" y1={y} x2="680" y2={y} stroke="#f1f5f9" strokeWidth="1" />
              <text x="44" y={y + 4} textAnchor="end" style={{ fontSize: 9, fill: '#94a3b8' }}>
                {maxRevDay > 0 ? (maxRevDay > 999 ? `$${Math.round((maxRevDay * (4 - i) / 4) / 1000)}k` : `$${Math.round(maxRevDay * (4 - i) / 4)}`) : '0'}
              </text>
            </g>;
          })}
          {/* Eje X - fechas */}
          {chartBuckets.map((b, i) => {
            const x = 50 + (i / 13) * 630;
            return <text key={`xl-${i}`} x={x} y={210} textAnchor="middle" style={{ fontSize: 8, fill: '#94a3b8' }}>{i % 2 === 0 ? b.label : ''}</text>;
          })}
          {/* Línea de ingresos (púrpura) con relleno */}
          {(() => {
            const maxR = Math.max(...chartBuckets.map(b => b.revenue), 1);
            const pts = chartBuckets.map((b, i) => ({
              x: 50 + (i / 13) * 630,
              y: 20 + (1 - b.revenue / maxR) * 180,
            }));
            const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
            const area = `${line} L${pts[pts.length - 1].x},200 L${pts[0].x},200 Z`;
            return <>
              <defs><linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4f46e5" stopOpacity="0.1" /><stop offset="100%" stopColor="#4f46e5" stopOpacity="0.01" /></linearGradient></defs>
              <path className="db-chart-area" d={area} fill="url(#revGrad)" />
              <path className="db-chart-line" d={line} fill="none" stroke="#4f46e5" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              {pts.map((p, i) => <circle className="db-chart-dot" key={`rd-${i}`} cx={p.x} cy={p.y} r={3.5} fill="#ffffff" stroke="#4f46e5" strokeWidth="2" />)}
            </>;
          })()}
          {/* Línea de pedidos (cyan) */}
          {(() => {
            const maxO = Math.max(...chartBuckets.map(b => b.orders), 1);
            const pts = chartBuckets.map((b, i) => ({
              x: 50 + (i / 13) * 630,
              y: 20 + (1 - b.orders / maxO) * 180,
            }));
            const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
            return <>
              <path className="db-chart-line" d={line} fill="none" stroke="#0891b2" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="6 3" />
              {pts.map((p, i) => <circle className="db-chart-dot" key={`od-${i}`} cx={p.x} cy={p.y} r={3} fill="#ffffff" stroke="#0891b2" strokeWidth="1.5" />)}
            </>;
          })()}
          {/* Eje Y derecho - escala de pedidos */}
          {[0, 1, 2, 3, 4].map(i => {
            const maxO = Math.max(...chartBuckets.map(b => b.orders), 1);
            const y = 20 + i * 45;
            return <text key={`yr-${i}`} x="690" y={y + 4} textAnchor="start" style={{ fontSize: 9, fill: '#0891b2' }}>
              {Math.round(maxO * (4 - i) / 4)}
            </text>;
          })}
        </svg>
      </div>

      {/* ═══ Alerts ═══ */}
      {!isLoading && (stats.pendingOrders > 0 || stats.lowStockCount > 0 || openSupport > 0) && (
        <div style={{ background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 14, padding: '14px 16px', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
            <AlertTriangle size={15} color="#d97706" />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>Requiere atención</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {stats.pendingOrders > 0 && (
              <Link href="/admin/orders?status=pending" style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 8, background: '#fff', border: '1px solid #d97706', textDecoration: 'none', fontSize: 13, color: '#92400e', fontWeight: 500, transition: 'all .15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#fffbeb'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>
                <Clock size={13} /> {stats.pendingOrders} pedido{stats.pendingOrders !== 1 ? 's' : ''} pendiente{stats.pendingOrders !== 1 ? 's' : ''}
              </Link>
            )}
            {stats.lowStockCount > 0 && (
              <Link href="/admin/inventory" style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 8, background: '#fff', border: '1px solid #f87171', textDecoration: 'none', fontSize: 13, color: '#991b1b', fontWeight: 500, transition: 'all .15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>
                <Package size={13} /> {stats.lowStockCount} producto{stats.lowStockCount !== 1 ? 's' : ''} stock bajo
              </Link>
            )}
            {openSupport > 0 && (
              <Link href="/admin/support" style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 8, background: '#fff', border: '1px solid #bfdbfe', textDecoration: 'none', fontSize: 13, color: '#2563eb', fontWeight: 500, transition: 'all .15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#eff6ff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>
                <Megaphone size={13} /> {openSupport} ticket{openSupport !== 1 ? 's' : ''} soporte
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ═══ Vista en tiempo real ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 24 }}>
        
        {/* Vista en Tiempo Real - Estadísticas */}
        <div className="db-card db-side-panel" style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: '#111827', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                 <Globe size={18} color="#0891b2" /> Vista en tiempo real
              </h2>
              <p style={{ fontSize: 11, color: '#0ea5e9', fontWeight: 600, margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                 <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#0ea5e9', display: 'inline-block', animation: 'db-pulse 2s infinite' }} /> Ahora mismo
              </p>
            </div>
            <div style={{ position: 'relative' }}>
               <input type="text" placeholder="Buscar ubicación" style={{ fontSize: 12, padding: '8px 12px 8px 32px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 20, width: 140, outline: 'none' }} />
               <Search size={13} color="#94a3b8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            </div>
          </div>
          
          {/* KPIs hoy */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <div style={{ background: '#f8fafc', borderRadius: 12, padding: '12px 14px' }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ingresos hoy</p>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#111827' }}>{fmt(todayRevenue)}</div>
              <p style={{ fontSize: 10, color: '#6b7280', margin: '2px 0 0' }}>pedidos pagados</p>
            </div>
            <div style={{ background: '#f8fafc', borderRadius: 12, padding: '12px 14px' }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pedidos hoy</p>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#111827' }}>{stats.todayOrders}</div>
              <p style={{ fontSize: 10, color: '#6b7280', margin: '2px 0 0' }}>en el rango activo</p>
            </div>
            <div style={{ background: '#fffbeb', borderRadius: 12, padding: '12px 14px' }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: '#92400e', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pendientes</p>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#b45309' }}>{stats.pendingOrders}</div>
              <p style={{ fontSize: 10, color: '#d97706', margin: '2px 0 0' }}>sin procesar</p>
            </div>
            <div style={{ background: '#fef2f2', borderRadius: 12, padding: '12px 14px' }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: '#991b1b', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Stock bajo</p>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#ef4444' }}>{stats.lowStockCount}</div>
              <p style={{ fontSize: 10, color: '#f87171', margin: '2px 0 0' }}>productos críticos</p>
            </div>
          </div>

          {/* Top páginas visitadas */}
          {pageViews.topPages.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ fontSize: 11, fontWeight: 700, color: '#374151', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Páginas más visitadas (30 días)</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {pageViews.topPages.slice(0, 5).map((tp, i) => {
                  const maxV = pageViews.topPages[0]?.views || 1;
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, color: '#6b7280', width: 120, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tp.page}</span>
                      <div style={{ flex: 1, height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(tp.views / maxV) * 100}%`, background: 'linear-gradient(90deg, #0d9488, #14b8a6)', borderRadius: 4, transition: 'width 0.5s' }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#0d9488', minWidth: 30, textAlign: 'right' }}>{tp.views}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top comunas visitadas */}
          {pageViews.topComunas.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ fontSize: 11, fontWeight: 700, color: '#374151', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>📍 Comunas de visitantes (30 días)</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pageViews.topComunas.slice(0, 8).map((tc, i) => {
                  const maxC = pageViews.topComunas[0]?.count || 1;
                  // Buscar usuarios registrados en esta comuna
                  const marker = pageViews.visitorMarkers.find(m => m.comuna === tc.comuna);
                  const users = marker?.users || [];
                  return (
                    <div key={i}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: '#6b7280', width: 100, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tc.comuna}</span>
                        <div style={{ flex: 1, height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${(tc.count / maxC) * 100}%`, background: 'linear-gradient(90deg, #e396bf, #f43f5e)', borderRadius: 4, transition: 'width 0.5s' }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#e396bf', minWidth: 20, textAlign: 'right' }}>{tc.count}</span>
                      </div>
                      {users.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3, paddingLeft: 108 }}>
                          {users.map((u, j) => (
                            <span key={j} style={{ fontSize: 10, fontWeight: 600, color: '#6366f1', background: 'rgba(99,102,241,0.08)', padding: '1px 6px', borderRadius: 4 }}>👤 {u}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top regiones */}
          {topRegions.length > 0 && (
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16, marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#334155', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <MapPin size={13} color="#64748b" /> Top regiones
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {topRegions.map(([region, count], i) => {
                  const pct = Math.round((count / allOrders.length) * 100);
                  return (
                    <div key={region} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', width: 14 }}>{i + 1}</span>
                      <span style={{ fontSize: 12, color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{region}</span>
                      <div style={{ width: 60, height: 4, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: '#6366f1', borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', width: 26, textAlign: 'right' }}>{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Últimos pedidos mini-lista */}
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#334155', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShoppingBag size={13} color="#64748b" /> Actividad reciente
            </p>
            {recentOrders.slice(0, 4).length === 0 ? (
              <p style={{ fontSize: 12, color: '#6b7280' }}>Sin pedidos recientes</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {recentOrders.slice(0, 4).map(o => {
                  const sc = STATUS_CONF[o.STATUS] || STATUS_CONF['pending'];
                  const ts = o.CREATEDAT ? new Date(o.CREATEDAT).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : '';
                  return (
                    <div key={o.$id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f8fafc' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: sc.dot, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', flex: 1 }}>{o.ORDERCODE || o.$id.slice(-6)}</span>
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>{o.REGION || '—'}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#111827' }}>{fmt(o.TOTAL)}</span>
                      <span style={{ fontSize: 10, color: '#6b7280' }}>{ts}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Globo 3D */}
        <div className="db-card db-side-panel" style={{ background: '#f8fafc', borderRadius: 16, border: '1px solid #e5e7eb', padding: 0, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 380, overflow: 'hidden' }}>
          <AnimatedGlobe />
          <div style={{ position: 'absolute', bottom: 16, right: 16, display: 'flex', gap: 8 }}>
             <span style={{ fontSize: 10, fontWeight: 700, color: '#475569', background: '#fff', padding: '4px 10px', borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                📍 Pedidos
             </span>
             <span style={{ fontSize: 10, fontWeight: 700, color: '#0ea5e9', background: '#fff', padding: '4px 10px', borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                🔵 Visitantes ahora
             </span>
          </div>
        </div>
      </div>

      {/* ═══ Revenue chart + Order status ═══ */}
      <div className="db-revenue-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, marginBottom: 24 }}>

        {/* Revenue area chart */}
        <div className="db-card" style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: 0 }}>Ingresos — últimos 14 días</h2>
              <p style={{ fontSize: 12, color: '#9ca3af', margin: '3px 0 0' }}>Solo pedidos pagados y entregados</p>
            </div>
            <Link href="/admin/analytics" style={{ fontSize: 12, fontWeight: 600, color: '#6366f1', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
              Ver analytics <ArrowRight size={13} />
            </Link>
          </div>

          {/* Y-axis labels */}
          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingBottom: 20, paddingTop: 4 }}>
              {[maxRevDay, Math.round(maxRevDay * 0.5), 0].map((v, i) => (
                <span key={i} style={{ fontSize: 10, color: '#d1d5db', textAlign: 'right', lineHeight: 1 }}>
                  {v > 999 ? `$${Math.round(v / 1000)}k` : `$${v}`}
                </span>
              ))}
            </div>
            <div style={{ flex: 1 }}>
              <AreaChart data={chartBuckets.map(b => b.revenue)} color="#6366f1" height={130} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                {chartBuckets.filter((_, i) => i === 0 || i === 6 || i === 13).map((b, i) => (
                  <span key={i} style={{ fontSize: 10, color: '#9ca3af' }}>{b.label}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Bar chart below (order volume) */}
          <div style={{ marginTop: 12, borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
            <p style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 8px' }}>Volumen de pedidos</p>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 40 }}>
              {chartBuckets.map((b, i) => {
                const maxOrd = Math.max(...chartBuckets.map(x => x.orders), 1);
                const pct = (b.orders / maxOrd) * 100;
                return (
                  <div key={i} className="db-bar-col" style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                    <div className="db-bar-tip" style={{
                      display: 'none', position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                      background: '#1f2937', color: '#fff', fontSize: 10, borderRadius: 6, padding: '3px 7px', whiteSpace: 'nowrap', zIndex: 10, marginBottom: 4,
                    }}>
                      {b.orders} ped · {b.label}
                    </div>
                    <div style={{
                      width: '100%', borderRadius: '3px 3px 0 0',
                      background: b.orders > 0 ? '#818cf8' : '#f3f4f6',
                      height: `${Math.max(pct, b.orders > 0 ? 8 : 3)}%`,
                      transition: 'height .4s cubic-bezier(0.16,1,0.3,1)',
                    }} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Order status donut */}
        <div className="db-card" style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: 0 }}>Estado pedidos</h2>
            <Link href="/admin/orders" style={{ fontSize: 12, color: '#6366f1', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 2 }}>
              Ver <ArrowRight size={12} />
            </Link>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <DonutChart segments={donutSegments} size={110} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Object.entries(STATUS_CONF).map(([status, conf]) => {
              const count = rangeOrders.filter(o => o.STATUS === status).length;
              const pct = rangeOrders.length > 0 ? Math.round((count / rangeOrders.length) * 100) : 0;
              return (
                <Link key={status} href={`/admin/orders?status=${status}`} style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', padding: '3px 0', borderRadius: 6, transition: 'background .1s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#f9fafb'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: conf.dot, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12, color: '#374151', fontWeight: 500 }}>{conf.label}</span>
                  <div style={{ height: 4, width: 60, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: conf.dot, borderRadius: 4, transition: 'width .5s' }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: conf.color, minWidth: 24, textAlign: 'right' }}>{count}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* ═══ Quick actions ═══ */}
      <div style={{ marginBottom: 8 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: '0 0 14px' }}>Acciones rápidas</h2>
        <div className="db-quick-actions" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          {[
            { label: 'Agregar producto', href: '/admin/products', color: '#6366f1', bg: '#eef2ff', icon: <Plus size={16} color="#6366f1" /> },
            { label: 'Ver pedidos', href: '/admin/orders', color: '#0891b2', bg: '#ecfeff', icon: <ShoppingCart size={16} color="#0891b2" /> },
            { label: 'Ver analytics', href: '/admin/analytics', color: '#059669', bg: '#ecfdf5', icon: <BarChart3 size={16} color="#059669" /> },
          ].map(a => (
            <Link key={a.href} href={a.href} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
              background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
              textDecoration: 'none', transition: 'all .15s', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = a.color; e.currentTarget.style.boxShadow = `0 4px 12px ${a.color}22`; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'none'; }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: a.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {a.icon}
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{a.label}</span>
              <ArrowRight size={14} color="#d1d5db" style={{ marginLeft: 'auto' }} />
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}
