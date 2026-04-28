import React, { useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { NATURES, NATURE_COLORS, CARD_TYPES, ENERGY_TYPES } from "../lib/natures";
import { EnergyCostSymbols } from "./EnergyCostSymbols";
import { normalizeAbilityEnergyCosts, sanitizeEnergyCosts, totalEnergyCost } from "../lib/energyCosts";
import { Loader2, X, Plus, Zap } from "lucide-react";
import { toast } from "sonner";

const BLANK_ABILITY = { name: "", description: "", damage: 0, energy_cost: 0, energy_costs: [] };

export function EditCommunityCardModal({ card, onClose, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (!card) return;
    setForm({
      name: card.name || "",
      card_type: card.card_type || "Personagem",
      natures: card.natures || [],
      rarity: card.rarity ?? 1,
      is_alpha: card.is_alpha || false,
      is_evolution: card.is_evolution || false,
      evolution_number: card.evolution_number || "",
      hp: card.hp ?? 0,
      recuo: card.recuo ?? 0,
      abilities: (card.abilities || []).map(ab => ({
        name: ab.name || "",
        description: ab.description || "",
        damage: ab.damage ?? 0,
        energy_cost: ab.energy_cost ?? 0,
        energy_costs: normalizeAbilityEnergyCosts(ab),
        energy_type_to_add: ENERGY_TYPES[0],
        energy_amount_to_add: 1,
      })),
      energy_type: card.energy_type || "",
      image_url: card.image_url || "",
      description: card.description || "",
      public_status: card.public_status || "approved",
    });
  }, [card]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleNature = (nature) => {
    const list = form.natures.includes(nature)
      ? form.natures.filter(n => n !== nature)
      : form.natures.length >= 3
        ? (toast.error("Máximo 3 naturezas"), form.natures)
        : [...form.natures, nature];
    set("natures", list);
  };

  const updateAbility = (i, field, value) => {
    const list = [...form.abilities];
    const next = { ...list[i], [field]: value };
    if (field === "energy_costs") {
      next.energy_cost = totalEnergyCost(value);
    }
    list[i] = next;
    set("abilities", list);
  };

  const addAbilityEnergyCost = (i) => {
    const ability = form.abilities[i];
    const amount = parseInt(ability.energy_amount_to_add, 10) || 0;

    if (amount < 1) {
      toast.error("Quantidade de energia deve ser maior que zero");
      return;
    }

    const energyCosts = [
      ...sanitizeEnergyCosts(ability.energy_costs),
      {
        energy_type: ability.energy_type_to_add || ENERGY_TYPES[0],
        amount,
      },
    ];

    const list = [...form.abilities];
    list[i] = {
      ...ability,
      energy_costs: energyCosts,
      energy_cost: totalEnergyCost(energyCosts),
      energy_amount_to_add: 1,
    };
    set("abilities", list);
  };

  const removeAbilityEnergyCost = (abilityIndex, costIndex) => {
    const ability = form.abilities[abilityIndex];
    updateAbility(
      abilityIndex,
      "energy_costs",
      sanitizeEnergyCosts(ability.energy_costs).filter((_, idx) => idx !== costIndex)
    );
  };

  const addAbility = () => {
    if (form.abilities.length >= 3) { toast.error("Máximo 3 habilidades"); return; }
    set("abilities", [
      ...form.abilities,
      {
        ...BLANK_ABILITY,
        energy_type_to_add: ENERGY_TYPES[0],
        energy_amount_to_add: 1,
      }
    ]);
  };

  const removeAbility = (i) => {
    set("abilities", form.abilities.filter((_, idx) => idx !== i));
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        evolution_number: form.is_evolution ? (form.evolution_number || null) : null,
        abilities: form.abilities.map(({
          energy_type_to_add,
          energy_amount_to_add,
          ...ability
        }) => ({
          ...ability,
          energy_costs: sanitizeEnergyCosts(ability.energy_costs),
          energy_cost: totalEnergyCost(ability.energy_costs),
        })),
      };

      await api.put(`/admin/cards/${card.id}/edit`, payload);
      toast.success("Carta atualizada");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSaving(false);
    }
  };

  if (!card || !form) return null;

  const inputCls = "w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none";
  const labelCls = "block text-xs text-slate-400 mb-1";

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="glass rounded-xl p-6 w-full max-w-xl my-auto space-y-4">

        {/* Header */}
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-bold">Editar Carta</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>

        {/* Nome */}
        <div>
          <label className={labelCls}>Nome</label>
          <input value={form.name} onChange={e => set("name", e.target.value)} className={inputCls} />
        </div>

        {/* Tipo + Raridade */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Tipo</label>
            <select value={form.card_type} onChange={e => set("card_type", e.target.value)} className={inputCls}>
              {CARD_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Raridade</label>
            <select value={form.rarity} onChange={e => set("rarity", parseInt(e.target.value))} className={inputCls}>
              {[1,2,3,4].map(r => <option key={r} value={r}>{r} ★</option>)}
            </select>
          </div>
        </div>

        

        <div className="grid grid-cols-2 gap-3">

        {/* Evolução */}
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_evolution}
            onChange={e => set("is_evolution", e.target.checked)}
            className="w-4 h-4 rounded"
          />
          Evolução
        </label>

        {/* Alpha */}
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_alpha}
            onChange={e => set("is_alpha", e.target.checked)}
            className="w-4 h-4 rounded"
          />
          Versão ALPHA
        </label>

        {/* Select abaixo da Evolução */}
        {form.is_evolution && (
        <div>
          <label className={labelCls}>Nível de Evolução</label>
          <select
            value={form.evolution_number}
            onChange={e => set("evolution_number", e.target.value)}
            className={inputCls}
          >
            {["", "I", "II", "III", "IV"].map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      )}

      </div>

        

        {/* Tipo de Energia */}
        {form.card_type === "Energia" && (
          <div>
            <label className={labelCls}>Tipo de Energia</label>
            <select value={form.energy_type || ""} onChange={e => set("energy_type", e.target.value)} className={inputCls}>
              <option value="">—</option>
              {ENERGY_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
        )}

        {/* Naturezas */}
        {form.card_type === "Personagem" && (
          <div>
            <label className={labelCls}>Naturezas (até 3)</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {NATURES.map(n => {
                const active = form.natures.includes(n);
                return (
                  <button key={n} type="button" onClick={() => toggleNature(n)}
                    className="px-3 py-1 rounded-full text-xs font-semibold border-2 transition-all"
                    style={{
                      background: active ? NATURE_COLORS[n] : "transparent",
                      borderColor: NATURE_COLORS[n],
                      color: active ? "#fff" : NATURE_COLORS[n],
                    }}>{n}</button>
                );
              })}
            </div>
          </div>
        )}

        {/* HP + Recuo */}
        {form.card_type === "Personagem" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>HP</label>
              <input type="number" value={form.hp} onChange={e => set("hp", parseInt(e.target.value)||0)} className={inputCls + " font-mono"} />
            </div>
            <div>
              <label className={labelCls}>Recuo</label>
              <input type="number" value={form.recuo} onChange={e => set("recuo", parseInt(e.target.value)||0)} className={inputCls + " font-mono"} />
            </div>
          </div>
        )}

        {/* Habilidades */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className={labelCls}>Habilidades ({form.abilities.length}/3)</label>
            <button type="button" onClick={addAbility} disabled={form.abilities.length >= 3}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-200 disabled:opacity-40">
              <Plus size={11} /> Adicionar
            </button>
          </div>
          <div className="space-y-3">
            {form.abilities.map((ab, i) => (
              <div key={i} className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-indigo-300 font-semibold">Habilidade {i + 1}</span>
                  <button type="button" onClick={() => removeAbility(i)} className="text-slate-500 hover:text-rose-400"><X size={13} /></button>
                </div>
                <input value={ab.name} onChange={e => updateAbility(i, "name", e.target.value)}
                  placeholder="Nome" className={inputCls} />
                <div className="grid grid-cols-1 gap-2">
                  <div>
                    <label className={labelCls}>Dano</label>
                    <input type="number" value={ab.damage ?? 0} min={0}
                      onChange={e => updateAbility(i, "damage", parseInt(e.target.value)||0)}
                      className={inputCls + " font-mono"} />
                  </div>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <label className={labelCls + " flex items-center gap-1 mb-0"}><Zap size={9} className="text-yellow-400" /> Custo Energia</label>
                    <EnergyCostSymbols costs={ab.energy_costs} showEmpty className="text-slate-400" />
                  </div>

                  <div className="grid grid-cols-[1fr_4.5rem_auto] gap-2">
                    <select
                      value={ab.energy_type_to_add || ENERGY_TYPES[0]}
                      onChange={e => updateAbility(i, "energy_type_to_add", e.target.value)}
                      className={inputCls}
                    >
                      {ENERGY_TYPES.map(type => <option key={type}>{type}</option>)}
                    </select>
                    <input
                      type="number"
                      value={ab.energy_amount_to_add ?? 1}
                      min={1}
                      onChange={e => updateAbility(i, "energy_amount_to_add", parseInt(e.target.value)||0)}
                      className={inputCls + " font-mono"}
                    />
                    <button
                      type="button"
                      onClick={() => addAbilityEnergyCost(i)}
                      className="rounded-lg border border-indigo-500/40 bg-indigo-500/20 px-3 text-indigo-200 hover:bg-indigo-500/30"
                    >
                      <Plus size={13} />
                    </button>
                  </div>

                  {sanitizeEnergyCosts(ab.energy_costs).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {sanitizeEnergyCosts(ab.energy_costs).map((cost, costIndex) => (
                        <button
                          key={`${cost.energy_type}-${costIndex}`}
                          type="button"
                          onClick={() => removeAbilityEnergyCost(i, costIndex)}
                          className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300 hover:border-rose-500/60 hover:text-rose-200"
                        >
                          <EnergyCostSymbols costs={[cost]} />
                          <X size={11} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <textarea value={ab.description} onChange={e => updateAbility(i, "description", e.target.value)}
                  placeholder="Descrição" rows={2}
                  className={inputCls + " resize-none"} />
              </div>
            ))}
          </div>
        </div>

        {/* Status */}
        <div>
          <label className={labelCls}>Status</label>
          <select value={form.public_status} onChange={e => set("public_status", e.target.value)} className={inputCls}>
            <option value="approved">Aprovada</option>
            <option value="pending">Pendente</option>
            <option value="rejected">Rejeitada</option>
            <option value="private">Privada</option>
          </select>
        </div>

        
        {/* Salvar */}
        <button onClick={save} disabled={saving}
          className="w-full bg-indigo-600 hover:bg-indigo-500 py-2 rounded-lg flex items-center justify-center disabled:opacity-50">
          {saving ? <Loader2 size={16} className="animate-spin" /> : "Salvar"}
        </button>

      </div>
    </div>
  );
}
