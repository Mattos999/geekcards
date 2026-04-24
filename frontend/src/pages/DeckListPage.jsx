import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { Layers, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function DeckListPage() {
  const [decks, setDecks] = useState([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    try { const { data } = await api.get("/decks"); setDecks(data); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  useEffect(() => { load(); }, []);

  const createDeck = async () => {
    if (!name.trim()) { toast.error("Dê um nome ao deck"); return; }
    setCreating(true);
    try {
      const { data } = await api.post("/decks", { name, description: "", card_ids: [] });
      toast.success("Deck criado");
      navigate(`/decks/${data.id}`);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setCreating(false); }
  };

  const deleteDeck = async (id) => {
    if (!window.confirm("Deletar este deck?")) return;
    try { await api.delete(`/decks/${id}`); toast.success("Deletado"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="text-sm uppercase tracking-[0.2em] text-indigo-400 mb-1">Arsenal</div>
        <h1 className="text-4xl font-bold" style={{ fontFamily: "Outfit" }}>Meus Decks</h1>
        <p className="text-slate-400 text-sm mt-1">{decks.length} deck{decks.length !== 1 ? "s" : ""} salvos</p>
      </div>

      {/* Quick create */}
      <div className="glass rounded-xl p-4 mb-6 flex gap-3">
        <input data-testid="new-deck-name" value={name} onChange={e => setName(e.target.value)} placeholder="Nome do novo deck..."
          onKeyDown={e => e.key === "Enter" && createDeck()}
          className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
        <button onClick={createDeck} disabled={creating} data-testid="create-deck-btn"
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 flex items-center gap-2 disabled:opacity-50">
          <Plus size={14} /> Criar
        </button>
      </div>

      {decks.length === 0 ? (
        <div className="glass rounded-xl p-16 text-center">
          <Layers className="mx-auto text-slate-600 mb-3" size={32} />
          <p className="text-slate-400">Nenhum deck ainda. Crie um acima!</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {decks.map(d => (
            <div key={d.id} data-testid={`deck-card-${d.id}`} className="glass rounded-xl p-5 hover:border-indigo-500/50 transition-colors group relative">
              <Link to={`/decks/${d.id}`} className="block">
                <h3 className="font-semibold mb-1 truncate pr-8" style={{ fontFamily: "Outfit" }}>{d.name}</h3>
                <p className="text-xs text-slate-500 line-clamp-2 mb-3 min-h-[2rem]">{d.description || "Sem descrição"}</p>
                <div className="flex items-center justify-between">
                  <div className="text-xs font-mono text-slate-400">{d.card_ids?.length || 0} / 20</div>
                  <div className={`text-xs px-2 py-0.5 rounded-full ${d.card_ids?.length === 20 ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-400"}`}>
                    {d.card_ids?.length === 20 ? "Completo" : "Em construção"}
                  </div>
                </div>
              </Link>
              <button onClick={() => deleteDeck(d.id)} className="absolute top-3 right-3 text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
