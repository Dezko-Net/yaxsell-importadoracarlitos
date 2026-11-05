'use client';

import React from 'react';
import Lottie from 'lottie-react';

import loadingAnimation from '../../public/assets/loading.json';

export default function GlobalCatalogLoader() {
  return (
    <div 
      style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '60vh',
        width: '100%',
        background: '#fff',
        padding: '2rem'
      }}
    >
      <div style={{ width: '250px', height: '250px' }}>
        <Lottie 
          animationData={loadingAnimation} 
          loop={true} 
        />
      </div>
      <h2 
        style={{ 
          marginTop: '-20px', 
          fontSize: '20px', 
          fontWeight: 800, 
          color: '#111827',
          fontFamily: '"DM Sans", sans-serif',
          letterSpacing: '-0.02em',
          background: 'linear-gradient(135deg, #111827, #e396bf)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}
      >
        Preparando el catálogo...
      </h2>
      <p 
        style={{ 
          marginTop: '8px', 
          fontSize: '14px', 
          color: '#6b7280',
          fontWeight: 500,
          textAlign: 'center',
          maxWidth: '300px'
        }}
      >
        Descargando todos los productos para que tu experiencia sea ultrarrápida.
      </p>
    </div>
  );
}
