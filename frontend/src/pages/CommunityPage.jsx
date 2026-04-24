import React, { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { NATURES, CARD_TYPES } from "../lib/natures";
import { GameCard } from "../components/GameCard";
import { Search, Copy, Users, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function CommunityPage() {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [natureFilter, setNatureFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [cloning, setCloning] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/community/cards");
      setCards(data);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => cards.filter(c => {
    if (q && !c.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (natureFilter && !(c.natures || []).includes(natureFilter)) return false;
    if (typeFilter && c.card_type !== typeFilter) return false;
    return true;
  }), [cards, q, natureFilter, typeFilter]);

  const clone = async (card) => {
    setCloning(card.id);
    try {
      await api.post(`/cards/${card.id}/clone`);
      toast.success(`"${card.name}" copiada para sua coleção`);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setCloning(null); }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8 animate-fade-in-up">
        <div className="text-sm uppercase tracking-[0.2em] text-indigo-400 mb-1 flex items-center gap-2">
          <Users size={14} /> Comunidade
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold" style={{ fontFamily: "Outfit" }}>Biblioteca Pública</h1>
        <p className="text-slate-400 mt-2 text-sm">
          Cartas aprovadas pelos admins. Copie pra sua coleção e use em qualquer deck.
        </p>
      </div>

      {/* Filters */}
      <div className="glass rounded-xl p-4 mb-6 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input data-testid="community-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nome..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
        </div>
        <select value={natureFilter} onChange={e => setNatureFilter(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm">
          <option value="">Todas naturezas</option>
          {NATURES.map(n => <option key={n}>{n}</option>)}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm">
          <option value="">Todos tipos</option>
          {CARD_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-16">
          <Loader2 className="animate-spin text-indigo-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-xl p-16 text-center">
          <Users className="mx-auto text-slate-600 mb-3" size={32} />
          <p className="text-slate-400">
            {cards.length === 0 ? "Nenhuma carta aprovada ainda na comunidade." : "Nenhuma carta encontrada com esses filtros."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filtered.map(c => (
            <div key={c.id} className="animate-fade-in-up flex flex-col gap-2" data-testid={`community-card-${c.id}`}>
              <GameCard card={c} size="md" showStats />
              <div className="text-[10px] text-slate-500 truncate px-1">por {c.owner_name}</div>
              <button onClick={() => clone(c)} disabled={cloning === c.id} data-testid={`clone-card-${c.id}`}
                className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-200 text-xs transition-colors disabled:opacity-50">
                {cloning === c.id ? <Loader2 size={12} className="animate-spin" /> : <Copy size={12} />}
                Copiar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
