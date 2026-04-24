import React, { useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { GameCard } from "../components/GameCard";
import { Shield, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AdminModerationPage() {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/pending-cards");
      setCards(data);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const act = async (card, action) => {
    setActing(card.id);
    try {
      await api.post(`/admin/cards/${card.id}/${action}`);
      toast.success(action === "approve" ? `"${card.name}" aprovada` : `"${card.name}" rejeitada`);
      setCards(prev => prev.filter(c => c.id !== card.id));
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setActing(null); }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="text-sm uppercase tracking-[0.2em] text-indigo-400 mb-1 flex items-center gap-2">
          <Shield size={14} /> Admin
        </div>
        <h1 className="text-4xl font-bold" style={{ fontFamily: "Outfit" }}>Moderação da Comunidade</h1>
        <p className="text-slate-400 mt-2 text-sm">{cards.length} carta{cards.length !== 1 ? "s" : ""} aguardando aprovação.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-16"><Loader2 className="animate-spin text-indigo-400" /></div>
      ) : cards.length === 0 ? (
        <div className="glass rounded-xl p-16 text-center">
          <Check className="mx-auto text-emerald-500 mb-3" size={32} />
          <p className="text-slate-400">Tudo em dia! Sem cartas pendentes.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {cards.map(c => (
            <div key={c.id} className="glass rounded-xl p-4" data-testid={`pending-card-${c.id}`}>
              <div className="flex flex-col items-center gap-3">
                <GameCard card={c} size="md" showStats />
                <div className="w-full text-center">
                  <div className="text-xs text-slate-500">Enviada por</div>
                  <div className="text-sm font-medium">{c.owner_name}</div>
                  <div className="text-[10px] text-slate-500">{c.owner_email}</div>
                </div>
                <div className="w-full grid grid-cols-2 gap-2">
                  <button onClick={() => act(c, "approve")} disabled={acting === c.id} data-testid={`approve-${c.id}`}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-sm transition-colors disabled:opacity-50">
                    <Check size={14} /> Aprovar
                  </button>
                  <button onClick={() => act(c, "reject")} disabled={acting === c.id} data-testid={`reject-${c.id}`}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 text-sm transition-colors disabled:opacity-50">
                    <X size={14} /> Rejeitar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
