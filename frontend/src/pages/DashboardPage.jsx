import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Library, Layers, Plus, Sparkles, TrendingUp } from "lucide-react";
import { toast } from "sonner";

export default function DashboardPage() {
  const { user } = useAuth();
  const [cards, setCards] = useState([]);
  const [decks, setDecks] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const [c, d] = await Promise.all([api.get("/cards"), api.get("/decks")]);
        setCards(c.data);
        setDecks(d.data);
      } catch (e) { toast.error(formatApiError(e)); }
    })();
  }, []);

  const stats = [
    { label: "Cartas", value: cards.length, icon: Library, color: "#6366F1" },
    { label: "Decks", value: decks.length, icon: Layers, color: "#F59E0B" },
    { label: "Personagens", value: cards.filter(c => c.card_type === "Personagem").length, icon: Sparkles, color: "#EC4899" },
    { label: "ALPHAs", value: cards.filter(c => c.is_alpha).length, icon: TrendingUp, color: "#22C55E" },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8 animate-fade-in-up">
        <div className="text-sm uppercase tracking-[0.2em] text-indigo-400 mb-2">Bem-vindo de volta</div>
        <h1 className="text-4xl sm:text-5xl font-bold" style={{ fontFamily: "Outfit" }}>{user?.name}</h1>
        <p className="text-slate-400 mt-2">Gerencie sua coleção, construa decks e analise estratégias.</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} data-testid={`stat-${label.toLowerCase()}`} className="glass rounded-xl p-5 card-shine">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs uppercase tracking-widest text-slate-500 mb-1">{label}</div>
                <div className="text-3xl font-bold font-mono" style={{ color }}>{value}</div>
              </div>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${color}22`, border: `1px solid ${color}55` }}>
                <Icon size={16} style={{ color }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid md:grid-cols-2 gap-6 mb-10">
        <button onClick={() => navigate("/cards/new")} data-testid="quick-new-card"
          className="glass rounded-xl p-6 text-left hover:border-indigo-500/50 transition-colors group">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Plus className="text-indigo-400" />
            </div>
            <h3 className="text-xl font-semibold" style={{ fontFamily: "Outfit" }}>Criar Nova Carta</h3>
          </div>
          <p className="text-sm text-slate-400">Monte uma carta customizada com naturezas, stats e imagem.</p>
        </button>

        <button onClick={() => navigate("/decks/new")} data-testid="quick-new-deck"
          className="glass rounded-xl p-6 text-left hover:border-amber-500/50 transition-colors group">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Layers className="text-amber-400" />
            </div>
            <h3 className="text-xl font-semibold" style={{ fontFamily: "Outfit" }}>Construir Deck</h3>
          </div>
          <p className="text-sm text-slate-400">Arrume 20 cartas e analise a cobertura de naturezas.</p>
        </button>
      </div>

      {/* Recent decks */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold" style={{ fontFamily: "Outfit" }}>Decks Recentes</h2>
          <Link to="/decks" className="text-sm text-indigo-400 hover:text-indigo-300">Ver todos →</Link>
        </div>
        {decks.length === 0 ? (
          <div className="glass rounded-xl p-10 text-center text-slate-400">
            Nenhum deck ainda. <Link to="/decks/new" className="text-indigo-400">Crie seu primeiro</Link>.
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-4">
            {decks.slice(0, 3).map(d => (
              <Link key={d.id} to={`/decks/${d.id}`} data-testid={`recent-deck-${d.id}`}
                className="glass rounded-xl p-5 hover:border-indigo-500/50 transition-colors">
                <h3 className="font-semibold mb-1 truncate" style={{ fontFamily: "Outfit" }}>{d.name}</h3>
                <p className="text-xs text-slate-500 line-clamp-2 mb-3">{d.description || "Sem descrição"}</p>
                <div className="text-xs text-slate-400 font-mono">{d.card_ids?.length || 0} / 20 cartas</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
