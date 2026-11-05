'use client';

import { useEffect, useState, useCallback } from 'react';
import { Query } from '@/lib/db';
import { getServices, getFirebaseConfig, PRODUCTS_COLLECTION_ID } from '@/lib/db';
import {
  ArrowLeft, Loader, Edit3, Check, X, Trash2, Package,
  Tag, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, Link as LinkIcon
} from 'lucide-react';
import Link from 'next/link';

interface ProductData {
  $id: string;
  NAME: string;
  SKU: string;
  STOCK: number;
  PRICE: number;
  IMAGEURL: string;
  GROUPID?: string;
}

interface GroupDoc {
  $id: string;
  GROUPID: string;
  GROUP_NAME?: string;
  VARIANT_LABELS?: string; // JSON string: { productId: label }
}

interface LinkedGroup {
  groupId: string;
  groupName: string;
  variantLabels: Record<string, string>;
  products: ProductData[];
  groupDocId?: string; // Appwrite doc id of the group record
}

export default function VinculadosPage() {
  const [groups, setGroups] = useState<LinkedGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [editingGroupName, setEditingGroupName] = useState<Record<string, string>>({});
  const [editingLabels, setEditingLabels] = useState<Record<string, Record<string, string>>>({});
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchGroups = useCallback(async () => {
    setIsLoading(true);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();

      // 1. Get all products with a GROUPID
      const prodRes = await databases.listDocuments(databaseId, PRODUCTS_COLLECTION_ID, [
        Query.isNotNull('GROUPID'),
        Query.equal('ISACTIVE', true),
        Query.orderDesc('$createdAt'),
        Query.limit(1000),
      ]);

      const products = prodRes.documents.map((doc: any) => {
        let sku = doc.SKU || doc.sku || '';
        if (!sku && doc.jumpseller_id) sku = String(doc.jumpseller_id);
        return {
          $id: doc.$id,
          NAME: doc.NAME,
          SKU: sku,
          STOCK: doc.STOCK || 0,
          PRICE: doc.PRICE || 0,
          IMAGEURL: doc.IMAGEURL || '',
          GROUPID: doc.GROUPID,
        } as ProductData;
      });

      // 2. Group products by GROUPID
      const groupMap = new Map<string, ProductData[]>();
      products.forEach((p) => {
        if (!p.GROUPID) return;
        if (!groupMap.has(p.GROUPID)) groupMap.set(p.GROUPID, []);
        groupMap.get(p.GROUPID)!.push(p);
      });

      // 3. Get group metadata docs
      let groupDocs: GroupDoc[] = [];
      try {
        const grpRes = await databases.listDocuments(databaseId, 'product_groups', [
          Query.limit(500),
        ]);
        groupDocs = grpRes.documents as unknown as GroupDoc[];
      } catch {}

      const groupDocMap = new Map<string, GroupDoc>();
      groupDocs.forEach((d) => groupDocMap.set(d.GROUPID, d));

      // 4. Build LinkedGroup array
      const linkedGroups: LinkedGroup[] = [];
      groupMap.forEach((prods, groupId) => {
        const grpDoc = groupDocMap.get(groupId);
        let variantLabels: Record<string, string> = {};
        if (grpDoc?.VARIANT_LABELS) {
          try { variantLabels = JSON.parse(grpDoc.VARIANT_LABELS); } catch {}
        }
        linkedGroups.push({
          groupId,
          groupName: grpDoc?.GROUP_NAME || '',
          variantLabels,
          products: prods,
          groupDocId: grpDoc?.$id,
        });
      });

      // Sort: groups with most recently added products first
      linkedGroups.sort((a, b) => b.products.length - a.products.length);

      setGroups(linkedGroups);

      // Initialize editing state
      const nameState: Record<string, string> = {};
      const labelsState: Record<string, Record<string, string>> = {};
      linkedGroups.forEach((g) => {
        nameState[g.groupId] = g.groupName;
        labelsState[g.groupId] = { ...g.variantLabels };
      });
      setEditingGroupName(nameState);
      setEditingLabels(labelsState);
    } catch (e: any) {
      setErrorMsg('Error cargando grupos: ' + e.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const toggleExpand = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const saveGroup = async (group: LinkedGroup) => {
    setIsSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();

      const newGroupName = editingGroupName[group.groupId] || '';
      const newLabels = editingLabels[group.groupId] || {};
      const newLabelsJson = JSON.stringify(newLabels);

      if (group.groupDocId) {
        // Update existing group doc
        await databases.updateDocument(databaseId, 'product_groups', group.groupDocId, {
          GROUP_NAME: newGroupName,
          VARIANT_LABELS: newLabelsJson,
        });
      } else {
        // Create new group doc
        await databases.createDocument(databaseId, 'product_groups', 'unique()', {
          GROUPID: group.groupId,
          GROUP_NAME: newGroupName,
          VARIANT_LABELS: newLabelsJson,
        });
      }

      setSuccessMsg(`Grupo "${newGroupName || group.groupId}" guardado correctamente.`);
      await fetchGroups();
    } catch (e: any) {
      setErrorMsg('Error guardando: ' + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const unlinkProduct = async (productId: string) => {
    if (!confirm('¿Desvincular este producto de su grupo?')) return;
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      await databases.updateDocument(databaseId, PRODUCTS_COLLECTION_ID, productId, { GROUPID: null });
      setSuccessMsg('Producto desvinculado.');
      await fetchGroups();
    } catch (e: any) {
      setErrorMsg('Error desvinculando: ' + e.message);
    }
  };

  const deleteGroup = async (group: LinkedGroup) => {
    if (!confirm(`¿Disolver el grupo completo? Los ${group.products.length} productos quedarán sin vincular.`)) return;
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      for (const p of group.products) {
        await databases.updateDocument(databaseId, PRODUCTS_COLLECTION_ID, p.$id, { GROUPID: null });
        await new Promise((r) => setTimeout(r, 80));
      }
      if (group.groupDocId) {
        await databases.deleteDocument(databaseId, 'product_groups', group.groupDocId);
      }
      setSuccessMsg('Grupo disuelto correctamente.');
      await fetchGroups();
    } catch (e: any) {
      setErrorMsg('Error disolviendo grupo: ' + e.message);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/products"
            className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft size={18} />
            Volver a Productos
          </Link>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <LinkIcon size={14} className="text-indigo-500" />
          <span>{groups.length} grupos vinculados</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Grupos Vinculados</h1>
        <p className="text-sm text-gray-500">
          Asigna un nombre a cada grupo y etiquetas individuales a cada variante (ej. &quot;Rojo&quot;, &quot;Verde&quot;, &quot;Grande&quot;). Estos textos se mostrarán en la tienda al seleccionar modelos.
        </p>
      </div>

      {successMsg && (
        <div className="mb-4 flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="text-sm text-green-800">{successMsg}</p>
        </div>
      )}
      {errorMsg && (
        <div className="mb-4 flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-800">{errorMsg}</p>
        </div>
      )}

      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center text-gray-400">
          <Loader size={40} className="animate-spin mb-4 text-indigo-500" />
          <p>Cargando grupos...</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="py-20 text-center text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-300">
          <Package size={40} className="mx-auto mb-4 text-gray-300" />
          <p className="font-medium">No hay grupos vinculados todavía.</p>
          <p className="text-sm mt-1">
            No hay grupos vinculados todavía.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const isExpanded = expandedGroups.has(group.groupId);
            const currentName = editingGroupName[group.groupId] ?? group.groupName;
            const currentLabels = editingLabels[group.groupId] ?? group.variantLabels;

            return (
              <div
                key={group.groupId}
                className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Group Header */}
                <div className="flex items-center gap-4 px-5 py-4">
                  {/* Thumbnails preview */}
                  <div className="flex -space-x-3 flex-shrink-0">
                    {group.products.slice(0, 4).map((p) => (
                      <div
                        key={p.$id}
                        className="w-10 h-10 rounded-full border-2 border-white overflow-hidden bg-gray-100 flex-shrink-0"
                      >
                        {p.IMAGEURL ? (
                          <img src={p.IMAGEURL} alt={p.NAME} className="w-full h-full object-cover" />
                        ) : (
                          <Package size={16} className="m-auto mt-2 text-gray-400" />
                        )}
                      </div>
                    ))}
                    {group.products.length > 4 && (
                      <div className="w-10 h-10 rounded-full border-2 border-white bg-indigo-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-indigo-700">+{group.products.length - 4}</span>
                      </div>
                    )}
                  </div>

                  {/* Group Name Input */}
                  <div className="flex-grow min-w-0">
                    <input
                      type="text"
                      value={currentName}
                      onChange={(e) =>
                        setEditingGroupName((prev) => ({ ...prev, [group.groupId]: e.target.value }))
                      }
                      placeholder="Nombre del grupo (ej. Llavero Kawaii)"
                      className="w-full text-base font-semibold text-gray-900 bg-transparent border-0 border-b border-dashed border-gray-300 focus:border-indigo-500 focus:outline-none pb-0.5 placeholder:text-gray-400 placeholder:font-normal"
                    />
                    <p className="text-xs text-gray-400 mt-1">{group.products.length} variantes · ID: {group.groupId}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => saveGroup(group)}
                      disabled={isSaving}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 transition-colors"
                    >
                      {isSaving ? <Loader size={12} className="animate-spin" /> : <Check size={12} />}
                      Guardar
                    </button>
                    <button
                      onClick={() => deleteGroup(group)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 text-xs font-semibold rounded-lg hover:bg-red-100 transition-colors border border-red-200"
                    >
                      <Trash2 size={12} />
                      Disolver
                    </button>
                    <button
                      onClick={() => toggleExpand(group.groupId)}
                      className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                </div>

                {/* Expanded: list all variants with label inputs */}
                {isExpanded && (
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    <div className="px-5 py-2 bg-gray-50 flex items-center gap-2">
                      <Tag size={12} className="text-gray-400" />
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Variantes — asigna etiquetas individuales
                      </span>
                    </div>
                    {group.products.map((p) => (
                      <div key={p.$id} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors">
                        {/* Product image */}
                        <a
                          href={p.IMAGEURL}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="w-12 h-12 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0 bg-gray-100 block"
                        >
                          {p.IMAGEURL ? (
                            <img src={p.IMAGEURL} alt={p.NAME} className="w-full h-full object-cover hover:opacity-80 transition-opacity" />
                          ) : (
                            <Package size={18} className="m-auto mt-3 text-gray-300" />
                          )}
                        </a>

                        {/* Product info */}
                        <div className="flex-grow min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{p.NAME}</p>
                          <p className="text-xs text-gray-400 font-mono">{p.SKU || 'Sin SKU'} · ${p.PRICE.toLocaleString()} · Stock: {p.STOCK}</p>
                        </div>

                        {/* Variant label input */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Tag size={14} className="text-gray-400" />
                          <input
                            type="text"
                            value={currentLabels[p.$id] || ''}
                            onChange={(e) =>
                              setEditingLabels((prev) => ({
                                ...prev,
                                [group.groupId]: {
                                  ...prev[group.groupId],
                                  [p.$id]: e.target.value,
                                },
                              }))
                            }
                            placeholder="ej. Rojo"
                            className="w-28 text-sm px-2 py-1 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                          />
                          <button
                            onClick={() => unlinkProduct(p.$id)}
                            className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                            title="Desvincular este producto"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                    {/* Save reminder inside expanded view */}
                    <div className="px-5 py-3 bg-amber-50 flex items-center gap-2 border-t border-amber-100">
                      <Edit3 size={12} className="text-amber-600" />
                      <span className="text-xs text-amber-700">
                        Recuerda hacer click en <strong>Guardar</strong> para aplicar los cambios de etiquetas.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
