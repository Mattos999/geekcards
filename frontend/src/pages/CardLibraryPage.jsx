import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { NATURES, CARD_TYPES } from "../lib/natures";
import { GameCard } from "../components/GameCard";
import { Search, Filter, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";

export default function CardLibraryPage() {
  const [cards, setCards] = useState([]);
  const [q, setQ] = useState("");
  const [natureFilter, setNatureFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [alphaOnly, setAlphaOnly] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try { const { data } = await api.get("/cards"); setCards(data); }
      catch (e) { toast.error(formatApiError(e)); }
    })();
  }, []);

  const filtered = useMemo(() => cards.filter(c => {
    if (q && !c.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (natureFilter && !(c.natures || []).includes(natureFilter)) return false;
    if (typeFilter && c.card_type !== typeFilter) return false;
    if (alphaOnly && !c.is_alpha) return false;
    return true;
  }), [cards, q, natureFilter, typeFilter, alphaOnly]);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="text-sm uppercase tracking-[0.2em] text-indigo-400 mb-1">Coleção</div>
          <h1 className="text-4xl font-bold" style={{ fontFamily: "Outfit" }}>Biblioteca de Cartas</h1>
          <p className="text-slate-400 text-sm mt-1">{cards.length} carta{cards.length !== 1 ? "s" : ""} na sua coleção</p>
        </div>
        <button onClick={() => navigate("/cards/new")} data-testid="new-card-btn"
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 flex items-center gap-2">
          <Plus size={14} /> Nova Carta
        </button>
      </div>

      {/* Filters */}
      <div className="glass rounded-xl p-4 mb-6 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input data-testid="search-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nome..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
        </div>
        <select data-testid="nature-filter" value={natureFilter} onChange={e => setNatureFilter(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm">
          <option value="">Todas naturezas</option>
          {NATURES.map(n => <option key={n}>{n}</option>)}
        </select>
        <select data-testid="type-filter" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm">
          <option value="">Todos tipos</option>
          {CARD_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={alphaOnly} onChange={e => setAlphaOnly(e.target.checked)} data-testid="alpha-filter" />
          ALPHA
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="glass rounded-xl p-16 text-center">
          <Sparkles className="mx-auto text-slate-600 mb-3" size={32} />
          <p className="text-slate-400 mb-4">{cards.length === 0 ? "Nenhuma carta ainda." : "Nenhuma carta encontrada."}</p>
          {cards.length === 0 && (
            <button onClick={() => navigate("/cards/new")} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 text-sm">
              Criar primeira carta
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filtered.map(c => (
            <div key={c.id} className="animate-fade-in-up">
              <GameCard card={c} size="md" onClick={() => navigate(`/cards/${c.id}/edit`)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
