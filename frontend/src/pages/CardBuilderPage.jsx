import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { NATURES, NATURE_COLORS, CARD_TYPES, ENERGY_TYPES, computeEffectiveWeaknesses } from "../lib/natures";
import { GameCard } from "../components/GameCard";
import { EnergyCostSymbols } from "../components/EnergyCostSymbols";
import { normalizeAbilityEnergyCosts, sanitizeEnergyCosts, totalEnergyCost } from "../lib/energyCosts";
import {
  EFFECT_TYPES,
  EFFECT_CONDITION_LABELS,
  EFFECT_CONDITIONS,
  DURATION_LABELS,
  DURATIONS,
  TARGET_LABELS,
  TARGETS,
  effectSummary,
  effectTypeLabel,
  normalizeEffects,
} from "../lib/cardEffects";
import { Upload, Save, Trash2, X, Plus, Zap } from "lucide-react";
import { toast } from "sonner";

const BLANK = {
  name: "", card_type: "Personagem", natures: [], rarity: 0, is_alpha: false, is_evolution: false, evolution_number: "",
  evolves_from_card_id: "", evolves_from_name: "",
  hp: 100, recuo: 1, abilities: [], effects: [], passive_effects: [], speed: "", attach_to: "",
  energy_type: null, image_url: null, description: "",
  public_status: "private"
};

const BLANK_EFFECT = {
  type: EFFECT_TYPES.DAMAGE,
  target: TARGETS.OPPONENT_ACTIVE,
  duration: DURATIONS.INSTANT,
  amount: 0,
  energy_type: "",
  condition: EFFECT_CONDITIONS.ALWAYS,
};

const getEvolutionStage = card => {
  if (!card?.is_evolution) return 1;
  const stages = { I: 2, II: 2, III: 3, IV: 4 };
  return stages[String(card.evolution_number || "II").toUpperCase()] || 2;
};

const EffectControls = ({ effect, onChange, onAdd }) => (
  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_1fr_5rem_auto]">
    <select
      value={effect.type}
      onChange={e => onChange("type", e.target.value)}
      className="min-w-0 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
    >
      {Object.values(EFFECT_TYPES).map(type => (
        <option key={type} value={type}>{effectTypeLabel(type)}</option>
      ))}
    </select>
    <select
      value={effect.target}
      onChange={e => onChange("target", e.target.value)}
      className="min-w-0 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
    >
      {Object.values(TARGETS).map(target => (
        <option key={target} value={target}>{TARGET_LABELS[target]}</option>
      ))}
    </select>
    <select
      value={effect.duration || DURATIONS.INSTANT}
      onChange={e => onChange("duration", e.target.value)}
      className="min-w-0 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
    >
      {Object.values(DURATIONS).map(duration => (
        <option key={duration} value={duration}>{DURATION_LABELS[duration]}</option>
      ))}
    </select>
    <select
      value={effect.condition || EFFECT_CONDITIONS.ALWAYS}
      onChange={e => onChange("condition", e.target.value)}
      className="min-w-0 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
    >
      {Object.values(EFFECT_CONDITIONS).map(condition => (
        <option key={condition || "ALWAYS"} value={condition}>{EFFECT_CONDITION_LABELS[condition]}</option>
      ))}
    </select>
    <input
      type="number"
      min={0}
      value={effect.amount}
      onChange={e => onChange("amount", e.target.value)}
      className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none"
    />
    <button
      type="button"
      onClick={onAdd}
      className="inline-flex items-center justify-center rounded-lg border border-indigo-500/40 bg-indigo-500/20 px-3 text-xs text-indigo-200 hover:bg-indigo-500/30"
    >
      <Plus size={13} />
    </button>
  </div>
);

const EffectsList = ({ effects, onRemove }) => (
  normalizeEffects(effects).length > 0 && (
    <div className="flex flex-wrap gap-2">
      {normalizeEffects(effects).map((effect, idx) => (
        <button
          key={`${effect.type}-${effect.target}-${idx}`}
          type="button"
          onClick={() => onRemove(idx)}
          className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300 hover:border-rose-500/60 hover:text-rose-200"
        >
          {effectSummary(effect)}
          <X size={11} />
        </button>
      ))}
    </div>
  )
);

export default function CardBuilderPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [card, setCard] = useState(BLANK);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [abilityDraft, setAbilityDraft] = useState(null);
  const [editingAbilityIndex, setEditingAbilityIndex] = useState(null);
  const [evolutionOptions, setEvolutionOptions] = useState([]);
  const [cardEffectDraft, setCardEffectDraft] = useState(BLANK_EFFECT);
  const [passiveEffectDraft, setPassiveEffectDraft] = useState({
    ...BLANK_EFFECT,
    type: EFFECT_TYPES.BUFF_EQUIPPED_CARD_DAMAGE,
    target: TARGETS.EQUIPPED_CARD,
    condition: EFFECT_CONDITIONS.EQUIPPED_CARD_DEALS_DAMAGE,
  });

  useEffect(() => {
    if (id) (async () => {
      try {
        const { data } = await api.get(`/cards/${id}`);
        setCard(data);
      } catch (e) { toast.error(formatApiError(e)); }
    })();
  }, [id]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/cards");
        setEvolutionOptions(data);
      } catch (e) { toast.error(formatApiError(e)); }
    })();
  }, []);

  const set = (k, v) => setCard(c => ({ ...c, [k]: v }));

  const validEvolutionTargets = useMemo(() => {
    const previousStage = getEvolutionStage(card) - 1;
    return evolutionOptions.filter(option =>
      option.id !== id &&
      option.card_type === "Personagem" &&
      getEvolutionStage(option) === previousStage
    );
  }, [card, evolutionOptions, id]);

  const setEvolutionTarget = targetId => {
    const target = evolutionOptions.find(option => option.id === targetId);
    setCard(current => ({
      ...current,
      evolves_from_card_id: target?.id || "",
      evolves_from_name: target?.name || ""
    }));
  };

  const toggleNature = (n) => {
    setCard(c => {
      const has = c.natures.includes(n);
      if (has) return { ...c, natures: c.natures.filter(x => x !== n) };
      if (c.natures.length >= 3) { toast.error("Máximo de 3 naturezas"); return c; }
      return { ...c, natures: [...c.natures, n] };
    });
  };

  const buildAbilityDraft = (ability = {}) => ({
    name: ability.name || "",
    description: ability.description || "",
    damage: ability.damage ?? 0,
    energy_costs: normalizeAbilityEnergyCosts(ability),
    effects: normalizeEffects(ability.effects),
    effect_to_add: { ...BLANK_EFFECT, amount: ability.damage ?? 0 },
    energy_type_to_add: ENERGY_TYPES[0],
    energy_amount_to_add: 1
  });

  const openAbilityForm = () => setAbilityDraft(buildAbilityDraft());
  const cancelAbilityForm = () => {
  setAbilityDraft(null);
  setEditingAbilityIndex(null);
};

  const addDraftEnergyCost = () => {
    setAbilityDraft(d => {
      const amount = parseInt(d.energy_amount_to_add, 10) || 0;
      if (amount < 1) {
        toast.error("Quantidade de energia deve ser maior que zero");
        return d;
      }

      return {
        ...d,
        energy_costs: [
          ...sanitizeEnergyCosts(d.energy_costs),
          { energy_type: d.energy_type_to_add, amount }
        ],
        energy_amount_to_add: 1
      };
    });
  };

  const removeDraftEnergyCost = (idx) => {
    setAbilityDraft(d => ({
      ...d,
      energy_costs: sanitizeEnergyCosts(d.energy_costs).filter((_, i) => i !== idx)
    }));
  };

  const updateDraftEffect = (field, value) => {
    setAbilityDraft(d => ({
      ...d,
      effect_to_add: {
        ...(d.effect_to_add || BLANK_EFFECT),
        [field]: field === "amount" ? parseInt(value, 10) || 0 : value,
      }
    }));
  };

  const addDraftEffect = () => {
    setAbilityDraft(d => ({
      ...d,
      effects: [
        ...normalizeEffects(d.effects),
        {
          ...(d.effect_to_add || BLANK_EFFECT),
          duration: d.effect_to_add?.duration || DURATIONS.INSTANT,
          amount: parseInt(d.effect_to_add?.amount, 10) || 0,
        }
      ],
      effect_to_add: { ...BLANK_EFFECT },
    }));
  };

  const removeDraftEffect = idx => {
    setAbilityDraft(d => ({
      ...d,
      effects: normalizeEffects(d.effects).filter((_, i) => i !== idx)
    }));
  };

  const addCardEffect = (field, effect) => {
    setCard(c => ({
      ...c,
      [field]: [...normalizeEffects(c[field]), effect]
    }));
  };

  const removeCardEffect = (field, idx) => {
    setCard(c => ({
      ...c,
      [field]: normalizeEffects(c[field]).filter((_, i) => i !== idx)
    }));
  };

  const commitAbility = () => {
  if (!abilityDraft.name.trim()) { toast.error("Nome da habilidade é obrigatório"); return; }

  const energyCosts = sanitizeEnergyCosts(abilityDraft.energy_costs);
  const legacyEnergyCost = totalEnergyCost(energyCosts);
  const effects = normalizeEffects(abilityDraft.effects);
  const damage = effects.find(effect => effect.type === EFFECT_TYPES.DAMAGE)?.amount ?? (abilityDraft.damage ?? 0);

  if (editingAbilityIndex !== null) {
    // EDITAR habilidade existente
    setCard(c => {
      const updated = [...(c.abilities || [])];

      updated[editingAbilityIndex] = {
        name: abilityDraft.name.trim(),
        description: abilityDraft.description.trim(),
        damage,
        energy_cost: legacyEnergyCost,
        energy_costs: energyCosts,
        effects
      };

      return { ...c, abilities: updated };
    });

    setEditingAbilityIndex(null);

  } else {
    // ADICIONAR nova habilidade
    if ((card.abilities || []).length >= 3) {
      toast.error("Máximo de 3 habilidades");
      return;
    }

    setCard(c => ({
      ...c,
      abilities: [
        ...(c.abilities || []),
        {
          name: abilityDraft.name.trim(),
          description: abilityDraft.description.trim(),
          damage,
          energy_cost: legacyEnergyCost,
          energy_costs: energyCosts,
          effects
        }
      ]
    }));
  }

  setAbilityDraft(null);
};

  const removeAbility = (idx) => {
    setCard(c => ({ ...c, abilities: (c.abilities || []).filter((_, i) => i !== idx) }));
  };

  const editAbility = (idx) => {
  const ab = card.abilities[idx];

  setAbilityDraft(buildAbilityDraft(ab));

  setEditingAbilityIndex(idx);
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
    if (card.card_type === "Personagem" && card.is_evolution && !card.evolves_from_card_id) {
      toast.error("Escolha de qual carta esta evolucao vem");
      return;
    }
    setLoading(true);
    try {
      const payload = { ...card };
      if (payload.card_type !== "Energia") payload.energy_type = null;
      payload.effects = normalizeEffects(payload.effects);
      payload.passive_effects = normalizeEffects(payload.passive_effects);
      payload.abilities = (payload.abilities || []).map(ability => ({
        ...ability,
        effects: normalizeEffects(ability.effects),
      }));
      if (!payload.is_evolution) {
        payload.evolves_from_card_id = null;
        payload.evolves_from_name = null;
      } else {
        const target = evolutionOptions.find(option => option.id === payload.evolves_from_card_id);
        payload.evolves_from_name = target?.name || payload.evolves_from_name || "";
      }
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
                  {[0,1,2,3,4].map(r => <option key={r} value={r}>{r === 0 ? "Sem raridade" : `${r} ★`}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4 col-span-2">

  {/* Evolução + select */}
  <div>
    <label className="flex items-center gap-2 mb-3">
      <input
        type="checkbox"
        id="evolution"
        checked={card.is_evolution}
        onChange={e => {
          const checked = e.target.checked;
          setCard(current => ({
            ...current,
            is_evolution: checked,
            evolution_number: checked ? (current.evolution_number === "I" ? "II" : (current.evolution_number || "II")) : "",
            evolves_from_card_id: checked ? current.evolves_from_card_id : "",
            evolves_from_name: checked ? current.evolves_from_name : ""
          }));
        }}
        className="w-4 h-4 rounded"
      />
      <span className="text-sm">Evolução</span>
    </label>

    {card.is_evolution && (
      <div>
        <label className="block text-xs text-slate-400 mb-1.5">
          Nível de Evolução
        </label>
        <select
          value={card.evolution_number === "I" ? "II" : (card.evolution_number || "II")}
          onChange={e => setCard(current => ({
            ...current,
            evolution_number: e.target.value,
            evolves_from_card_id: "",
            evolves_from_name: ""
          }))}
          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2"
        >
          {["II", "III", "IV"].map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <label className="mt-3 block text-xs text-slate-400 mb-1.5">
          Evolui de
        </label>
        <select
          value={card.evolves_from_card_id || ""}
          onChange={e => setEvolutionTarget(e.target.value)}
          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2"
        >
          <option value="">Selecione a carta base</option>
          {validEvolutionTargets.map(option => (
            <option key={option.id} value={option.id}>{option.name}</option>
          ))}
        </select>
        {validEvolutionTargets.length === 0 && (
          <div className="mt-1 text-[11px] text-amber-300">
            Crie a carta do estagio anterior antes de vincular esta evolucao.
          </div>
        )}
      </div>
    )}
  </div>

  {/* Alpha */}
  <div>
    <label className="flex items-center gap-2 mb-3">
      <input
        type="checkbox"
        id="alpha"
        checked={card.is_alpha}
        onChange={e => set("is_alpha", e.target.checked)}
        className="w-4 h-4 rounded"
      />
      <span className="text-sm">Versão ALPHA</span>
    </label>
  </div>

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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">HP</label>
                  <input type="number" data-testid="card-hp-input" value={card.hp} onChange={e => set("hp", parseInt(e.target.value)||0)}
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

          {/* Abilities */}
          <section className="glass rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm uppercase tracking-widest text-slate-400">Habilidades</h3>
                <p className="text-xs text-slate-500 mt-0.5">{(card.abilities || []).length}/3 adicionadas</p>
              </div>
              <button
                type="button"
                data-testid="add-ability-btn"
                onClick={openAbilityForm}
                disabled={(card.abilities || []).length >= 3 || abilityDraft !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-200 text-xs disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <Plus size={12} /> Adicionar
              </button>
            </div>

            {/* Existing abilities list */}
            {(card.abilities || []).length > 0 && (
              <div className="space-y-2 mb-4">
                {(card.abilities || []).map((ab, idx) => (
                  <div key={idx} data-testid={`ability-item-${idx}`}
                    className="flex items-start gap-3 p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-indigo-300 truncate">{ab.name}</div>
                      {ab.description && (
                        <div className="text-xs text-slate-400 mt-0.5 leading-relaxed">{ab.description}</div>
                      )}
                      <div className="flex gap-3 mt-1 text-[10px] font-mono">
                        <span className="text-amber-400">⚔ {ab.damage ?? 0}</span>
                        <EnergyCostSymbols ability={ab} size="xs" />
                      </div>
                      {normalizeEffects(ab.effects).length > 0 && (
                        <div className="mt-1 text-[10px] text-slate-500">
                          {normalizeEffects(ab.effects).map(effectSummary).join(" | ")}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => editAbility(idx)}
                      className="shrink-0 text-slate-500 hover:text-indigo-400 transition-colors mt-0.5"
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      data-testid={`remove-ability-${idx}`}
                      onClick={() => removeAbility(idx)}
                      className="shrink-0 text-slate-500 hover:text-rose-400 transition-colors mt-0.5"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add ability inline form */}
            {abilityDraft !== null && (
              <div data-testid="ability-form" className="p-4 rounded-lg bg-slate-900/80 border border-indigo-500/30 space-y-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Nome da Habilidade</label>
                  <input
                    data-testid="ability-name-input"
                    value={abilityDraft.name}
                    onChange={e => setAbilityDraft(d => ({ ...d, name: e.target.value }))}
                    placeholder="Ex: Cura Rápida"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Dano</label>
                    <input
                      type="number"
                      value={abilityDraft.damage ?? 0}
                      onChange={e => setAbilityDraft(d => ({ ...d, damage: parseInt(e.target.value)||0 }))}
                      min={0}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-xs text-slate-400 flex items-center gap-1">
                      <Zap size={10} className="text-yellow-400" /> Custo de Energia
                    </label>
                    <EnergyCostSymbols costs={abilityDraft.energy_costs} showEmpty className="text-slate-400" />
                  </div>

                  <div className="grid grid-cols-[1fr_5rem_auto] gap-2">
                    <select
                      value={abilityDraft.energy_type_to_add}
                      onChange={e => setAbilityDraft(d => ({ ...d, energy_type_to_add: e.target.value }))}
                      className="min-w-0 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                    >
                      {ENERGY_TYPES.map(type => <option key={type}>{type}</option>)}
                    </select>
                    <input
                      type="number"
                      value={abilityDraft.energy_amount_to_add}
                      onChange={e => setAbilityDraft(d => ({ ...d, energy_amount_to_add: parseInt(e.target.value)||0 }))}
                      min={1}
                      className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={addDraftEnergyCost}
                      className="inline-flex items-center justify-center rounded-lg border border-indigo-500/40 bg-indigo-500/20 px-3 text-xs text-indigo-200 hover:bg-indigo-500/30"
                    >
                      <Plus size={13} />
                    </button>
                  </div>

                  {sanitizeEnergyCosts(abilityDraft.energy_costs).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {sanitizeEnergyCosts(abilityDraft.energy_costs).map((cost, idx) => (
                        <button
                          key={`${cost.energy_type}-${idx}`}
                          type="button"
                          onClick={() => removeDraftEnergyCost(idx)}
                          className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300 hover:border-rose-500/60 hover:text-rose-200"
                        >
                          <EnergyCostSymbols costs={[cost]} />
                          <X size={11} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Descrição</label>
                  <div className="mb-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-xs text-slate-400">Efeitos</label>
                      <span className="text-[10px] text-slate-500">{normalizeEffects(abilityDraft.effects).length} adicionados</span>
                    </div>
                    <EffectControls
                      effect={abilityDraft.effect_to_add || BLANK_EFFECT}
                      onChange={updateDraftEffect}
                      onAdd={addDraftEffect}
                    />
                    <EffectsList effects={abilityDraft.effects} onRemove={removeDraftEffect} />
                  </div>
                  <textarea
                    data-testid="ability-description-input"
                    value={abilityDraft.description}
                    onChange={e => setAbilityDraft(d => ({ ...d, description: e.target.value }))}
                    rows={3}
                    placeholder="Ex: Ao entrar em jogo, cura 20 HP..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none resize-none"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={cancelAbilityForm}
                    className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-600 transition-all">
                    Cancelar
                  </button>
                  <button type="button" data-testid="confirm-ability-btn" onClick={commitAbility}
                    className="px-3 py-1.5 rounded-lg text-xs bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 transition-all">
                    Confirmar
                  </button>
                </div>
              </div>
            )}

            {(card.abilities || []).length === 0 && abilityDraft === null && (
              <p className="text-xs text-slate-600 italic">Nenhuma habilidade adicionada.</p>
            )}
          </section>

          {["Item", "Mestre"].includes(card.card_type) && (
            <section className="glass rounded-xl p-6">
              <div className="mb-4">
                <h3 className="text-sm uppercase tracking-widest text-slate-400">Efeitos da Carta</h3>
                <p className="mt-1 text-xs text-slate-500">Usados quando a carta for jogada no duelo.</p>
              </div>
              <div className="space-y-3">
                <EffectControls
                  effect={cardEffectDraft}
                  onChange={(field, value) => setCardEffectDraft(current => ({
                    ...current,
                    [field]: field === "amount" ? parseInt(value, 10) || 0 : value,
                  }))}
                  onAdd={() => {
                    addCardEffect("effects", cardEffectDraft);
                    setCardEffectDraft({ ...BLANK_EFFECT });
                  }}
                />
                <EffectsList effects={card.effects} onRemove={idx => removeCardEffect("effects", idx)} />
              </div>
            </section>
          )}

          {card.card_type === "Equipamento" && (
            <section className="glass rounded-xl p-6">
              <div className="mb-4">
                <h3 className="text-sm uppercase tracking-widest text-slate-400">Equipamento</h3>
                <p className="mt-1 text-xs text-slate-500">Efeitos passivos ficam anexados ao personagem equipado.</p>
              </div>
              <div className="mb-4">
                <label className="block text-xs text-slate-400 mb-1.5">Anexar em</label>
                <select
                  value={card.attach_to || "SELF_CHARACTER"}
                  onChange={e => set("attach_to", e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2"
                >
                  <option value="SELF_CHARACTER">Seu personagem</option>
                </select>
              </div>
              <div className="space-y-3">
                <EffectControls
                  effect={passiveEffectDraft}
                  onChange={(field, value) => setPassiveEffectDraft(current => ({
                    ...current,
                    [field]: field === "amount" ? parseInt(value, 10) || 0 : value,
                  }))}
                  onAdd={() => {
                    addCardEffect("passive_effects", passiveEffectDraft);
                    setPassiveEffectDraft({
                      ...BLANK_EFFECT,
                      type: EFFECT_TYPES.BUFF_EQUIPPED_CARD_DAMAGE,
                      target: TARGETS.EQUIPPED_CARD,
                      condition: EFFECT_CONDITIONS.EQUIPPED_CARD_DEALS_DAMAGE,
                    });
                  }}
                />
                <EffectsList effects={card.passive_effects} onRemove={idx => removeCardEffect("passive_effects", idx)} />
              </div>
            </section>
          )}

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
                <button type="button" onClick={() => set("public_status", "pending")} data-testid   ="card-submit-public-btn"
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
