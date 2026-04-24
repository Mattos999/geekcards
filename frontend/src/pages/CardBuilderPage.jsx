import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { NATURES, NATURE_COLORS, CARD_TYPES, ENERGY_TYPES, computeEffectiveWeaknesses } from "../lib/natures";
import { GameCard } from "../components/GameCard";
import { Upload, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";

const BLANK = {
  name: "", card_type: "Personagem", natures: [], rarity: 1, is_alpha: false,
  hp: 100, damage: 20, recuo: 1, abilities: "", energy_type: null, image_url: null, description: "",
  public_status: "private"
};

export default function CardBuilderPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [card, setCard] = useState(BLANK);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (id) (async () => {
      try {
        const { data } = await api.get(`/cards/${id}`);
        setCard(data);
      } catch (e) { toast.error(formatApiError(e)); }
    })();
  }, [id]);

  const set = (k, v) => setCard(c => ({ ...c, [k]: v }));

  const toggleNature = (n) => {
    setCard(c => {
      const has = c.natures.includes(n);
      if (has) return { ...c, natures: c.natures.filter(x => x !== n) };
      if (c.natures.length >= 3) { toast.error("Máximo de 3 naturezas"); return c; }
      return { ...c, natures: [...c.natures, n] };
    });
  };

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      set("image_url", data.url);
      toast.success("Imagem carregada");
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setUploading(false); }
  };

  const save = async () => {
    if (!card.name.trim()) { toast.error("Nome é obrigatório"); return; }
    setLoading(true);
    try {
      const payload = { ...card };
      if (payload.card_type !== "Energia") payload.energy_type = null;
      if (id) await api.put(`/cards/${id}`, payload);
      else await api.post("/cards", payload);
      toast.success(id ? "Carta atualizada" : "Carta criada");
      navigate("/cards");
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setLoading(false); }
  };

  const del = async () => {
    if (!id) return;
    if (!window.confirm("Deletar esta carta?")) return;
    try {
      await api.delete(`/cards/${id}`);
      toast.success("Carta deletada");
      navigate("/cards");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const weaknesses = computeEffectiveWeaknesses(card.natures);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="text-sm uppercase tracking-[0.2em] text-indigo-400 mb-1">{id ? "Editar" : "Nova"}</div>
          <h1 className="text-4xl font-bold" style={{ fontFamily: "Outfit" }}>Card Builder</h1>
        </div>
        <div className="flex gap-2">
          {id && (
            <button onClick={del} data-testid="card-delete-btn" className="px-4 py-2 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 flex items-center gap-2">
              <Trash2 size={14} /> Deletar
            </button>
          )}
          <button onClick={save} disabled={loading} data-testid="card-save-btn"
            className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 flex items-center gap-2 disabled:opacity-50">
            <Save size={14} /> {loading ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-8">
        {/* Form */}
        <div className="lg:col-span-3 space-y-6">
          {/* Basic */}
          <section className="glass rounded-xl p-6">
            <h3 className="text-sm uppercase tracking-widest text-slate-400 mb-4">Informações Básicas</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1.5">Nome</label>
                <input data-testid="card-name-input" value={card.name} onChange={e => set("name", e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 focus:border-indigo-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Tipo</label>
                <select data-testid="card-type-select" value={card.card_type} onChange={e => set("card_type", e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
                  {CARD_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Raridade</label>
                <select data-testid="card-rarity-select" value={card.rarity} onChange={e => set("rarity", parseInt(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
                  {[1,2,3].map(r => <option key={r} value={r}>{r} ★</option>)}
                </select>
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input type="checkbox" id="alpha" data-testid="card-alpha-checkbox" checked={card.is_alpha} onChange={e => set("is_alpha", e.target.checked)}
                  className="w-4 h-4 rounded" />
                <label htmlFor="alpha" className="text-sm">Versão ALPHA (mais poderosa, vale 2 vidas)</label>
              </div>
              {card.card_type === "Energia" && (
                <div className="col-span-2">
                  <label className="block text-xs text-slate-400 mb-1.5">Tipo de Energia</label>
                  <select value={card.energy_type || ""} onChange={e => set("energy_type", e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
                    <option value="">—</option>
                    {ENERGY_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              )}
            </div>
          </section>

          {/* Natures */}
          {card.card_type === "Personagem" && (
            <section className="glass rounded-xl p-6">
              <h3 className="text-sm uppercase tracking-widest text-slate-400 mb-2">Naturezas (até 3)</h3>
              <p className="text-xs text-slate-500 mb-4">{card.natures.length}/3 selecionadas</p>
              <div className="flex flex-wrap gap-2">
                {NATURES.map(n => {
                  const active = card.natures.includes(n);
                  return (
                    <button key={n} onClick={() => toggleNature(n)} data-testid={`nature-${n}`} type="button"
                      className="px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-all"
                      style={{
                        background: active ? NATURE_COLORS[n] : "transparent",
                        borderColor: NATURE_COLORS[n],
                        color: active ? "#fff" : NATURE_COLORS[n],
                      }}>{n}</button>
                  );
                })}
              </div>
              {weaknesses.length > 0 && (
                <div className="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs">
                  <span className="text-rose-300 font-semibold">Fraquezas efetivas: </span>
                  <span className="text-rose-200">{weaknesses.join(", ")}</span>
                </div>
              )}
            </section>
          )}

          {/* Stats */}
          {card.card_type === "Personagem" && (
            <section className="glass rounded-xl p-6">
              <h3 className="text-sm uppercase tracking-widest text-slate-400 mb-4">Stats</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">HP</label>
                  <input type="number" data-testid="card-hp-input" value={card.hp} onChange={e => set("hp", parseInt(e.target.value)||0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 font-mono" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Dano</label>
                  <input type="number" data-testid="card-damage-input" value={card.damage} onChange={e => set("damage", parseInt(e.target.value)||0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 font-mono" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Recuo</label>
                  <input type="number" data-testid="card-recuo-input" value={card.recuo} onChange={e => set("recuo", parseInt(e.target.value)||0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 font-mono" />
                </div>
              </div>
            </section>
          )}

          {/* Text */}
          <section className="glass rounded-xl p-6">
            <h3 className="text-sm uppercase tracking-widest text-slate-400 mb-4">Descrição / Habilidades</h3>
            <textarea data-testid="card-abilities-input" value={card.abilities} onChange={e => set("abilities", e.target.value)} rows={4}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 focus:border-indigo-500 focus:outline-none"
              placeholder="Ex: Ao entrar em jogo, cura 20 HP..." />
          </section>

          {/* Image */}
          <section className="glass rounded-xl p-6">
            <h3 className="text-sm uppercase tracking-widest text-slate-400 mb-4">Imagem</h3>
            <label className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 cursor-pointer w-fit">
              <Upload size={14} />
              <span className="text-sm">{uploading ? "Enviando..." : "Upload imagem"}</span>
              <input type="file" accept="image/*" className="hidden" onChange={upload} data-testid="card-image-upload" disabled={uploading} />
            </label>
            {card.image_url && (
              <div className="mt-3 flex items-center gap-2">
                <div className="text-xs text-slate-500">Imagem carregada</div>
                <button onClick={() => set("image_url", null)} className="text-slate-400 hover:text-rose-400">
                  <X size={14} />
                </button>
              </div>
            )}
          </section>

          {/* Community sharing */}
          <section className="glass rounded-xl p-6">
            <h3 className="text-sm uppercase tracking-widest text-slate-400 mb-4">Comunidade</h3>
            {card.public_status === "approved" ? (
              <div className="flex items-center gap-2 text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Aprovada — visível na biblioteca pública.
              </div>
            ) : card.public_status === "pending" ? (
              <div className="flex items-center gap-2 text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                Aguardando aprovação do admin.
              </div>
            ) : card.public_status === "rejected" ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-3">
                  <span className="w-2 h-2 rounded-full bg-rose-400" />
                  Rejeitada pelo admin.
                </div>
                <button type="button" onClick={() => set("public_status", "pending")} data-testid="card-submit-public-btn"
                  className="text-xs px-3 py-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-200">
                  Reenviar para aprovação
                </button>
              </div>
            ) : (
              <div>
                <p className="text-xs text-slate-500 mb-3">Envie para a biblioteca comunitária. Um admin irá revisar e aprovar.</p>
                <button type="button" onClick={() => set("public_status", "pending")} data-testid="card-submit-public-btn"
                  className="text-sm px-4 py-2 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-200">
                  Solicitar publicação
                </button>
              </div>
            )}
          </section>
        </div>

        {/* Preview */}
        <div className="lg:col-span-2">
          <div className="sticky top-8">
            <h3 className="text-sm uppercase tracking-widest text-slate-400 mb-4">Preview ao vivo</h3>
            <div className="flex justify-center">
              <GameCard card={{ ...card, id: "preview" }} size="lg" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
