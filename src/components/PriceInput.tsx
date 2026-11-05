'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * Input de precio con formato CLP automático ($ y separadores de miles).
 * Muestra "$1.234" mientras se escribe, pero guarda el valor numérico puro.
 */
interface PriceInputProps {
  value: string | number;
  onChange: (numericValue: number) => void;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
}

function formatCLP(n: number): string {
  if (!n || n === 0) return '';
  return '$' + new Intl.NumberFormat('es-CL').format(n);
}

function parseNumber(s: string): number {
  // Quita todo lo que no sea dígito
  const digits = s.replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

export default function PriceInput({
  value,
  onChange,
  onFocus,
  placeholder = '$0',
  className = '',
  required = false,
}: PriceInputProps) {
  const numValue = typeof value === 'string' ? parseNumber(value) : (value || 0);
  const [display, setDisplay] = useState(numValue ? formatCLP(numValue) : '');
  const [isFocused, setIsFocused] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  // Sync externo (ej: al editar otro producto)
  useEffect(() => {
    if (!isFocused) {
      setDisplay(numValue ? formatCLP(numValue) : '');
    }
  }, [numValue, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const num = parseNumber(raw);
    setDisplay(num ? formatCLP(num) : '');
    onChange(num);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    if (Number(numValue) === 0) {
      setDisplay('');
    }
    onFocus?.(e);
  };

  const handleBlur = () => {
    setIsFocused(false);
    setDisplay(numValue ? formatCLP(numValue) : '');
  };

  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      value={display}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={className}
      required={required}
    />
  );
}
