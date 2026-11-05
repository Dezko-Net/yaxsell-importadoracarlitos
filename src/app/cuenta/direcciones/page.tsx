'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, MapPin, Plus, Trash2, Pencil, X, Loader2, Navigation, Search, Truck, Check } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useCuentaBg } from '../CuentaBgContext';
import { getServices, getFirebaseConfig, ADDRESSES_COLLECTION_ID } from '@/lib/db';
import { TPL1_ADDRESS_UPDATED } from '@/lib/addresses';
import { ID, Query } from '@/lib/db';
import CuentaPageShell from '@/components/cuenta/CuentaPageShell';

const FF = '"Proxima Nova",-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif';
const GMAPS_KEY = 'AIzaSyD7Kxz2ATHmOIlLlxIts5ONCZKg1N71QTk';
const DEFAULT_CENTER = { lat: -33.4489, lng: -70.6693 }; // Santiago

interface Address {
  id: string;
  alias: string;
  name: string;
  phone: string;
  fullAddress: string;
  commune: string;
  region: string;
  lat: number;
  lng: number;
}

interface Agency {
  name: string;
  address: string;
  lat?: number;
  lng?: number;
}

const ALIAS_OPTIONS = [
  { key: 'Casa',    icon: '🏠' },
  { key: 'Trabajo', icon: '💼' },
  { key: 'Otro',    icon: '📍' },
];

const EMPTY_FORM = { alias: 'Casa', name: '', phone: '', fullAddress: '', commune: '', region: '', lat: DEFAULT_CENTER.lat, lng: DEFAULT_CENTER.lng };

function loadAddressesLocal(userId: string): Address[] {
  try { return JSON.parse(localStorage.getItem(`addr_${userId}`) || '[]'); } catch { return []; }
}
function saveAddressesLocal(userId: string, list: Address[]) {
  localStorage.setItem(`addr_${userId}`, JSON.stringify(list));
}

async function loadAddressesDB(userId: string): Promise<Address[]> {
  try {
    const { databases } = getServices();
    const { databaseId } = getFirebaseConfig();
    const res = await databases.listDocuments(databaseId, ADDRESSES_COLLECTION_ID, [
      Query.equal('userId', userId),
      Query.limit(100),
    ]);
    return res.documents.map((doc: any) => ({
      id: doc.$id,
      alias: doc.alias || 'Otro',
      name: doc.name || '',
      phone: doc.phone || '',
      fullAddress: doc.address || '',
      commune: doc.city || '',
      region: doc.region || '',
      lat: doc.lat || DEFAULT_CENTER.lat,
      lng: doc.lng || DEFAULT_CENTER.lng,
    }));
  } catch { return []; }
}

async function saveAddressesDB(userId: string, list: Address[]) {
  try {
    const { databases } = getServices();
    const { databaseId } = getFirebaseConfig();
    // Get existing docs for this user
    const existing = await databases.listDocuments(databaseId, ADDRESSES_COLLECTION_ID, [
      Query.equal('userId', userId),
      Query.limit(100),
    ]);
    // Delete all existing
    for (const doc of existing.documents) {
      await databases.deleteDocument(databaseId, ADDRESSES_COLLECTION_ID, doc.$id);
    }
    // Create new ones
    for (const addr of list) {
      await databases.createDocument(databaseId, ADDRESSES_COLLECTION_ID, ID.unique(), {
        userId,
        alias: addr.alias,
        name: addr.name,
        phone: addr.phone,
        address: addr.fullAddress,
        city: addr.commune,
        region: addr.region,
        lat: addr.lat,
        lng: addr.lng,
      });
    }
  } catch (e) {
    console.error('Failed to save addresses to DB:', e);
  }
}
const AGENCY_SEARCH_TERMS = ['Starken', 'Pulman Cargo', 'Varmontt', 'Mena', 'Tramar', 'CGS', 'CYC', 'Villa Pratt', 'Chevalier', 'Blue Express', 'CACEM', 'Cinco Sur', 'Cruz del Sur', 'Correos de Chile'];

function loadAgencies(): Agency[] {
  try { return JSON.parse(localStorage.getItem('shippingAgencies') || '[]').filter((a: any) => a.active !== false); } catch { return []; }
}

async function searchNearbyAgencies(map: any, lat: number, lng: number): Promise<Agency[]> {
  const results: Agency[] = [];
  const seen = new Set<string>();
  const service = new window.google.maps.places.PlacesService(map);
  for (const term of AGENCY_SEARCH_TERMS) {
    try {
      const resp = await new Promise<any[]>((resolve, reject) => {
        service.nearbySearch(
          { location: { lat, lng }, radius: 10000, keyword: term },
          (res: any[], status: string) => {
            if (status === window.google.maps.places.PlacesServiceStatus.OK) resolve(res);
            else resolve([]);
          }
        );
      });
      for (const place of resp) {
        const name = place.name || term;
        const key = `${name}-${place.geometry?.location?.lat()}-${place.geometry?.location?.lng()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({
          name,
          address: place.vicinity || '',
          lat: place.geometry?.location?.lat(),
          lng: place.geometry?.location?.lng(),
        });
      }
    } catch {}
  }
  return results;
}

function streetViewUrl(lat: number, lng: number) {
  return `https://maps.googleapis.com/maps/api/streetview?size=400x180&location=${lat},${lng}&fov=90&heading=0&pitch=0&key=${GMAPS_KEY}`;
}

declare global {
  interface Window {
    google: any;
    initGMap: () => void;
  }
}

const BG_DIRECCIONES = 'https://img.freepik.com/fotos-premium/icono-3d-ubicacion-rosa-fondo-navegacion-mapa-ubicacion-posicion-simbolo-punto-pin-direccion-pastel-o-senal-ruta-marcador-puntero-destino-gps-descubrimiento-encontrar-destino-entrega-direccion-carretera_79161-2376.jpg';

export default function DireccionesPage() {
  const { user, isLoggedIn, isLoading: authLoading } = useAuth();
  useCuentaBg(BG_DIRECCIONES);
  const router = useRouter();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [showMap, setShowMap] = useState(false);
  const [editing, setEditing] = useState<Address | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [geocoding, setGeocoding] = useState(false);
  const [locating, setLocating] = useState(false);
  const [showAgencies, setShowAgencies] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [searchVal, setSearchVal] = useState('');
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const autocompleteRef = useRef<any>(null);
  const agencyMarkersRef = useRef<any[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // No forzar login - mostrar prompt si no está logueado

  useEffect(() => {
    if (user) {
      // Load from DB first, fallback to localStorage
      loadAddressesDB(user.id).then(dbAddrs => {
        if (dbAddrs.length > 0) {
          setAddresses(dbAddrs);
          saveAddressesLocal(user.id, dbAddrs);
        } else {
          // Migrate localStorage addresses to DB
          const localAddrs = loadAddressesLocal(user.id);
          if (localAddrs.length > 0) {
            setAddresses(localAddrs);
            saveAddressesDB(user.id, localAddrs);
          }
        }
      });
    }
  }, [user]);

  /* ── Load Google Maps API once ── */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.google?.maps) { setMapReady(true); return; }
    // Check if script already exists
    const existing = document.querySelector(`script[src*="maps.googleapis.com/maps/api/js"]`);
    if (existing) {
      // Script exists but API not loaded yet, wait for it
      const checkInterval = setInterval(() => {
        if (window.google?.maps) {
          setMapReady(true);
          clearInterval(checkInterval);
        }
      }, 100);
      // Fallback timeout
      setTimeout(() => { clearInterval(checkInterval); }, 10000);
      return () => clearInterval(checkInterval);
    }
    // Add script only if it doesn't exist
    window.initGMap = () => setMapReady(true);
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}&libraries=places&callback=initGMap`;
    s.async = true; s.defer = true;
    s.onerror = () => {
      console.error('Failed to load Google Maps API');
      // Retry once after 2 seconds
      setTimeout(() => {
        const s2 = document.createElement('script');
        s2.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}&libraries=places&callback=initGMap`;
        s2.async = true; s2.defer = true;
        document.head.appendChild(s2);
      }, 2000);
    };
    document.head.appendChild(s);
    return () => { delete (window as any).initGMap; };
  }, []);

  /* ── Init map when modal opens ── */
  useEffect(() => {
    if (!showMap || !mapReady || !mapRef.current) return;
    const center = { lat: form.lat || DEFAULT_CENTER.lat, lng: form.lng || DEFAULT_CENTER.lng };
    const map = new window.google.maps.Map(mapRef.current, {
      center, zoom: 15,
      disableDefaultUI: true,
      zoomControl: true,
      zoomControlOptions: { position: window.google.maps.ControlPosition.RIGHT_CENTER },
      styles: [{ featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] }],
    });
    mapInstanceRef.current = map;

    /* Center pin stays fixed — map moves under it (Uber-style) */
    map.addListener('dragend', () => {
      const c = map.getCenter();
      reverseGeocode(c.lat(), c.lng());
    });
    map.addListener('click', (e: any) => {
      map.panTo(e.latLng);
      reverseGeocode(e.latLng.lat(), e.latLng.lng());
    });

    /* Places Autocomplete */
    if (searchInputRef.current) {
      const ac = new window.google.maps.places.Autocomplete(searchInputRef.current, {
        componentRestrictions: { country: 'cl' },
        fields: ['geometry', 'formatted_address', 'address_components'],
      });
      autocompleteRef.current = ac;
      ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        if (!place.geometry?.location) return;
        map.panTo(place.geometry.location);
        map.setZoom(17);
        parseGeocoderResult(place, place.geometry.location.lat(), place.geometry.location.lng());
        setSearchVal('');
      });
    }

    /* Load initial reverse geocode */
    reverseGeocode(center.lat, center.lng);

    /* Auto-request GPS on mobile (like MercadoLibre) */
    const isMobileView = window.innerWidth < 768;
    if (isMobileView && !form.fullAddress && navigator.geolocation) {
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        pos => {
          const { latitude: lat, longitude: lng } = pos.coords;
          map.panTo({ lat, lng });
          map.setZoom(17);
          reverseGeocode(lat, lng);
          setLocating(false);
        },
        () => { setLocating(false); },
        { enableHighAccuracy: true, timeout: 15000 }
      );
    }
  }, [showMap, mapReady]);

  /* ── Reverse geocode ── */
  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    setGeocoding(true);
    setForm(f => ({ ...f, lat, lng }));
    try {
      const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=es&key=${GMAPS_KEY}`);
      const data = await res.json();
      if (data.results?.[0]) parseGeocoderResult(data.results[0], lat, lng);
    } catch { /* silently fail */ }
    finally { setGeocoding(false); }
  }, []);

  function parseGeocoderResult(result: any, lat: number, lng: number) {
    const comps = result.address_components || [];
    let street = '', number = '', commune = '', region = '', sublocality = '';
    
    console.log('🗺️ Geocoding result:', result);
    
    comps.forEach((c: any) => {
      const types = c.types || [];
      
      // Street name (route)
      if (types.includes('route') && !street) {
        street = c.long_name;
      }
      
      // Street number
      if (types.includes('street_number') && !number) {
        number = c.long_name;
      }
      
      // Sublocality (barrio/sector in Chile)
      if (types.includes('sublocality') && !sublocality) {
        sublocality = c.long_name;
      }
      
      // Commune - try multiple types in order of preference
      if (!commune) {
        if (types.includes('locality')) {
          commune = c.long_name;
        } else if (types.includes('administrative_area_level_3')) {
          commune = c.long_name;
        } else if (types.includes('administrative_area_level_2')) {
          // Sometimes commune is in level 2
          commune = c.long_name;
        }
      }
      
      // Region
      if (types.includes('administrative_area_level_1') && !region) {
        region = c.long_name;
      }
    });
    
    // Build full address with multiple fallback strategies
    let fullAddress = '';
    
    if (street && number) {
      // Best case: street + number
      fullAddress = `${street} ${number}`;
    } else if (street) {
      // Just street name
      fullAddress = street;
    } else if (sublocality) {
      // Use sublocality if no street
      fullAddress = sublocality;
    } else {
      // Last resort: extract first part of formatted_address
      const formatted = result.formatted_address || '';
      // Remove country and region from formatted address
      const parts = formatted.split(',').map((p: string) => p.trim());
      // Take first 1-2 parts (usually street or landmark)
      if (parts.length >= 2) {
        fullAddress = parts.slice(0, 2).join(', ');
      } else {
        fullAddress = parts[0] || formatted;
      }
    }
    
    console.log('📍 Parsed:', { fullAddress, commune, region, lat, lng });
    
    setForm(f => ({ ...f, fullAddress, commune, region, lat, lng }));
  }

  /* ── Geolocation ── */
  function getCurrentLocation() {
    if (!navigator.geolocation) return alert('Tu navegador no soporta geolocalización');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        mapInstanceRef.current?.panTo({ lat, lng });
        mapInstanceRef.current?.setZoom(17);
        reverseGeocode(lat, lng);
        setLocating(false);
      },
      err => { alert('No se pudo obtener tu ubicación: ' + err.message); setLocating(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  /* ── Agency markers ── */
  const [agencyLoading, setAgencyLoading] = useState(false);

  useEffect(() => {
    if (!showAgencies || !mapInstanceRef.current || !mapReady) return;
    const map = mapInstanceRef.current;
    const center = map.getCenter();
    if (!center) return;
    const lat = center.lat();
    const lng = center.lng();

    setAgencyLoading(true);
    agencyMarkersRef.current.forEach(m => m.setMap(null));
    agencyMarkersRef.current = [];

    searchNearbyAgencies(map, lat, lng).then(agencies => {
      agencies.forEach(ag => {
        if (!ag.lat || !ag.lng) return;
        const m = new window.google.maps.Marker({
          position: { lat: ag.lat, lng: ag.lng },
          map,
          title: ag.name,
          icon: { url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png' },
        });
        const iw = new window.google.maps.InfoWindow({ content: `<div style="font-family:sans-serif;font-size:13px;"><strong>${ag.name}</strong><br/>${ag.address}</div>` });
        m.addListener('click', () => iw.open(map, m));
        agencyMarkersRef.current.push(m);
      });
      setAgencyLoading(false);
    }).catch(() => setAgencyLoading(false));
  }, [showAgencies, mapReady]);

  useEffect(() => {
    if (!showAgencies) {
      agencyMarkersRef.current.forEach(m => m.setMap(null));
      agencyMarkersRef.current = [];
    }
  }, [showAgencies]);

  /* ── Save ── */
  function handleSave() {
    if (!form.fullAddress || !form.commune) return;
    const updated = editing
      ? addresses.map(a => a.id === editing.id ? { ...form, id: editing.id } : a)
      : [...addresses, { ...form, id: Date.now().toString() }];
    setAddresses(updated);
    saveAddressesLocal(user!.id, updated);
    saveAddressesDB(user!.id, updated);
    window.dispatchEvent(new CustomEvent(TPL1_ADDRESS_UPDATED));
    setShowMap(false);
    setEditing(null);
  }

  function handleDelete(id: string) {
    const updated = addresses.filter(a => a.id !== id);
    setAddresses(updated);
    saveAddressesLocal(user!.id, updated);
    saveAddressesDB(user!.id, updated);
    window.dispatchEvent(new CustomEvent(TPL1_ADDRESS_UPDATED));
  }

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setShowMap(true); }
  function openEdit(a: Address) {
    setEditing(a);
    setForm({ alias: a.alias, name: a.name, phone: a.phone, fullAddress: a.fullAddress, commune: a.commune, region: a.region, lat: a.lat, lng: a.lng });
    setShowMap(true);
  }

  if (authLoading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(180deg,#eff6ff 0%,#fff 280px)' }}>
      <Loader2 size={32} color="#3b82f6" style={{ animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const PINK = '#3b82f6';
  const PINK_LIGHT = '#eff6ff';
  const PINK_BG = '#dbeafe';
  const inp: React.CSSProperties = { width: '100%', padding: '12px 14px', border: '1.5px solid #dbeafe', borderRadius: 12, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#fff', fontFamily: FF, transition: 'border-color .2s, box-shadow .2s' };
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: '#9ca3af', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' };

  return (
    <>
    <CuentaPageShell
      title="Mis Ubicaciones"
      subtitle={`${addresses.length} dirección${addresses.length !== 1 ? 'es' : ''} guardada${addresses.length !== 1 ? 's' : ''}`}
      headerRight={
        <button onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', background: 'linear-gradient(135deg,#3b82f6,#2563eb)', color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 700, fontSize: 12, boxShadow: '0 4px 14px rgba(59,130,246,0.3)', flexShrink: 0 }}>
          <Plus size={14} /> Nueva
        </button>
      }
    >
      <div style={{ fontFamily: FF }}>
        {addresses.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 80, background: '#fff', borderRadius: 20, border: '1px solid #dbeafe', padding: '60px 20px' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: PINK_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <MapPin size={32} color={PINK} />
            </div>
            <p style={{ color: '#111827', fontSize: 17, fontWeight: 800, margin: '0 0 6px' }}>Sin ubicaciones guardadas</p>
            <p style={{ color: '#6b7280', fontSize: 13, margin: '0 0 20px' }}>Agregá una dirección para agilizar tus compras</p>
            <button onClick={openNew} style={{ padding: '12px 28px', background: 'linear-gradient(135deg,#3b82f6,#2563eb)', color: '#fff', borderRadius: 999, border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer', boxShadow: '0 6px 20px rgba(59,130,246,0.25)' }}>
              Agregar dirección
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {addresses.map((a, i) => (
              <div key={a.id} style={{ background: '#fff', borderRadius: 18, overflow: 'hidden', border: '1px solid #dbeafe', boxShadow: '0 2px 8px rgba(59,130,246,0.06)', transition: 'all .25s cubic-bezier(.16,1,.3,1)' }}>
                {/* Street View thumbnail */}
                {a.lat && a.lng && (
                  <div style={{ position: 'relative', height: 140, background: PINK_LIGHT }}>
                    <img src={streetViewUrl(a.lat, a.lng)} alt="street view"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 60%, rgba(255,255,255,0.8) 100%)' }} />
                    {i === 0 && <span style={{ position: 'absolute', top: 10, left: 10, background: 'linear-gradient(135deg,#3b82f6,#2563eb)', color: '#fff', fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 999, boxShadow: '0 2px 8px rgba(59,130,246,0.3)' }}>Principal</span>}
                  </div>
                )}
                <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: PINK_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 20 }}>
                    {ALIAS_OPTIONS.find(o => o.key === a.alias)?.icon || '📍'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{a.alias}</span>
                      {a.name && <span style={{ fontSize: 13, color: '#9ca3af' }}>— {a.name}</span>}
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{a.fullAddress}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9ca3af' }}>{a.commune}{a.region ? ', ' + a.region : ''}</p>
                    {a.phone && <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9ca3af' }}>{a.phone}</p>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => openEdit(a)} style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid #dbeafe', background: PINK_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all .2s' }}>
                      <Pencil size={14} color={PINK} />
                    </button>
                    <button onClick={() => handleDelete(a.id)} style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid #fee2e2', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all .2s' }}>
                      <Trash2 size={14} color="#ef4444" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </CuentaPageShell>

      {/* ─ Map Modal — RESPONSIVE (mobile full-screen / desktop centered) ─ */}
      {showMap && (
        <div className="map-modal-overlay">
          <div className="map-modal-container">
            
            {/* DESKTOP: Side panel (left) */}
            <div className="map-side-panel">
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#111827' }}>{editing ? 'Editar ubicación' : 'Nueva ubicación'}</h2>
                <button onClick={() => { setShowMap(false); setEditing(null); }}
                  style={{ width: 36, height: 36, borderRadius: 10, background: PINK_LIGHT, border: '1px solid #dbeafe', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .2s' }}>
                  <X size={18} color={PINK} />
                </button>
              </div>

              <div style={{ padding: '20px 24px', flex: 1, overflowY: 'auto' }}>
                {/* Address display */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ ...lbl, marginBottom: 8 }}>Dirección detectada</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: PINK_LIGHT, borderRadius: 12, minHeight: 48, border: '1px solid #dbeafe' }}>
                    {geocoding
                      ? <><Loader2 size={16} color={PINK} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} /><span style={{ fontSize: 13, color: '#9ca3af' }}>Obteniendo dirección...</span></>
                      : <><MapPin size={16} color={PINK} style={{ flexShrink: 0 }} /><span style={{ fontSize: 13, color: '#111827', fontWeight: 600, lineHeight: 1.4 }}>{form.fullAddress || 'Mueve el mapa para seleccionar'}{form.commune ? `, ${form.commune}` : ''}{form.region ? `, ${form.region}` : ''}</span></>
                    }
                  </div>
                </div>

                {/* Alias selector */}
                <div style={{ marginBottom: 16 }}>
                  <label style={lbl}>Tipo de dirección</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {ALIAS_OPTIONS.map(o => (
                      <button key={o.key} onClick={() => setForm(f => ({ ...f, alias: o.key }))}
                        style={{ flex: 1, padding: '10px 8px', border: `1.5px solid ${form.alias === o.key ? PINK : '#dbeafe'}`, borderRadius: 12, background: form.alias === o.key ? PINK_LIGHT : '#fff', color: form.alias === o.key ? PINK : '#6b7280', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, transition: 'all .2s' }}>
                        <span style={{ fontSize: 20 }}>{o.icon}</span>
                        <span>{o.key}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <button onClick={handleSave} disabled={!form.fullAddress || geocoding}
                  style={{ width: '100%', padding: '14px 0', background: !form.fullAddress || geocoding ? '#dbeafe' : 'linear-gradient(135deg,#3b82f6,#2563eb)', color: !form.fullAddress || geocoding ? '#60a5fa' : '#fff', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: !form.fullAddress || geocoding ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: !form.fullAddress || geocoding ? 'none' : '0 6px 20px rgba(59,130,246,0.25)', transition: 'all .2s' }}>
                  <Check size={18} /> {editing ? 'Guardar cambios' : 'Confirmar ubicación'}
                </button>
              </div>
            </div>

            {/* Map area (right on desktop, full on mobile) */}
            <div className="map-area">
              {/* Map toolbar (mobile only) */}
              <div className="map-toolbar-mobile">
                <button onClick={() => { setShowMap(false); setEditing(null); }}
                  style={{ width: 40, height: 40, borderRadius: 12, background: PINK_LIGHT, border: '1px solid #dbeafe', boxShadow: '0 2px 8px rgba(59,130,246,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={20} color={PINK} />
                </button>

                <div style={{ flex: 1, position: 'relative' }}>
                  <Search size={15} color="#aaa" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', zIndex: 1 }} />
                  <input ref={searchInputRef} value={searchVal} onChange={e => setSearchVal(e.target.value)}
                    placeholder="Buscar dirección..."
                    style={{ width: '100%', padding: '10px 12px 10px 34px', borderRadius: 10, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,.2)', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: FF }} />
                </div>

                <button onClick={() => setShowAgencies(v => !v)}
                  style={{ height: 40, padding: '0 14px', borderRadius: 12, background: showAgencies ? PINK : '#fff', border: showAgencies ? 'none' : '1px solid #dbeafe', boxShadow: '0 2px 8px rgba(59,130,246,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 700, fontSize: 13, color: showAgencies ? '#fff' : PINK, whiteSpace: 'nowrap' }}>
                  {agencyLoading ? <Loader2 size={15} color={showAgencies ? '#fff' : PINK} style={{ animation: 'spin 1s linear infinite' }} /> : <Truck size={15} color={showAgencies ? '#fff' : PINK} />} {agencyLoading ? '...' : 'Agencias'}
                </button>
              </div>

              {/* Desktop toolbar */}
              <div className="map-toolbar-desktop">
                <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
                  <Search size={16} color="#aaa" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', zIndex: 1 }} />
                  <input ref={searchInputRef} value={searchVal} onChange={e => setSearchVal(e.target.value)}
                    placeholder="Buscar dirección en el mapa..."
                    style={{ width: '100%', padding: '12px 14px 12px 40px', borderRadius: 12, border: '1.5px solid #dbeafe', boxShadow: '0 2px 6px rgba(59,130,246,0.06)', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: FF, background: '#fff' }} />
                </div>

                <button onClick={() => setShowAgencies(v => !v)}
                  style={{ height: 44, padding: '0 18px', borderRadius: 12, background: showAgencies ? PINK : '#fff', border: showAgencies ? 'none' : '1.5px solid #dbeafe', boxShadow: '0 2px 6px rgba(59,130,246,0.06)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 14, color: showAgencies ? '#fff' : PINK }}>
                  {agencyLoading ? <Loader2 size={16} color={showAgencies ? '#fff' : PINK} style={{ animation: 'spin 1s linear infinite' }} /> : <Truck size={16} color={showAgencies ? '#fff' : PINK} />} {agencyLoading ? 'Buscando...' : 'Agencias cercanas'}
                </button>

                <button onClick={getCurrentLocation} disabled={locating}
                  style={{ height: 44, padding: '0 18px', borderRadius: 12, background: '#fff', border: '1.5px solid #dbeafe', boxShadow: '0 2px 6px rgba(59,130,246,0.06)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 14, color: PINK }}>
                  {locating ? <Loader2 size={16} color={PINK} style={{ animation: 'spin 1s linear infinite' }} /> : <Navigation size={16} color={PINK} />}
                  Mi ubicación
                </button>
              </div>

              {/* Map container */}
              <div ref={mapRef} style={{ flex: 1, width: '100%', minHeight: 300, height: '100%' }} />

              {/* Center pin */}
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -100%)', zIndex: 15, pointerEvents: 'none' }}>
                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ width: 40, height: 40, background: PINK, borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)', boxShadow: '0 4px 12px rgba(59,130,246,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <MapPin size={20} color="#fff" style={{ transform: 'rotate(45deg)' }} />
                  </div>
                  <div style={{ width: 10, height: 10, background: 'rgba(59,130,246,.25)', borderRadius: '50%', marginTop: 3 }} />
                </div>
              </div>

              {/* Mi ubicación button (mobile only) */}
              <button onClick={getCurrentLocation} disabled={locating} className="map-locate-btn-mobile"
                style={{ position: 'absolute', right: 12, bottom: 260, zIndex: 20, width: 48, height: 48, borderRadius: 12, background: '#fff', border: 'none', boxShadow: '0 3px 10px rgba(0,0,0,.2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {locating ? <Loader2 size={22} color={PINK} style={{ animation: 'spin 1s linear infinite' }} /> : <Navigation size={22} color={PINK} />}
              </button>

              {/* Bottom panel (mobile only) */}
              <div className="map-bottom-panel-mobile">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, minHeight: 42 }}>
                  {geocoding
                    ? <><Loader2 size={16} color={PINK} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} /><span style={{ fontSize: 13, color: '#9ca3af' }}>Obteniendo dirección...</span></>
                    : <><MapPin size={16} color={PINK} style={{ flexShrink: 0 }} /><span style={{ fontSize: 14, color: '#111827', fontWeight: 600, lineHeight: 1.3 }}>{form.fullAddress || 'Mueve el mapa'}{form.commune ? `, ${form.commune}` : ''}</span></>
                  }
                </div>

                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  {ALIAS_OPTIONS.map(o => (
                    <button key={o.key} onClick={() => setForm(f => ({ ...f, alias: o.key }))}
                      style={{ flex: 1, padding: '8px 4px', border: `1.5px solid ${form.alias === o.key ? PINK : '#dbeafe'}`, borderRadius: 10, background: form.alias === o.key ? PINK_LIGHT : '#fff', color: form.alias === o.key ? PINK : '#6b7280', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                      {o.icon} {o.key}
                    </button>
                  ))}
                </div>

                <button onClick={handleSave} disabled={!form.fullAddress || geocoding}
                  style={{ width: '100%', padding: '13px 0', background: !form.fullAddress || geocoding ? '#dbeafe' : 'linear-gradient(135deg,#3b82f6,#2563eb)', color: !form.fullAddress || geocoding ? '#60a5fa' : '#fff', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: !form.fullAddress || geocoding ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: !form.fullAddress || geocoding ? 'none' : '0 6px 20px rgba(59,130,246,0.25)' }}>
                  <Check size={18} /> {editing ? 'Guardar cambios' : 'Confirmar ubicación'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes bgFloat { 0%,100%{transform:scale(1.1) translate(0,0)} 25%{transform:scale(1.15) translate(1%,-1%)} 50%{transform:scale(1.1) translate(-1%,1%)} 75%{transform:scale(1.15) translate(1%,1%)} }
        @keyframes spin { to { transform: rotate(360deg) } }
        
        /* Google Places Autocomplete */
        .pac-container { z-index: 2000 !important; font-family: ${FF}; border-radius: 12px; border: none; box-shadow: 0 4px 16px rgba(59,130,246,.15); }
        .pac-item { padding: 8px 14px; font-size: 13px; cursor: pointer; }
        .pac-item:hover { background: #eff6ff; }

        /* ═══ MOBILE FIRST (default) ═══ */
        .map-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          background: #fff;
        }

        .map-modal-container {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        /* Side panel HIDDEN on mobile */
        .map-side-panel {
          display: none;
        }

        /* Map area takes full screen on mobile */
        .map-area {
          flex: 1;
          position: relative;
          display: flex;
          flex-direction: column;
        }

        /* Mobile toolbar visible */
        .map-toolbar-mobile {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          z-index: 20;
          padding: 10px 12px;
          display: flex;
          gap: 8px;
        }

        /* Desktop toolbar hidden on mobile */
        .map-toolbar-desktop {
          display: none;
        }

        /* Mobile locate button visible */
        .map-locate-btn-mobile {
          display: flex !important;
        }

        /* Mobile bottom panel visible */
        .map-bottom-panel-mobile {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 20;
          background: #fff;
          border-radius: 20px 20px 0 0;
          box-shadow: 0 -4px 20px rgba(0,0,0,.15);
          padding: 16px 16px 24px;
          max-height: 50vh;
          overflow-y: auto;
        }

        /* ═══ DESKTOP (768px+) ═══ */
        @media (min-width: 768px) {
          .map-modal-overlay {
            background: #fff;
          }

          .map-modal-container {
            width: 100%;
            height: 100%;
            flex-direction: row;
          }

          /* Side panel VISIBLE on desktop (left side) */
          .map-side-panel {
            display: flex;
            flex-direction: column;
            width: 400px;
            background: #fff;
            border-right: 1px solid #dbeafe;
            flex-shrink: 0;
          }

          /* Map area takes remaining space */
          .map-area {
            flex: 1;
          }

          /* Mobile toolbar HIDDEN on desktop */
          .map-toolbar-mobile {
            display: none;
          }

          /* Desktop toolbar VISIBLE */
          .map-toolbar-desktop {
            display: flex;
            gap: 12px;
            padding: 16px 20px;
            background: #fff;
            border-bottom: 1px solid #f0f0f0;
            align-items: center;
          }

          /* Mobile locate button HIDDEN on desktop */
          .map-locate-btn-mobile {
            display: none !important;
          }

          /* Bottom panel HIDDEN on desktop */
          .map-bottom-panel-mobile {
            display: none;
          }
        }

        /* ═══ LARGE DESKTOP (1024px+) ═══ */
        @media (min-width: 1024px) {
          .map-side-panel {
            width: 450px;
          }
        }
      `}</style>
    </>
  );
}
