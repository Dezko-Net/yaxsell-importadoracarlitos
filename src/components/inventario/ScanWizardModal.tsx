'use client';

import { Package, Camera, CheckCircle2, ChevronDown, X } from 'lucide-react';
import { Product } from '@/types/admin';

export type ScanWizardStep = 'confirm' | 'packages' | 'gondola';

export interface ScanWizardState {
  product: Product;
  scannedCode: string;
  step: ScanWizardStep;
  packages: string;
  packQtyInput?: string;
  section: number | null;
  isAddStock?: boolean;
}

interface ScanWizardModalProps {
  wizard: ScanWizardState;
  sectionProductCounts: Record<number, number>;
  lastPlacedSection: number | null;
  saving: boolean;
  onClose: () => void;
  onConfirmProduct: () => void;
  onConfirmPackages: () => void;
  onFinish: () => void;
  onPreviewImage: (url: string) => void;
  onUpdate: (updater: (w: ScanWizardState) => ScanWizardState) => void;
  getSku: (p: Product) => string;
}

export default function ScanWizardModal({
  wizard,
  sectionProductCounts,
  lastPlacedSection,
  saving,
  onClose,
  onConfirmProduct,
  onConfirmPackages,
  onFinish,
  onPreviewImage,
  onUpdate,
  getSku,
}: ScanWizardModalProps) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/80 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden max-h-[95dvh] flex flex-col">
        <div className="shrink-0 px-5 py-3 flex items-center justify-between gap-2 border-b border-gray-100">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500">
            <span className={wizard.step === 'confirm' ? 'text-pink-600' : ''}>1. Producto</span>
            <ChevronDown className="w-3 h-3 -rotate-90 text-gray-300" />
            <span className={wizard.step === 'packages' ? 'text-pink-600' : ''}>2. Paquetes</span>
            <ChevronDown className="w-3 h-3 -rotate-90 text-gray-300" />
            <span className={wizard.step === 'gondola' ? 'text-pink-600' : ''}>3. Góndola</span>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        {wizard.step === 'confirm' && (
          <>
            <div className="bg-gradient-to-r from-pink-400 to-pink-500 text-white px-6 py-4 shrink-0">
              <h3 className="text-xl font-bold">¿Es este el producto?</h3>
              <p className="text-xs text-white/80 mt-1">Revisa la imagen antes de continuar</p>
            </div>
            <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center gap-4">
              {wizard.product.IMAGEURL ? (
                <img
                  src={wizard.product.IMAGEURL}
                  alt=""
                  className="w-56 h-56 sm:w-64 sm:h-64 object-cover rounded-2xl shadow-xl cursor-pointer"
                  onClick={() => onPreviewImage(wizard.product.IMAGEURL!)}
                />
              ) : (
                <div className="w-56 h-56 sm:w-64 sm:h-64 rounded-2xl bg-gray-100 flex items-center justify-center">
                  <Package className="w-20 h-20 text-gray-300" />
                </div>
              )}
              <div className="text-center w-full">
                <div className="font-bold text-gray-900 text-lg leading-snug">{wizard.product.NAME}</div>
                <div className="text-sm font-mono text-gray-500 mt-2">SKU: {getSku(wizard.product)}</div>
                {(wizard.product.STOCK || 0) > 0 && (
                  <div className="text-sm text-emerald-600 font-semibold mt-1">
                    Stock actual: {wizard.product.STOCK} uds
                  </div>
                )}
                <div className="text-xs font-mono text-rose-700 mt-3 bg-rose-50 px-4 py-2 rounded-xl inline-block border border-rose-100">
                  Código: {wizard.scannedCode}
                </div>
              </div>
            </div>
            <div className="shrink-0 flex border-t border-gray-100 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-4 text-gray-600 hover:bg-gray-50 font-semibold text-base transition"
              >
                No, otro producto
              </button>
              <button
                type="button"
                onClick={onConfirmProduct}
                disabled={saving}
                className="flex-1 px-4 py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-bold text-base transition flex items-center justify-center gap-2"
              >
                {saving ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : null}
                Sí, continuar
              </button>
            </div>
          </>
        )}

        {wizard.step === 'packages' && (
          <>
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-6 py-4 shrink-0">
              <h3 className="text-xl font-bold">Cantidad de paquetes</h3>
              <p className="text-xs text-white/80 mt-1">{wizard.packQtyInput || wizard.product.PACKQTY || '—'} unidades por paquete</p>
            </div>
            <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center gap-4">
              {wizard.product.IMAGEURL && (
                <img src={wizard.product.IMAGEURL} alt="" className="w-24 h-24 object-cover rounded-xl shadow" />
              )}
              <div className="text-center text-sm font-medium text-gray-700 line-clamp-2">{wizard.product.NAME}</div>
              {!wizard.product.PACKQTY && (
                <div className="w-full max-w-xs">
                  <label className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1 block">Unidades por paquete</label>
                  <input
                    type="number"
                    min={1}
                    value={wizard.packQtyInput || ''}
                    onChange={e => onUpdate(w => ({ ...w, packQtyInput: e.target.value }))}
                    placeholder="Ej: 12"
                    className="w-full px-4 py-3 text-xl font-bold text-center border-2 border-gray-200 rounded-2xl focus:outline-none focus:border-amber-500"
                  />
                  <div className="flex gap-2 mt-2">
                    {['6', '12', '24'].map(n => (
                      <button key={n} type="button" onClick={() => onUpdate(w => ({ ...w, packQtyInput: n }))}
                        className="flex-1 py-2 text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg transition">{n}</button>
                    ))}
                  </div>
                </div>
              )}
              <label className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1 block">Cantidad de paquetes</label>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={wizard.packages}
                onChange={e => onUpdate(w => ({ ...w, packages: e.target.value }))}
                className="w-full max-w-[200px] px-4 py-4 text-4xl font-bold text-center border-2 border-gray-200 rounded-2xl focus:outline-none focus:border-amber-500"
              />
              <div className="flex gap-2 w-full max-w-xs">
                {['1', '2', '3', '5'].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => onUpdate(w => ({ ...w, packages: n }))}
                    className="flex-1 py-2.5 text-sm font-bold bg-pink-50 hover:bg-pink-100 text-pink-600 rounded-xl transition"
                  >
                    {n}
                  </button>
                ))}
              </div>
              {wizard.packages && (wizard.product.PACKQTY || wizard.packQtyInput) && (
                <div className="text-center text-sm bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 w-full">
                  <span className="text-gray-600">
                    {wizard.packages} paq. × {wizard.packQtyInput || wizard.product.PACKQTY} ={' '}
                  </span>
                  <span className="font-bold text-emerald-600 text-lg">
                    {parseInt(wizard.packages, 10) * parseInt(wizard.packQtyInput || String(wizard.product.PACKQTY || 0), 10)} unidades
                  </span>
                </div>
              )}
            </div>
            <div className="shrink-0 flex border-t border-gray-100 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => onUpdate(w => ({ ...w, step: 'confirm' }))}
                className="flex-1 px-4 py-4 text-gray-600 hover:bg-gray-50 font-semibold transition"
              >
                Atrás
              </button>
              <button
                type="button"
                onClick={onConfirmPackages}
                disabled={!wizard.packages || parseInt(wizard.packages, 10) <= 0 || (!wizard.product.PACKQTY && (!wizard.packQtyInput || parseInt(wizard.packQtyInput, 10) <= 0))}
                className="flex-1 px-4 py-4 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 disabled:text-gray-500 text-white font-bold transition"
              >
                Siguiente
              </button>
            </div>
          </>
        )}

        {wizard.step === 'gondola' && (
          <>
            <div className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-6 py-4 shrink-0">
              <h3 className="text-xl font-bold">Ubicación en góndola</h3>
              <p className="text-xs text-white/80 mt-1">Selecciona la sección (1–36)</p>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {wizard.product.IMAGEURL && (
                <div className="flex items-center gap-3 mb-4">
                  <img src={wizard.product.IMAGEURL} alt="" className="w-14 h-14 object-cover rounded-lg" />
                  <div className="text-sm font-medium text-gray-800 line-clamp-2 flex-1">{wizard.product.NAME}</div>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 justify-center">
                {Array.from({ length: 36 }, (_, i) => i + 1).map(s => {
                  const count = sectionProductCounts[s] || 0;
                  const isSelected = wizard.section === s;
                  const isLastPlaced = lastPlacedSection === s && !isSelected;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => onUpdate(w => ({ ...w, section: isSelected ? null : s }))}
                      className={`relative w-11 h-11 rounded-lg text-sm font-bold transition-all ${
                        isSelected
                          ? 'bg-pink-500 text-white shadow-md scale-110'
                          : isLastPlaced
                            ? 'bg-emerald-500 text-white ring-2 ring-emerald-300'
                            : 'bg-gray-100 text-gray-600 hover:bg-pink-100 hover:text-pink-600'
                      }`}
                    >
                      {count > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 rounded-full bg-indigo-600 text-white text-[9px] font-bold flex items-center justify-center">
                          {count > 99 ? '99+' : count}
                        </span>
                      )}
                      {s}
                    </button>
                  );
                })}
              </div>
              {wizard.section && (
                <p className="text-center text-sm text-pink-600 font-semibold mt-3">
                  Sección {wizard.section} seleccionada
                </p>
              )}
            </div>
            <div className="shrink-0 flex border-t border-gray-100 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => onUpdate(w => ({ ...w, step: 'packages' }))}
                className="flex-1 px-4 py-4 text-gray-600 hover:bg-gray-50 font-semibold transition"
              >
                Atrás
              </button>
              <button
                type="button"
                onClick={onFinish}
                disabled={saving}
                className="flex-1 px-4 py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-bold transition flex items-center justify-center gap-2"
              >
                {saving ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <CheckCircle2 size={20} />
                )}
                Guardar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

