'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Query } from '@/lib/db';
import { RefreshCw, AlertTriangle, Search, X, Crown, Download, ShoppingCart, Mail, Phone } from 'lucide-react';
import { getServices, getFirebaseConfig, ORDERS_COLLECTION_ID } from '@/lib/db';
import { dedupeUserDocuments, isRegisteredUserProfile, listAllUserProfiles, type UserProfileDoc } from '@/lib/users-db';
import { LOYALTY_LEVELS, getLevelMeta, type LoyaltyLevelId } from '@/lib/loyalty-levels';

interface AppUser {
  $id: string;
  userId?: string;
  name?: string;
  email?: string;
  phone?: string;
  region?: string;
  $createdAt: string;
}

function resolveVipLevel(orderCount: number): LoyaltyLevelId {
  let level: LoyaltyLevelId = 'bronze';
  for (const l of LOYALTY_LEVELS) {
    if (orderCount >= l.requiredOrders) level = l.id;
  }
  return level;
}

const VIP_LEVELS: LoyaltyLevelId[] = ['silver', 'gold', 'diamond', 'ruby'];

export default function VipAdminPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [orderCounts, setOrderCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<LoyaltyLevelId | 'all'>('all');

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const [rawUsers, ordersResp] = await Promise.all([
        listAllUserProfiles(500),
        databases.listDocuments(databaseId, ORDERS_COLLECTION_ID, [
          Query.equal('STATUS', 'paid'),
          Query.limit(500),
        ]),
      ]);
      const registered = dedupeUserDocuments(rawUsers as UserProfileDoc[])
        .filter(isRegisteredUserProfile) as AppUser[];
      setUsers(registered);
      const counts: Record<string, number> = {};
      for (const o of ordersResp.documents as { USERID?: string }[]) {
        if (o.USERID) counts[o.USERID] = (counts[o.USERID] || 0) + 1;
      }
      setOrderCounts(counts);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar clientes VIP');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const vipRows = useMemo(() => {
    return users
      .map(u => {
        const orders = orderCounts[u.userId || u.$id] || 0;
        const levelId = resolveVipLevel(orders);
        return { user: u, orders, levelId, level: getLevelMeta(levelId) };
      })
      .filter(r => VIP_LEVELS.includes(r.levelId));
  }, [users, orderCounts]);

  const filtered = useMemo(() => {
    return vipRows
      .filter(r => {
        if (levelFilter !== 'all' && r.levelId !== levelFilter) return false;
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          r.user.name?.toLowerCase().includes(q) ||
          r.user.email?.toLowerCase().includes(q) ||
          r.user.phone?.includes(q)
        );
      })
      .sort((a, b) => b.orders - a.orders || (a.user.name || '').localeCompare(b.user.name || ''));
  }, [vipRows, levelFilter, search]);

  const tierStats = useMemo(() => {
    const stats: Record<LoyaltyLevelId, number> = { bronze: 0, silver: 0, gold: 0, diamond: 0, ruby: 0 };
    for (const r of vipRows) stats[r.levelId] += 1;
    return stats;
  }, [vipRows]);

  const exportCSV = () => {
    const headers = ['Nombre', 'Email', 'Teléfono', 'Nivel VIP', 'Pedidos pagados', 'Región', 'Registro'];
    const rows = filtered.map(r => [
      r.user.name || '',
      r.user.email || '',
      r.user.phone || '',
      r.level.name,
      r.orders,
      r.user.region || '',
      new Date(r.user.$createdAt).toLocaleDateString('es-CL'),
    ]);
    const csv = [headers, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clientes_vip_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Crown className="w-6 h-6 text-pink-500" />
            Clientes VIP
          </h1>
          <p className="text-sm text-gray-500">
            {filtered.length} cliente{filtered.length !== 1 ? 's' : ''} con nivel Plata o superior
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/admin/users"
            className="px-3 py-2 rounded-xl text-sm font-medium border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
          >
            Ver todos los clientes
          </Link>
          <button
            type="button"
            onClick={exportCSV}
            disabled={filtered.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            CSV
          </button>
          <button
            type="button"
            onClick={load}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-pink-600 text-white rounded-xl text-sm font-medium hover:bg-pink-700 disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {VIP_LEVELS.map(id => {
          const meta = getLevelMeta(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => setLevelFilter(levelFilter === id ? 'all' : id)}
              className={`rounded-2xl border p-4 text-left transition ${
                levelFilter === id ? 'border-pink-400 bg-pink-50 shadow-sm' : 'border-gray-100 bg-white hover:border-pink-200'
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{meta.name}</p>
              <p className="text-2xl font-bold mt-1" style={{ color: meta.color }}>
                {tierStats[id]}
              </p>
              <p className="text-[11px] text-gray-400 mt-1">{meta.requiredOrders}+ pedidos</p>
            </button>
          );
        })}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre, email o teléfono..."
          className="w-full pl-9 pr-9 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
        />
        {search && (
          <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Cliente</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Nivel</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Pedidos</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Contacto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {[1, 2, 3, 4].map(j => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-gray-400">
                    <Crown className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    No hay clientes VIP con los filtros actuales
                  </td>
                </tr>
              ) : (
                filtered.map(({ user, orders, level }) => (
                  <tr key={user.$id} className="hover:bg-pink-50/40">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{user.name || 'Sin nombre'}</p>
                      <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                        <Mail className="w-3 h-3" />
                        {user.email || '—'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold text-white"
                        style={{ background: `linear-gradient(135deg, ${level.color}, ${level.color}cc)` }}
                      >
                        <Crown className="w-3 h-3" />
                        {level.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 text-pink-700 font-semibold">
                        <ShoppingCart className="w-3.5 h-3.5" />
                        {orders}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                      {user.phone ? (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5" />
                          {user.phone}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
