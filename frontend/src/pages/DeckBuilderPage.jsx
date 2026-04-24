import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { NATURES, NATURE_COLORS, CARD_TYPES } from "../lib/natures";
import { GameCard } from "../components/GameCard";
import { Save, Search, AlertTriangle, BarChart3, Plus, Minus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

export default function DeckBuilderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [deck, setDeck] = useState(null);
  const [library, setLibrary] = useState([]);
  const [cardIds, setCardIds] = useState([]);
  const [q, setQ] = useState("");
  const [natureFilter, setNatureFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [deckRes, libRes] = await Promise.all([
        api.get(`/decks/${id}`),
        api.get("/cards")
      ]);
      setDeck(deckRes.data.deck);
      setCardIds(deckRes.data.deck.card_ids || []);
      setLibrary(libRes.data);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const cardsById = useMemo(() => Object.fromEntries(library.map(c => [c.id, c])), [library]);

  const filteredLibrary = useMemo(() => library.filter(c => {
    if (q && !c.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (natureFilter && !(c.natures || []).includes(natureFilter)) return false;
    if (typeFilter && c.card_type !== typeFilter) return false;
    return true;
  }), [library, q, natureFilter, typeFilter]);

  const countInDeck = (cardId) => cardIds.filter(x => x === cardId).length;

  const addToDeck = (card) => {
    if (cardIds.length >= 20) { toast.error("Deck já tem 20 cartas"); return; }
    const existing = cardIds.filter(cid => {
      const c = cardsById[cid];
      return c && c.name === card.name;
    });
    if (existing.length >= 2) { toast.error(`Máximo 2 cartas "${card.name}"`); return; }
    setCardIds(prev => [...prev, card.id]);
  };

  const removeOne = (cardId) => {
    const idx = cardIds.lastIndexOf(cardId);
    if (idx === -1) return;
    setCardIds(prev => prev.filter((_, i) => i !== idx));
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/decks/${id}`, {
        name: deck.name, description: deck.description || "", card_ids: cardIds
      });
      toast.success("Deck salvo");
      await loadAnalysis();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  const loadAnalysis = async () => {
    try { const { data } = await api.get(`/decks/${id}/analysis`); setAnalysis(data); }
    catch {}
  };

  useEffect(() => { if (id && !loading) loadAnalysis(); /* eslint-disable-next-line */ }, [id, loading]);

  // Group deck cards by id -> {card, count}
  const deckGrouped = useMemo(() => {
    const m = new Map();
    cardIds.forEach(cid => {
      const c = cardsById[cid];
      if (!c) return;
      const key = cid;
      if (m.has(key)) m.get(key).count += 1;
      else m.set(key, { card: c, count: 1 });
    });
    return [...m.values()];
  }, [cardIds, cardsById]);

  // Validation warnings
  const warnings = useMemo(() => {
    const w = [];
    if (cardIds.length > 20) w.push(`Deck tem ${cardIds.length} cartas (máximo 20)`);
    const nameGroups = {};
    cardIds.forEach(cid => {
      const c = cardsById[cid];
      if (c) nameGroups[c.name] = (nameGroups[c.name] || 0) + 1;
    });
    Object.entries(nameGroups).forEach(([n, c]) => {
      if (c > 2) w.push(`'${n}' aparece ${c} vezes (máximo 2)`);
    });
    return w;
  }, [cardIds, cardsById]);

  if (loading || !deck) return <div className="p-8 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-400" /></div>;

  const radarData = NATURES.map(n => ({
    nature: n,
    cobertura: analysis?.coverage_against?.[n] || 0,
    vulnerabilidade: analysis?.vulnerable_to?.[n] || 0,
  }));

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-sm uppercase tracking-[0.2em] text-indigo-400 mb-1">Deck Builder</div>
          <input value={deck.name} onChange={e => setDeck({...deck, name: e.target.value})} data-testid="deck-name-input"
            className="text-3xl font-bold bg-transparent border-b-2 border-transparent focus:border-indigo-500 focus:outline-none w-full" style={{fontFamily:"Outfit"}} />
          <input value={deck.description || ""} onChange={e => setDeck({...deck, description: e.target.value})} data-testid="deck-description-input" placeholder="Descrição..."
            className="text-sm text-slate-400 bg-transparent border-b border-transparent focus:border-slate-700 focus:outline-none w-full mt-1" />
        </div>
        <div className="flex items-center gap-2">
          <div className={`font-mono text-sm px-3 py-1.5 rounded-lg ${cardIds.length === 20 ? "bg-emerald-500/20 text-emerald-300" : cardIds.length > 20 ? "bg-rose-500/20 text-rose-300" : "bg-slate-800 text-slate-300"}`} data-testid="deck-card-count">
            {cardIds.length} / 20
          </div>
          <button onClick={save} disabled={saving} data-testid="deck-save-btn"
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Salvar
          </button>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2 text-sm">
          <AlertTriangle className="text-amber-400 shrink-0" size={16} />
          <div className="text-amber-200">
            {warnings.map((w, i) => <div key={i}>{w}</div>)}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-12 gap-6">
        {/* Library */}
        <div className="lg:col-span-5">
          <div className="glass rounded-xl p-4">
            <h3 className="text-sm uppercase tracking-widest text-slate-400 mb-3">Biblioteca ({library.length})</h3>
            <div className="flex gap-2 mb-3">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input data-testid="library-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none" />
              </div>
            </div>
            <div className="flex gap-2 mb-3">
              <select value={natureFilter} onChange={e => setNatureFilter(e.target.value)} className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-sm">
                <option value="">Natureza</option>
                {NATURES.map(n => <option key={n}>{n}</option>)}
              </select>
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-sm">
                <option value="">Tipo</option>
                {CARD_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="max-h-[70vh] overflow-y-auto pr-1 space-y-2">
              {filteredLibrary.length === 0 && (
                <div className="text-center text-sm text-slate-500 p-4">
                  Nenhuma carta. <button onClick={() => navigate("/cards/new")} className="text-indigo-400">Criar carta</button>
                </div>
              )}
              {filteredLibrary.map(c => {
                const count = countInDeck(c.id);
                return (
                  <div key={c.id} className="flex items-center gap-3 p-2 rounded-lg bg-slate-900/50 hover:bg-slate-800/70 border border-slate-800">
                    <div className="w-10 h-14 rounded overflow-hidden shrink-0" style={{ background: c.natures?.[0] ? `${NATURE_COLORS[c.natures[0]]}33` : "#1E293B" }}>
                      {c.image_url ? <img src={require("../lib/api").imageUrl(c.image_url)} alt="" className="w-full h-full object-cover" /> : null}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{c.name}</div>
                      <div className="text-[10px] text-slate-500 truncate">
                        {c.card_type}{c.is_alpha ? " · ALPHA" : ""} {(c.natures || []).slice(0,2).join(" · ")}
                      </div>
                    </div>
                    {count > 0 && <div className="text-xs font-mono text-indigo-300 bg-indigo-500/20 px-1.5 rounded">×{count}</div>}
                    <button onClick={() => addToDeck(c)} data-testid={`add-card-${c.id}`}
                      className="p-1.5 rounded bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300">
                      <Plus size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Deck */}
        <div className="lg:col-span-4">
          <div className="glass rounded-xl p-4">
            <h3 className="text-sm uppercase tracking-widest text-slate-400 mb-3">Deck ({cardIds.length})</h3>
            <div className="max-h-[70vh] overflow-y-auto pr-1 space-y-2">
              {deckGrouped.length === 0 && (
                <div className="text-center text-sm text-slate-500 p-6">Adicione cartas da biblioteca →</div>
              )}
              {deckGrouped.map(({ card: c, count }) => (
                <div key={c.id} className="flex items-center gap-3 p-2 rounded-lg bg-slate-900/50 border border-slate-800">
                  <div className="w-10 h-14 rounded overflow-hidden shrink-0" style={{ background: c.natures?.[0] ? `${NATURE_COLORS[c.natures[0]]}33` : "#1E293B" }}>
                    {c.image_url ? <img src={require("../lib/api").imageUrl(c.image_url)} alt="" className="w-full h-full object-cover" /> : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    <div className="text-[10px] text-slate-500">{c.card_type}{c.is_alpha ? " · ALPHA" : ""}</div>
                  </div>
                  <button onClick={() => removeOne(c.id)} className="p-1 rounded bg-slate-800 hover:bg-rose-500/30 text-slate-400 hover:text-rose-300">
                    <Minus size={14} />
                  </button>
                  <div className="w-6 text-center text-xs font-mono">×{count}</div>
                  <button onClick={() => addToDeck(c)} className="p-1 rounded bg-slate-800 hover:bg-indigo-500/30 text-slate-400 hover:text-indigo-300">
                    <Plus size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Analysis */}
        <div className="lg:col-span-3">
          <div className="glass rounded-xl p-4 sticky top-4">
            <h3 className="text-sm uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
              <BarChart3 size={14} /> Análise
            </h3>
            {!analysis ? (
              <div className="text-xs text-slate-500 text-center p-4">Salve o deck para ver a análise.</div>
            ) : (
              <div className="space-y-4">
                {/* Stats */}
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-2 rounded bg-slate-900/50">
                    <div className="text-[10px] uppercase text-slate-500">HP Médio</div>
                    <div className="text-lg font-mono text-rose-400">{analysis.avg_hp}</div>
                  </div>
                  <div className="p-2 rounded bg-slate-900/50">
                    <div className="text-[10px] uppercase text-slate-500">Dano Médio</div>
                    <div className="text-lg font-mono text-amber-400">{analysis.avg_damage}</div>
                  </div>
                </div>

                {/* Radar */}
                <div>
                  <div className="text-[10px] uppercase text-slate-500 mb-1">Cobertura × Vulnerabilidade</div>
                  <div style={{ width: "100%", height: 260 }}>
                    <ResponsiveContainer>
                      <RadarChart data={radarData}>
                        <PolarGrid stroke="#334155" />
                        <PolarAngleAxis dataKey="nature" tick={{ fill: "#94A3B8", fontSize: 9 }} />
                        <PolarRadiusAxis tick={{ fill: "#475569", fontSize: 8 }} />
                        <Radar name="Cobertura" dataKey="cobertura" stroke="#22C55E" fill="#22C55E" fillOpacity={0.3} />
                        <Radar name="Vulnerável" dataKey="vulnerabilidade" stroke="#EF4444" fill="#EF4444" fillOpacity={0.3} />
                        <Tooltip contentStyle={{ background: "#0F172A", border: "1px solid #334155", fontSize: 11 }} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Types */}
                <div>
                  <div className="text-[10px] uppercase text-slate-500 mb-1">Distribuição de Tipos</div>
                  <div style={{ width: "100%", height: 120 }}>
                    <ResponsiveContainer>
                      <BarChart data={Object.entries(analysis.type_distribution).map(([k,v]) => ({type:k, count:v}))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="type" tick={{ fill: "#94A3B8", fontSize: 9 }} />
                        <YAxis tick={{ fill: "#94A3B8", fontSize: 9 }} />
                        <Tooltip contentStyle={{ background: "#0F172A", border: "1px solid #334155", fontSize: 11 }} />
                        <Bar dataKey="count" fill="#6366F1" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Top vulnerabilities */}
                <div>
                  <div className="text-[10px] uppercase text-slate-500 mb-1.5">Maiores vulnerabilidades</div>
                  <div className="space-y-1">
                    {Object.entries(analysis.vulnerable_to).filter(([,v]) => v > 0).sort((a,b) => b[1] - a[1]).slice(0, 3).map(([n, v]) => (
                      <div key={n} className="flex items-center justify-between text-xs">
                        <span className="nature-badge" style={{ background: `${NATURE_COLORS[n]}33`, color: NATURE_COLORS[n], borderColor: NATURE_COLORS[n] }}>{n}</span>
                        <span className="font-mono text-rose-400">{v}×</span>
                      </div>
                    ))}
                    {Object.values(analysis.vulnerable_to).every(v => v === 0) && (
                      <div className="text-xs text-slate-500">Nenhuma vulnerabilidade detectada</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
