import React from 'react';

export interface AgencyInfo {
  name: string;
  color: string;
  bg: string;
  desc: string;
  badge: string;
  logoUrl?: string;
}

export const CATALOGO_AGENCIES: AgencyInfo[] = [
  { 
    name: 'STARKEN',        
    color: '#00843D', 
    bg: '#e6f4ea', 
    desc: 'Tarifa económica · Cobertura nacional a domicilio o sucursal',
    badge: 'Popular',
    logoUrl: 'https://www.starken.cl/static/media/logo-q100.bac31f50de7b41338e6c.webp'
  },
  { 
    name: 'BLUEXPRESS',     
    color: '#0057B8', 
    bg: '#e5effb', 
    desc: 'Tarifa media/baja · Envío rápido a domicilio o Puntos Blue',
    badge: 'Rápido',
    logoUrl: 'https://www.beetrack.com/hubfs/Logos%20Clientes/Logo%20BlueExpress.png'
  },
  { 
    name: 'CHILEXPRESS',    
    color: '#E4002B', 
    bg: '#fdeaee', 
    desc: 'Tarifa alta · Cobertura express y sucursales en todo el país',
    badge: 'Express',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Logo_Chilexpress.svg/320px-Logo_Chilexpress.svg.png'
  },
  { 
    name: 'VARMONTT',       
    color: '#c62828', 
    bg: '#fdeaea', 
    desc: 'Tarifa económica · Especialistas al Sur de Chile',
    badge: 'Zona Sur',
    logoUrl: 'https://varmontt.cl/wp-content/uploads/2020/03/logo_varmontt-trans.png'
  },
  { 
    name: 'PULLMAN CARGO',  
    color: '#00205B', 
    bg: '#e6ecf5', 
    desc: 'Tarifa económica · Especialistas en bultos pesados y cajas grandes',
    badge: 'Cajas Grandes',
    logoUrl: 'https://media.licdn.com/dms/image/v2/C4E0BAQFbzoEKacuZyg/company-logo_200_200/company-logo_200_200/0/1678472951084/pullman_go_logo?e=2147483647&v=beta&t=xjy_N8LPAe1f7lvBLKVLO7mdNzEZ3_Zv_IIZNj7zXnI'
  },
  { 
    name: 'CORREOS DE CHILE', 
    color: '#da291c', 
    bg: '#fdeaea', 
    desc: 'Tarifa económica · Cobertura histórica nacional y zonas rurales',
    badge: 'Cobertura Rural',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/CorreosChile_logo.svg/320px-CorreosChile_logo.svg.png'
  },
  { 
    name: 'RETIRO EN TIENDA', 
    color: '#7c3aed', 
    bg: '#f3effe', 
    desc: 'Retiro presencial en Chacabuco 08, Estación Central (Al lado de Carnicería El Carnicero)',
    badge: 'Gratis'
  },
];

/**
 * Marca visual (tipo "logo") de cada agencia. No usa las marcas registradas
 * reales como único soporte — es un emblema propio (glifo de envío + wordmark) en los colores
 * corporativos de cada courier, para que sea reconocible y a la vez seguro.
 */
export function AgencyLogo({ name, color, size = 26 }: { name: string; color: string; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none' as const, 'aria-hidden': true };

  const norm = (name || '').toUpperCase().trim();

  switch (norm) {
    case 'STARKEN':
      // Estrella (star-ken)
      return (
        <svg {...common}>
          <path d="M12 3l2.6 5.27 5.82.85-4.21 4.1.99 5.79L12 16.9l-5.2 2.73.99-5.79-4.21-4.1 5.82-.85L12 3z"
            fill={color} />
        </svg>
      );
    case 'PULLMAN CARGO':
    case 'PULLMAN':
      // Camión de carga
      return (
        <svg {...common}>
          <path d="M3 6h10v9H3z" fill={color} opacity="0.9" />
          <path d="M13 9h4l3 3v3h-7z" fill={color} opacity="0.6" />
          <circle cx="7" cy="17" r="2" fill={color} />
          <circle cx="17" cy="17" r="2" fill={color} />
        </svg>
      );
    case 'VARMONTT':
      // Flecha veloz hacia el sur
      return (
        <svg {...common}>
          <path d="M5 5h9l5 7-5 7H5l5-7-5-7z" fill={color} />
        </svg>
      );
    case 'BLUEXPRESS':
    case 'BLUE EXPRESS':
      // Rayo de rapidez
      return (
        <svg {...common}>
          <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" fill={color} />
        </svg>
      );
    case 'CHILEXPRESS':
      // Avión / envío exprés
      return (
        <svg {...common}>
          <path d="M21 4L3 11l6 2 2 6 3-4 5 5 2-16z" fill={color} />
        </svg>
      );
    case 'CORREOS DE CHILE':
    case 'CORREOS':
      // Sobre postal
      return (
        <svg {...common}>
          <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" fill={color} />
        </svg>
      );
    case 'RETIRO EN TIENDA':
      // Tienda física
      return (
        <svg {...common}>
          <path d="M4 4h16l1 5a3 3 0 01-6 0 3 3 0 01-6 0 3 3 0 01-6 0l1-5z" fill={color} opacity="0.75" />
          <path d="M5 11v9h5v-5h4v5h5v-9" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'CRUZ DEL SUR':
      // Cruz del sur (cruz de navegación)
      return (
        <svg {...common}>
          <path d="M12 2v20M2 12h20M7 7l10 10M17 7L7 17" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );
    case '5SUR':
    case '5 SUR':
      // Ruta 5 Sur
      return (
        <svg {...common}>
          <path d="M4 4h16v16H4z" fill={color} opacity="0.2" />
          <path d="M12 3v18M8 8l4-4 4 4M8 16l4 4 4-4" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'TRAMAR':
    case 'CACEM':
    case 'TVP':
    case 'JT TRANSPORTES':
    case 'CYC':
    case 'MENA':
      // Camión de encomiendas
      return (
        <svg {...common}>
          <path d="M1 3h14v11H1z" fill={color} opacity="0.85" />
          <path d="M15 7h4l3 3v4h-7z" fill={color} opacity="0.55" />
          <circle cx="5.5" cy="17.5" r="2.5" fill={color} />
          <circle cx="17.5" cy="17.5" r="2.5" fill={color} />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M3 7h13v7H3z" fill={color} />
          <circle cx="7" cy="16" r="1.8" fill={color} />
          <circle cx="15" cy="16" r="1.8" fill={color} />
        </svg>
      );
  }
}
