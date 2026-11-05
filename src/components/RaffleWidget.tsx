'use client';

import { useState, useEffect, useCallback } from 'react';
import { getServices, getFirebaseConfig, RAFFLES_COLLECTION, RAFFLE_PARTICIPANTS_COLLECTION } from '@/lib/db';
import { Client, Query, ID } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { Gift, Users, Trophy, Loader2 } from 'lucide-react';

interface LiveRaffle {
  $id: string;
  liveId: string;
  title?: string;
  description?: string;
  isActive?: boolean;
  startTime?: string;
  endTime?: string;
  createdAt?: string;
  winnerId?: string;
  winnerName?: string;
}

interface Props {
  liveStreamId?: string;
}

export default function RaffleWidget({ liveStreamId }: Props) {
  const { user, isLoggedIn } = useAuth();
  const [raffle, setRaffle] = useState<LiveRaffle | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);

  const loadRaffle = useCallback(async () => {
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const queries = [
        Query.equal('isActive', true),
        Query.orderDesc('createdAt'),
        Query.limit(1),
      ];
      if (liveStreamId) queries.unshift(Query.equal('liveId', liveStreamId));
      const res = await databases.listDocuments(databaseId, RAFFLES_COLLECTION, queries);

      // Also check recently completed raffles if none active
      if (res.documents.length === 0) {
        const completedRes = await databases.listDocuments(databaseId, RAFFLES_COLLECTION, [
          ...(liveStreamId ? [Query.equal('liveId', liveStreamId)] : []),
          Query.isNotNull('winnerId'),
          Query.orderDesc('createdAt'),
          Query.limit(1),
        ]);
        if (completedRes.documents.length > 0) {
          const r = completedRes.documents[0] as unknown as LiveRaffle;
          setRaffle(r);
        } else {
          setRaffle(null);
        }
      } else {
        const r = res.documents[0] as unknown as LiveRaffle;
        setRaffle(r);
      }
    } catch (e) {
      console.error('Error loading raffle:', e);
    } finally {
      setLoading(false);
    }
  }, [liveStreamId]);

  // Load participant count and check if user joined (solo cuando cambia el raffle)
  const loadParticipants = useCallback(async (raffleId: string) => {
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      const pRes = await databases.listDocuments(databaseId, RAFFLE_PARTICIPANTS_COLLECTION, [
        Query.equal('raffleId', raffleId),
        Query.limit(100),
      ]);
      setParticipantCount(pRes.total);
      if (user) {
        const userJoined = pRes.documents.some((d: any) => d.userId === user.id);
        setJoined(userJoined);
      }
    } catch {}
  }, [user]);

  // 🚀 Carga inicial
  useEffect(() => {
    loadRaffle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveStreamId]);

  useEffect(() => {
    if (!raffle) return;
    loadParticipants(raffle.$id);
  }, [raffle, loadParticipants]);

  async function handleJoin() {
    if (!raffle || !user || !isLoggedIn || joining || joined) return;
    setJoining(true);
    try {
      const { databases } = getServices();
      const { databaseId } = getFirebaseConfig();
      await databases.createDocument(databaseId, RAFFLE_PARTICIPANTS_COLLECTION, ID.unique(), {
        raffleId: raffle.$id,
        userId: user.id,
        username: user.name || 'Usuario',
        joinedAt: new Date().toISOString(),
      });
      setJoined(true);
      setParticipantCount(prev => prev + 1);
    } catch (e) {
      console.error('Error joining raffle:', e);
    } finally {
      setJoining(false);
    }
  }

  if (loading || !raffle) return null;

  const isCompleted = !!raffle.winnerId;
  const isActive = raffle.isActive && !isCompleted;
  const isWinner = isCompleted && raffle.winnerId === user?.id;

  return (
    <div style={{
      background: isWinner ? 'linear-gradient(135deg, #ffd700, #ff8c00)' : 'linear-gradient(135deg, #3483fa, #6366f1)',
      borderRadius: 16, padding: '20px', color: '#fff', position: 'relative', overflow: 'hidden',
    }}>
      {/* Decorative circles */}
      <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
      <div style={{ position: 'absolute', bottom: -10, left: -10, width: 50, height: 50, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, position: 'relative', zIndex: 1 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isCompleted ? <Trophy size={22} /> : <Gift size={22} />}
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
            {isCompleted ? 'Sorteo finalizado' : 'Sorteo en vivo'}
          </p>
          {raffle.title && <p style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>{raffle.title}</p>}
        </div>
      </div>

      {/* Description as prize info */}
      {raffle.description && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, padding: '10px 12px', background: 'rgba(255,255,255,0.12)', borderRadius: 10, position: 'relative', zIndex: 1 }}>
          <div>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 600, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 0.5 }}>Premio</p>
            <p style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 700 }}>{raffle.description}</p>
          </div>
        </div>
      )}

      {/* Participants */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, position: 'relative', zIndex: 1 }}>
        <Users size={14} style={{ opacity: 0.7 }} />
        <span style={{ fontSize: 13, opacity: 0.8 }}>{participantCount} participante{participantCount !== 1 ? 's' : ''}</span>
      </div>

      {/* Winner announcement */}
      {isCompleted && raffle.winnerName && (
        <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(255,255,255,0.15)', borderRadius: 10, marginBottom: 10, position: 'relative', zIndex: 1 }}>
          <Trophy size={28} style={{ margin: '0 auto 6px', color: '#ffd700' }} />
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>
            {isWinner ? '¡FELICIDADES, GANASTE!' : `Ganador: ${raffle.winnerName}`}
          </p>
        </div>
      )}

      {/* Join button */}
      {isActive && (
        <button
          onClick={isLoggedIn ? handleJoin : () => { window.location.href = '/login'; }}
          disabled={joined || joining}
          style={{
            width: '100%', padding: '12px 0', borderRadius: 10,
            background: joined ? 'rgba(255,255,255,0.2)' : '#fff',
            color: joined ? '#fff' : '#333',
            border: 'none', fontSize: 14, fontWeight: 700,
            cursor: joined ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            position: 'relative', zIndex: 1,
            transition: 'transform 0.15s',
          }}
          onMouseEnter={e => { if (!joined) e.currentTarget.style.transform = 'scale(1.02)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          {joining ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : joined ? '✓ Estás participando' : isLoggedIn ? 'Participar en el sorteo' : 'Inicia sesión para participar'}
        </button>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
