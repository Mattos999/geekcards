import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Library, Layers, Plus, Sparkles, TrendingUp, Users } from "lucide-react";
import { toast } from "sonner";

export default function DashboardPage() {
  const { user } = useAuth();
  const [cards, setCards] = useState([]);
  const [decks, setDecks] = useState([]);
  const [players, setPlayers] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    const loadPresence = async () => {
      try {
        await api.post("/presence/heartbeat");
        const { data } = await api.get("/users/presence");
        if (active) setPlayers(Array.isArray(data) ? data : []);
      } catch {
        if (active) setPlayers([]);
      }
    };

    (async () => {
      try {
        const [c, d, p] = await Promise.all([
          api.get("/cards"),
          api.get("/decks"),
          api.get("/users/presence"),
        ]);
        setCards(Array.isArray(c.data) ? c.data : []);
        setDecks(Array.isArray(d.data) ? d.data : []);
        setPlayers(Array.isArray(p.data) ? p.data : []);
      } catch (e) { toast.error(formatApiError(e)); }
    })();

    const interval = window.setInterval(loadPresence, 30000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const stats = [
    { label: "Cartas", value: cards.length, icon: Library, color: "#6366F1" },
    { label: "Decks", value: decks.length, icon: Layers, color: "#F59E0B" },
    { label: "Personagens", value: cards.filter(c => c.card_type === "Personagem").length, icon: Sparkles, color: "#EC4899" },
    { label: "ALPHAs", value: cards.filter(c => c.is_alpha).length, icon: TrendingUp, color: "#22C55E" },
  ];
  const onlineCount = players.filter(player => player.is_online).length;

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

      <section className="glass mb-10 rounded-xl p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold" style={{ fontFamily: "Outfit" }}>
              <Users size={18} className="text-emerald-300" />
              Jogadores
            </h2>
            <p className="mt-1 text-xs text-slate-500">{onlineCount} online de {players.length}</p>
          </div>
          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
            Online agora
          </div>
        </div>
        {players.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500">
            Nenhum jogador encontrado.
          </div>
        ) : (
          <div className="divide-y divide-slate-800 rounded-lg border border-slate-800">
            {players.map(player => (
              <div key={player.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${player.is_online ? "bg-emerald-400" : "bg-slate-600"}`} />
                    <span className="truncate text-sm font-medium text-slate-100">{player.name}</span>
                    {player.id === user?.id && (
                      <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                        voce
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-slate-500">{player.email}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                  player.is_online ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-800 text-slate-400"
                }`}>
                  {player.is_online ? "online" : "offline"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

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
