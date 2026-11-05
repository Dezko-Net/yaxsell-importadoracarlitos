'use client';

import { useRef, useState } from 'react';
import { ID } from '@/lib/db';
import { getServices, getFirebaseConfig, MEDIA_PREFIXES, type MediaPrefix } from '@/lib/db';
import { Upload, Loader2, ExternalLink, X } from 'lucide-react';

interface Props {
  label: string;
  value: string;
  onChange: (url: string) => void;
  bucketId: string;
  placeholder?: string;
  prefix?: MediaPrefix;
}

export default function ImageUploadField({ label, value, onChange, bucketId, placeholder, prefix = 'products' }: Props) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const { storage } = getServices();
      const { endpoint, projectId } = getFirebaseConfig();
      const fileId = ID.unique();
      await storage.createFile(bucketId, fileId, file);
      const url = `${endpoint}/storage/buckets/${bucketId}/files/${fileId}/view?project=${projectId}`;
      onChange(url);
    } catch (e: any) {
      alert('Error al subir imagen: ' + e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder || 'https://...'}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-8"
          />
          {value && (
            <a href={value} target="_blank" rel="noreferrer"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-indigo-600">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-2 border border-dashed border-gray-300 rounded-xl text-xs text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition disabled:opacity-60 shrink-0"
          title="Subir imagen"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {uploading ? 'Subiendo...' : 'Subir'}
        </button>
      </div>
      {value && (
        <div className="mt-2 relative inline-block">
          <img src={value} alt="" className="h-12 w-12 rounded-lg object-cover border border-gray-200"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <button type="button" onClick={() => onChange('')}
            className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition">
            <X className="w-2.5 h-2.5" />
          </button>
        </div>
      )}
    </div>
  );
}
