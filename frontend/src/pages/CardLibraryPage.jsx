import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { NATURES, CARD_TYPES } from "../lib/natures";
import { GameCard } from "../components/GameCard";
import { CommunityCardDetailModal } from "../components/CommunityCardDetailModal";
import { Search, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

const statusLabels = {
  approved: "Publica",
  pending: "Em analise",
  rejected: "Rejeitada",
  private: "Privada",
};

const statusColors = {
  approved: "#34D399",
  pending: "#FBBF24",
  rejected: "#F87171",
  private: "#94A3B8",
};

export default function CardLibraryPage() {
  const [cards, setCards] = useState([]);
  const [q, setQ] = useState("");
  const [natureFilter, setNatureFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [alphaOnly, setAlphaOnly] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/cards");
        setCards(Array.isArray(data) ? data : []);
      } catch (e) {
        toast.error(formatApiError(e));
      }
    })();
  }, []);

  const filtered = useMemo(() => cards.filter(c => {
    if (q && !c.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (natureFilter && !(c.natures || []).includes(natureFilter)) return false;
    if (typeFilter && c.card_type !== typeFilter) return false;
    if (alphaOnly && !c.is_alpha) return false;
    return true;
  }), [cards, q, natureFilter, typeFilter, alphaOnly]);

  const removeFromLibrary = async card => {
    const message = card.public_status === "approved" || card.is_library_reference
      ? "Remover esta carta da sua biblioteca pessoal?"
      : "Excluir esta carta?";
    if (!window.confirm(message)) return;

    try {
      await api.delete(`/cards/${card.id}`);
      setCards(current => current.filter(item => item.id !== card.id));
      toast.success("Carta removida da sua biblioteca");
      if (selectedCard?.id === card.id) setSelectedCard(null);
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="text-sm uppercase tracking-[0.2em] text-indigo-400 mb-1">Colecao</div>
          <h1 className="text-4xl font-bold" style={{ fontFamily: "Outfit" }}>Biblioteca de Cartas</h1>
          <p className="text-slate-400 text-sm mt-1">{cards.length} carta{cards.length !== 1 ? "s" : ""} na sua colecao</p>
        </div>
        <button
          onClick={() => navigate("/cards/new")}
          data-testid="new-card-btn"
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 flex items-center gap-2"
        >
          <Plus size={14} /> Nova Carta
        </button>
      </div>

      <div className="glass rounded-xl p-4 mb-6 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            data-testid="search-input"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar por nome..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <select
          data-testid="nature-filter"
          value={natureFilter}
          onChange={e => setNatureFilter(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Todas naturezas</option>
          {NATURES.map(n => <option key={n}>{n}</option>)}
        </select>
        <select
          data-testid="type-filter"
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm"
        >
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map(c => (
            <div key={c.id} className="animate-fade-in-up flex flex-col items-center gap-1.5">
              <GameCard card={c} size="md" onClick={() => setSelectedCard(c)} />
              <div
                className="text-[10px] text-center uppercase tracking-wider font-semibold"
                style={{ color: statusColors[c.public_status] || statusColors.private }}
              >
                Situacao: {statusLabels[c.public_status] || c.public_status || "Privada"}
              </div>
              {(c.can_edit === false || c.is_library_reference) && (
                <div className="text-[10px] text-center uppercase tracking-wider font-semibold text-indigo-300">
                  Comunidade
                </div>
              )}
              {c.can_edit !== false && !c.is_library_reference && (
                <button
                  type="button"
                  onClick={() => navigate(`/cards/${c.id}/edit`)}
                  className="w-40 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-300 hover:border-indigo-500/50 hover:text-indigo-200"
                >
                  Editar
                </button>
              )}
              <button
                type="button"
                onClick={() => removeFromLibrary(c)}
                className="w-40 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-500/20"
              >
                <span className="inline-flex items-center justify-center gap-1.5">
                  <Trash2 size={12} /> Remover
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
      {selectedCard && (
        <CommunityCardDetailModal card={selectedCard} onClose={() => setSelectedCard(null)} />
      )}
    </div>
  );
}
