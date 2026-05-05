import React, { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { NATURES, NATURE_COLORS, CARD_TYPES, ENERGY_TYPES } from "../lib/natures";
import { EnergyCostSymbols } from "./EnergyCostSymbols";
import { normalizeAbilityEnergyCosts, sanitizeEnergyCosts, totalEnergyCost } from "../lib/energyCosts";
import {
  ABILITY_CONDITION_LABELS,
  ABILITY_CONDITION_TYPES,
  ABILITY_POSITION_OPTIONS,
  ABILITY_TRIGGER_LABELS,
  ABILITY_TRIGGERS,
  CARD_META_AGES,
  CARD_META_AGE_LABELS,
  CARD_META_KEYS,
  COMMON_META_ELEMENTS,
  COMMON_META_STYLES,
  COMMON_META_WEAPONS,
  DURATIONS,
  DURATION_LABELS,
  EFFECT_CONDITIONS,
  EFFECT_CONDITION_LABELS,
  EFFECT_TYPE_OPTIONS,
  EFFECT_TYPES,
  TARGETS,
  TARGET_LABELS,
  abilityConditionValueLabel,
  advancedEffectExtraFields,
  effectSummary,
  normalizeCardMeta,
  normalizeAbilityConditions,
  normalizeAbilityRules,
  normalizeEquipmentPassiveEffects,
  normalizeEffects,
  ruleSummary,
} from "../lib/cardEffects";
import { Loader2, X, Plus, Zap, Upload } from "lucide-react";
import { toast } from "sonner";

const BLANK_ABILITY = { name: "", description: "", damage: 0, energy_cost: 0, energy_costs: [] };
const normalizeEvolutionNumber = value => value === "I" ? "II" : (typeof value === "string" ? value : "");
const MAX_ADDITIONAL_INFO = 10;
const normalizeAdditionalInfo = info => (
  Array.isArray(info)
    ? info
        .slice(0, MAX_ADDITIONAL_INFO)
        .map(item => ({
          label: String(item?.label || "").trim(),
          value: String(item?.value || "").trim(),
        }))
        .filter(item => item.label || item.value)
    : []
);
const toggleListValue = (list, value) => (
  (list || []).includes(value)
    ? (list || []).filter(item => item !== value)
    : [...(list || []), value]
);
const BLANK_EFFECT = {
  type: EFFECT_TYPES.DAMAGE,
  target: TARGETS.OPPONENT_ACTIVE,
  duration: DURATIONS.INSTANT,
  amount: 0,
  attribute: "",
  energy_type: "",
  nature: "",
  card_name: "",
  tag: "",
  condition: EFFECT_CONDITIONS.ALWAYS,
  ...advancedEffectExtraFields,
};

const BLANK_RULE_CONDITION = {
  type: ABILITY_CONDITION_TYPES.SOURCE_POSITION,
  value: "ACTIVE",
};

const BLANK_RULE = {
  trigger: ABILITY_TRIGGERS.ON_ATTACK,
  conditions: [],
  effects: [],
  duration: DURATIONS.INSTANT,
  condition_to_add: BLANK_RULE_CONDITION,
  effect_to_add: BLANK_EFFECT,
};

const makeBlankRule = () => ({
  ...BLANK_RULE,
  conditions: [],
  effects: [],
  condition_to_add: { ...BLANK_RULE_CONDITION },
  effect_to_add: { ...BLANK_EFFECT },
});

const POSITION_CONDITION_TYPES = new Set([
  ABILITY_CONDITION_TYPES.SOURCE_POSITION,
  ABILITY_CONDITION_TYPES.TARGET_POSITION,
]);
const NATURE_CONDITION_TYPES = new Set([
  ABILITY_CONDITION_TYPES.TARGET_NATURE_IN,
  ABILITY_CONDITION_TYPES.SOURCE_NATURE_IN,
  ABILITY_CONDITION_TYPES.BENCH_HAS_NATURE,
]);
const CARD_TYPE_CONDITION_TYPES = new Set([
  ABILITY_CONDITION_TYPES.TARGET_CARD_TYPE_IN,
  ABILITY_CONDITION_TYPES.SOURCE_CARD_TYPE_IN,
]);
const NUMBER_CONDITION_TYPES = new Set([
  ABILITY_CONDITION_TYPES.SELF_ENERGY_COUNT_GTE,
  ABILITY_CONDITION_TYPES.TARGET_ENERGY_COUNT_GTE,
  ABILITY_CONDITION_TYPES.DAMAGE_AMOUNT_GTE,
]);
const NO_VALUE_CONDITION_TYPES = new Set([
  ABILITY_CONDITION_TYPES.TARGET_IS_DAMAGED,
  ABILITY_CONDITION_TYPES.HAS_EQUIPMENT,
  ABILITY_CONDITION_TYPES.WOULD_BE_KNOCKED_OUT,
  ABILITY_CONDITION_TYPES.ONCE_PER_TURN,
]);
const META_CONDITION_TYPES = new Set([
  ABILITY_CONDITION_TYPES.SOURCE_META_VALUE_IN,
  ABILITY_CONDITION_TYPES.TARGET_META_VALUE_IN,
]);

const defaultRuleConditionValue = type => {
  if (POSITION_CONDITION_TYPES.has(type)) return ABILITY_POSITION_OPTIONS[0]?.value || "ACTIVE";
  if (NATURE_CONDITION_TYPES.has(type) || CARD_TYPE_CONDITION_TYPES.has(type)) return [];
  if (type === ABILITY_CONDITION_TYPES.SELF_HAS_ENERGY_TYPE) return ENERGY_TYPES[0] || "";
  if (NUMBER_CONDITION_TYPES.has(type)) return 1;
  if (type === ABILITY_CONDITION_TYPES.BENCH_HAS_CARD_NAME) return "";
  if (META_CONDITION_TYPES.has(type)) return { key: CARD_META_KEYS[0], values: [] };
  return "";
};

const normalizeRuleConditionDraft = condition => {
  const type = condition?.type || ABILITY_CONDITION_TYPES.SOURCE_POSITION;
  const fallback = defaultRuleConditionValue(type);
  const value = condition?.value;
  return {
    type,
    value: value === undefined || value === null || (value === "" && fallback !== "") ? fallback : value,
  };
};

const RuleConditionValueControl = ({ condition, onChange, className }) => {
  const draft = normalizeRuleConditionDraft(condition);

  if (POSITION_CONDITION_TYPES.has(draft.type)) {
    return (
      <select value={draft.value || ABILITY_POSITION_OPTIONS[0]?.value || "ACTIVE"} onChange={e => onChange(e.target.value)} className={className}>
        {ABILITY_POSITION_OPTIONS.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    );
  }

  if (NATURE_CONDITION_TYPES.has(draft.type)) {
    const selected = Array.isArray(draft.value)
      ? draft.value
      : String(draft.value || "").split(",").map(item => item.trim()).filter(Boolean);
    return (
      <select
        multiple
        value={selected}
        onChange={e => onChange(Array.from(e.target.selectedOptions).map(option => option.value))}
        className={`${className} min-h-[7rem]`}
      >
        {NATURES.map(nature => <option key={nature} value={nature}>{nature}</option>)}
      </select>
    );
  }

  if (CARD_TYPE_CONDITION_TYPES.has(draft.type)) {
    const selected = Array.isArray(draft.value)
      ? draft.value
      : String(draft.value || "").split(",").map(item => item.trim()).filter(Boolean);
    return (
      <select multiple value={selected} onChange={e => onChange(Array.from(e.target.selectedOptions).map(option => option.value))} className={`${className} min-h-[7rem]`}>
        {CARD_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
      </select>
    );
  }

  if (draft.type === ABILITY_CONDITION_TYPES.SELF_HAS_ENERGY_TYPE) {
    return (
      <select value={draft.value || ENERGY_TYPES[0] || ""} onChange={e => onChange(e.target.value)} className={className}>
        {ENERGY_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
      </select>
    );
  }

  if (NUMBER_CONDITION_TYPES.has(draft.type)) {
    return (
      <input type="number" min={0} value={draft.value ?? 1} onChange={e => onChange(parseInt(e.target.value, 10) || 0)} className={`${className} font-mono`} />
    );
  }

  if (draft.type === ABILITY_CONDITION_TYPES.BENCH_HAS_CARD_NAME) {
    return <input value={draft.value || ""} onChange={e => onChange(e.target.value)} placeholder="Nome da carta" className={className} />;
  }

  if (META_CONDITION_TYPES.has(draft.type)) {
    const value = typeof draft.value === "object" && !Array.isArray(draft.value) ? draft.value : { key: CARD_META_KEYS[0], values: [] };
    return (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <select value={value.key || CARD_META_KEYS[0]} onChange={e => onChange({ ...value, key: e.target.value })} className={className}>
          {CARD_META_KEYS.map(key => <option key={key} value={key}>{key}</option>)}
        </select>
        <input value={Array.isArray(value.values) ? value.values.join(", ") : ""} onChange={e => onChange({ ...value, values: e.target.value.split(",").map(item => item.trim().toUpperCase()).filter(Boolean) })} placeholder="Valores separados por virgula" className={className} />
      </div>
    );
  }

  if (NO_VALUE_CONDITION_TYPES.has(draft.type)) {
    return (
      <div className="flex h-10 items-center rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-slate-500">
        Sem valor
      </div>
    );
  }

  return (
    <div className="flex h-10 items-center rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-slate-500">
      Sem valor
    </div>
  );
};
const EFFECT_ATTRIBUTES = [
  { value: "hp", label: "HP" },
  { value: "damage", label: "Dano" },
  { value: "recuo", label: "Recuo" },
  { value: "cura", label: "Cura" },
];
const EFFECT_FIELD_CONFIG = {
  [EFFECT_TYPES.DAMAGE]: ["target", "amount"],
  [EFFECT_TYPES.HEAL]: ["target", "amount"],
  [EFFECT_TYPES.ADD_TYPED_ENERGY]: ["target", "energy_type", "amount"],
  [EFFECT_TYPES.ADD_ENERGY]: ["target", "amount"],
  [EFFECT_TYPES.ADD_MULTIPLE_ENERGY]: ["target", "energy_type", "amount"],
  [EFFECT_TYPES.DAMAGE_RANDOM_TARGETS]: ["target", "amount", "random_targets_count"],
  [EFFECT_TYPES.DAMAGE_ANY_TARGET]: ["target", "amount", "allow_manual_target"],
  [EFFECT_TYPES.DAMAGE_EXTRA_BY_TARGET_TYPE]: ["target", "nature", "natures", "tag", "tags", "amount", "duration"],
  [EFFECT_TYPES.DAMAGE_EXTRA_BY_BENCH_CARD]: ["target", "card_name", "nature", "amount", "per_count"],
  [EFFECT_TYPES.DAMAGE_EXTRA_BY_ENERGY]: ["target", "amount", "per_energy_amount", "energy_owner", "energy_type"],
  [EFFECT_TYPES.DAMAGE_EXTRA_BY_DICE]: ["target", "amount", "dice_threshold", "comparison", "roll_count_source"],
  [EFFECT_TYPES.DAMAGE_EXTRA_BY_COIN]: ["target", "amount", "success_amount"],
  [EFFECT_TYPES.DAMAGE_CONSECUTIVE_STACK]: ["target", "amount", "stack_key", "reset_on_miss"],
  [EFFECT_TYPES.DAMAGE_SPLIT]: ["target", "amount", "split_mode"],
  [EFFECT_TYPES.BUFF_BASE_ATTRIBUTES]: ["target", "attribute", "amount", "duration"],
  [EFFECT_TYPES.BUFF_DAMAGE_BY_TAG]: ["target", "tag", "tags", "amount", "duration", "applies_to_tag"],
  [EFFECT_TYPES.BUFF_DAMAGE_BY_ATTACHED_ENERGY]: ["target", "energy_type", "amount", "per_energy_amount", "energy_owner", "duration"],
  [EFFECT_TYPES.DOUBLE_DAMAGE_AGAINST_TYPE]: ["target", "nature", "duration"],
  [EFFECT_TYPES.TAKE_DAMAGE_INSTEAD]: [],
  [EFFECT_TYPES.WEAKNESS_OVERRIDE]: ["target", "nature", "duration"],
  [EFFECT_TYPES.ENERGY_REQUIRED_TYPE]: ["target", "energy_type", "duration"],
  [EFFECT_TYPES.REMOVE_ENERGY]: ["target", "amount", "energy_type"],
  [EFFECT_TYPES.REMOVE_RANDOM_ENERGY]: ["target", "amount", "random"],
  [EFFECT_TYPES.IF_BENCH_HAS_CARD]: ["card_name"],
  [EFFECT_TYPES.IF_TARGET_NATURE]: ["target", "nature"],
  [EFFECT_TYPES.IF_TARGET_TAG]: ["target", "tag"],
  [EFFECT_TYPES.IF_SELF_HAS_ENERGY_COUNT]: ["energy_type", "amount"],
  [EFFECT_TYPES.IF_BENCH_COUNT_BY_NATURE]: ["nature", "amount"],
  [EFFECT_TYPES.BUFF_EQUIPPED_CARD_DAMAGE]: ["target", "amount", "condition"],
  [EFFECT_TYPES.SEARCH_CARD_BY_FILTER]: ["amount", "filter_type", "nature", "card_type", "card_name", "random"],
  [EFFECT_TYPES.RETURN_KNOCKED_OUT_TO_HAND]: ["target"],
  [EFFECT_TYPES.PREVENT_POINT_GAIN]: ["target", "duration"],
  [EFFECT_TYPES.CANCEL_KNOCKOUT_POINT]: ["target", "duration"],
  [EFFECT_TYPES.POISON]: ["target", "amount", "duration"],
  [EFFECT_TYPES.DAMAGE_OVER_TIME]: ["target", "amount", "duration"],
  [EFFECT_TYPES.IMMUNE_TO_DAMAGE_TYPE]: ["target", "nature", "tag", "damage_type", "duration", "applies_to"],
  [EFFECT_TYPES.INSTANT_KNOCKOUT_IF_DAMAGE_TYPE]: ["target", "nature", "tag", "damage_type", "duration"],
  [EFFECT_TYPES.COUNTER_DAMAGE]: ["target", "amount", "duration"],
  [EFFECT_TYPES.STATUS_ON_ATTACKER]: ["target", "tag", "duration"],
  [EFFECT_TYPES.TRANSFORM_INTO_OPPONENT_BENCH_CARD]: ["target", "keep_negative_effects"],
  [EFFECT_TYPES.ABSORB_OWN_BENCH_CARD]: ["target", "absorb_hp", "absorb_damage", "absorb_energy"],
  [EFFECT_TYPES.CREATE_TEMPORARY_UNIT]: ["card_name", "amount", "temporary_hp", "duration"],
  [EFFECT_TYPES.PLAY_ITEM_AS_UNIT]: ["target", "temporary_hp", "duration"],
  [EFFECT_TYPES.DISCARD_EQUIPMENT_AFTER_TRIGGER]: ["target", "condition"],
};
const DEFAULT_EFFECT_FIELDS = ["target", "amount", "duration"];

const effectFieldsFor = type => EFFECT_FIELD_CONFIG[type] || DEFAULT_EFFECT_FIELDS;

const sanitizeEffectDraft = effect => {
  const fields = effectFieldsFor(effect?.type);
  return {
    ...(effect || BLANK_EFFECT),
    duration: effect?.duration || DURATIONS.INSTANT,
    amount: parseInt(effect?.amount, 10) || 0,
    condition: fields.includes("condition") ? (effect?.condition || EFFECT_CONDITIONS.ALWAYS) : EFFECT_CONDITIONS.ALWAYS,
  };
};

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

const EffectControls = ({ effect, onChange, onAdd }) => {
  const inputCls = "w-full min-w-0 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none";
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="min-w-0 sm:col-span-2">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Efeito</span>
          <select value={effect.type} onChange={e => onChange("type", e.target.value)} className={inputCls}>
            {EFFECT_TYPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="min-w-0">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Alvo</span>
          <select value={effect.target || TARGETS.OPPONENT_ACTIVE} onChange={e => onChange("target", e.target.value)} className={inputCls}>
            {Object.values(TARGETS).map(target => <option key={target} value={target}>{TARGET_LABELS[target]}</option>)}
          </select>
        </label>
        <label className="min-w-0">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Valor</span>
          <input type="number" min={0} value={effect.amount ?? 0} onChange={e => onChange("amount", e.target.value)} className={`${inputCls} font-mono`} />
        </label>
        <label className="min-w-0">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Duração</span>
          <select value={effect.duration || DURATIONS.INSTANT} onChange={e => onChange("duration", e.target.value)} className={inputCls}>
            {Object.values(DURATIONS).map(duration => <option key={duration} value={duration}>{DURATION_LABELS[duration]}</option>)}
          </select>
        </label>
        <label className="min-w-0">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Condição</span>
          <select value={effect.condition || EFFECT_CONDITIONS.ALWAYS} onChange={e => onChange("condition", e.target.value)} className={inputCls}>
            {Object.values(EFFECT_CONDITIONS).map(condition => <option key={condition || "ALWAYS"} value={condition}>{EFFECT_CONDITION_LABELS[condition]}</option>)}
          </select>
        </label>
        <label className="min-w-0">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Natureza</span>
          <select value={effect.nature || ""} onChange={e => onChange("nature", e.target.value)} className={inputCls}>
            <option value="">Qualquer</option>
            {NATURES.map(nature => <option key={nature} value={nature}>{nature}</option>)}
          </select>
        </label>
        <label className="min-w-0">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Energia</span>
          <select value={effect.energy_type || ""} onChange={e => onChange("energy_type", e.target.value)} className={inputCls}>
            <option value="">Qualquer</option>
            {ENERGY_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label className="min-w-0">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Atributo</span>
          <select value={effect.attribute || ""} onChange={e => onChange("attribute", e.target.value)} className={inputCls}>
            <option value="">Selecione</option>
            {EFFECT_ATTRIBUTES.map(attribute => <option key={attribute.value} value={attribute.value}>{attribute.label}</option>)}
          </select>
        </label>
        <label className="min-w-0">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Carta</span>
          <input value={effect.card_name || ""} onChange={e => onChange("card_name", e.target.value)} className={inputCls} />
        </label>
        <label className="min-w-0">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Marcador</span>
          <input value={effect.tag || ""} onChange={e => onChange("tag", e.target.value)} className={inputCls} />
        </label>
        <div className="flex justify-end sm:col-span-2">
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-indigo-500/40 bg-indigo-500/20 px-4 text-xs text-indigo-200 hover:bg-indigo-500/30"
          >
            <Plus size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};

const DynamicEffectControls = ({ effect, onChange, onAdd }) => {
  const inputCls = "w-full min-w-0 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none";
  const fields = effectFieldsFor(effect.type);
  const show = field => fields.includes(field);
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[18rem] flex-[2_1_24rem]">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Efeito</span>
          <select value={effect.type} onChange={e => onChange("type", e.target.value)} className={inputCls}>
            {EFFECT_TYPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        {show("target") && (
          <label className="min-w-[11rem] flex-[1_1_13rem]">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Alvo</span>
            <select value={effect.target || TARGETS.OPPONENT_ACTIVE} onChange={e => onChange("target", e.target.value)} className={inputCls}>
              {Object.values(TARGETS).map(target => <option key={target} value={target}>{TARGET_LABELS[target]}</option>)}
            </select>
          </label>
        )}
        {show("amount") && (
          <label className="min-w-[11rem] flex-[1_1_13rem]">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Valor</span>
            <input type="number" min={0} value={effect.amount ?? 0} onChange={e => onChange("amount", e.target.value)} className={`${inputCls} font-mono`} />
          </label>
        )}
        {show("duration") && (
          <label className="min-w-[11rem] flex-[1_1_13rem]">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Duração</span>
            <select value={effect.duration || DURATIONS.INSTANT} onChange={e => onChange("duration", e.target.value)} className={inputCls}>
              {Object.values(DURATIONS).map(duration => <option key={duration} value={duration}>{DURATION_LABELS[duration]}</option>)}
            </select>
          </label>
        )}
        {show("condition") && (
          <label className="min-w-[11rem] flex-[1_1_13rem]">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Condição</span>
            <select value={effect.condition || EFFECT_CONDITIONS.ALWAYS} onChange={e => onChange("condition", e.target.value)} className={inputCls}>
              {Object.values(EFFECT_CONDITIONS).map(condition => <option key={condition || "ALWAYS"} value={condition}>{EFFECT_CONDITION_LABELS[condition]}</option>)}
            </select>
          </label>
        )}
        {show("nature") && (
          <label className="min-w-[11rem] flex-[1_1_13rem]">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Natureza</span>
            <select value={effect.nature || ""} onChange={e => onChange("nature", e.target.value)} className={inputCls}>
              <option value="">Qualquer</option>
              {NATURES.map(nature => <option key={nature} value={nature}>{nature}</option>)}
            </select>
          </label>
        )}
        {show("energy_type") && (
          <label className="min-w-[11rem] flex-[1_1_13rem]">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Energia</span>
            <select value={effect.energy_type || ""} onChange={e => onChange("energy_type", e.target.value)} className={inputCls}>
              <option value="">Qualquer</option>
              {ENERGY_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
        )}
        {show("attribute") && (
          <label className="min-w-[11rem] flex-[1_1_13rem]">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Atributo</span>
            <select value={effect.attribute || ""} onChange={e => onChange("attribute", e.target.value)} className={inputCls}>
              <option value="">Selecione</option>
              {EFFECT_ATTRIBUTES.map(attribute => <option key={attribute.value} value={attribute.value}>{attribute.label}</option>)}
            </select>
          </label>
        )}
        {show("card_name") && (
          <label className="min-w-[14rem] flex-[1_1_16rem]">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Carta</span>
            <input value={effect.card_name || ""} onChange={e => onChange("card_name", e.target.value)} className={inputCls} />
          </label>
        )}
        {show("tag") && (
          <label className="min-w-[14rem] flex-[1_1_16rem]">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Marcador</span>
            <input value={effect.tag || ""} onChange={e => onChange("tag", e.target.value)} className={inputCls} />
          </label>
        )}
        {show("natures") && (
          <label className="min-w-[13rem] flex-[1_1_16rem]">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Naturezas</span>
            <select multiple value={effect.natures || []} onChange={e => onChange("natures", Array.from(e.target.selectedOptions).map(option => option.value))} className={`${inputCls} min-h-[7rem]`}>
              {NATURES.map(nature => <option key={nature} value={nature}>{nature}</option>)}
            </select>
          </label>
        )}
        {show("tags") && (
          <label className="min-w-[14rem] flex-[1_1_16rem]">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Marcadores</span>
            <input value={(effect.tags || []).join(", ")} onChange={e => onChange("tags", e.target.value.split(",").map(item => item.trim()).filter(Boolean))} className={inputCls} />
          </label>
        )}
        {["random_targets_count", "per_energy_amount", "discard_amount", "dice_threshold", "success_amount", "temporary_hp"].filter(show).map(field => (
          <label key={field} className="min-w-[11rem] flex-[1_1_13rem]">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">{field}</span>
            <input type="number" min={0} value={effect[field] ?? 0} onChange={e => onChange(field, parseInt(e.target.value, 10) || 0)} className={`${inputCls} font-mono`} />
          </label>
        ))}
        {show("energy_owner") && (
          <label className="min-w-[11rem] flex-[1_1_13rem]">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Energia de</span>
            <select value={effect.energy_owner || "SELF"} onChange={e => onChange("energy_owner", e.target.value)} className={inputCls}>
              <option value="SELF">Propria carta</option>
              <option value="TARGET">Alvo</option>
            </select>
          </label>
        )}
        {show("comparison") && (
          <label className="min-w-[11rem] flex-[1_1_13rem]">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Comparacao</span>
            <select value={effect.comparison || "GTE"} onChange={e => onChange("comparison", e.target.value)} className={inputCls}>
              {["GTE", "LTE", "GT", "LT", "EQ"].map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        )}
        {show("roll_count_source") && (
          <label className="min-w-[13rem] flex-[1_1_14rem]">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Rolagens</span>
            <select value={effect.roll_count_source || "FIXED"} onChange={e => onChange("roll_count_source", e.target.value)} className={inputCls}>
              <option value="FIXED">Fixa</option>
              <option value="SELF_BENCH_COUNT">Cartas no banco</option>
              <option value="ENERGY_COUNT">Energias</option>
            </select>
          </label>
        )}
        {show("split_mode") && (
          <label className="min-w-[13rem] flex-[1_1_14rem]">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Modo de divisao</span>
            <select value={effect.split_mode || "EVEN"} onChange={e => onChange("split_mode", e.target.value)} className={inputCls}>
              <option value="EVEN">Dividir igualmente</option>
              <option value="MANUAL">Manual pelo frontend</option>
            </select>
          </label>
        )}
        {show("filter_type") && (
          <label className="min-w-[13rem] flex-[1_1_14rem]">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Filtro</span>
            <select value={effect.filter_type || "BASIC"} onChange={e => onChange("filter_type", e.target.value)} className={inputCls}>
              <option value="BASIC">Basica</option>
              <option value="NATURE">Natureza</option>
              <option value="CARD_TYPE">Tipo de carta</option>
              <option value="NAME">Nome</option>
            </select>
          </label>
        )}
        {show("card_type") && (
          <label className="min-w-[13rem] flex-[1_1_14rem]">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Tipo de carta</span>
            <select value={effect.card_type || ""} onChange={e => onChange("card_type", e.target.value)} className={inputCls}>
              <option value="">Qualquer</option>
              {CARD_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
        )}
        {["damage_type", "applies_to", "stack_key", "applies_to_tag", "applies_to_nature"].filter(show).map(field => (
          <label key={field} className="min-w-[13rem] flex-[1_1_14rem]">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">{field}</span>
            <input value={effect[field] || ""} onChange={e => onChange(field, e.target.value)} className={inputCls} />
          </label>
        ))}
        {["allow_manual_target", "per_count", "random", "absorb_hp", "absorb_damage", "absorb_energy", "keep_negative_effects", "reset_on_miss"].filter(show).map(field => (
          <label key={field} className="flex min-h-10 min-w-[12rem] flex-[1_1_12rem] items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
            <input type="checkbox" checked={Boolean(effect[field])} onChange={e => onChange(field, e.target.checked)} />
            {field}
          </label>
        ))}
        <div className="mt-2 flex basis-full justify-end">
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-indigo-500/40 bg-indigo-500/20 px-4 text-xs text-indigo-200 hover:bg-indigo-500/30"
          >
            <Plus size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};

export function EditCommunityCardModal({ card, onClose, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState(null);
  const [evolutionOptions, setEvolutionOptions] = useState([]);

  useEffect(() => {
    if (!card) return;
    setForm({
      name: card.name || "",
      card_type: card.card_type || "Personagem",
      natures: card.natures || [],
      rarity: card.rarity ?? 1,
      is_alpha: card.is_alpha || false,
      is_evolution: card.is_evolution || false,
      evolution_number: normalizeEvolutionNumber(card.evolution_number),
      evolves_from_card_id: card.evolves_from_card_id || "",
      evolves_from_name: card.evolves_from_name || "",
      hp: card.hp ?? 0,
      recuo: card.recuo ?? 0,
      effects: normalizeEffects(card.effects),
      effect_to_add: { ...BLANK_EFFECT },
      passive_effects: normalizeEffects(card.passive_effects),
      passive_effect_to_add: {
        ...BLANK_EFFECT,
        type: EFFECT_TYPES.BUFF_EQUIPPED_CARD_DAMAGE,
        target: TARGETS.EQUIPPED_CARD,
        condition: EFFECT_CONDITIONS.EQUIPPED_CARD_DEALS_DAMAGE,
      },
      speed: card.speed || "",
      attach_to: card.attach_to || "",
      abilities: (card.abilities || []).map(ab => ({
        name: ab.name || "",
        description: ab.description || "",
        damage: ab.damage ?? 0,
        energy_cost: ab.energy_cost ?? 0,
        energy_costs: normalizeAbilityEnergyCosts(ab),
        effects: normalizeEffects(ab.effects),
        rules: normalizeAbilityRules(ab.rules),
        effect_to_add: { ...BLANK_EFFECT, amount: ab.damage ?? 0 },
        rule_to_add: makeBlankRule(),
        energy_type_to_add: ENERGY_TYPES[0],
        energy_amount_to_add: 1,
      })),
      energy_type: card.energy_type || "",
      image_url: card.image_url || "",
      description: card.description || "",
      expansion: card.expansion || "",
      universe: card.universe || "",
      additional_info: normalizeAdditionalInfo(card.additional_info),
      meta: normalizeCardMeta(card.meta),
      public_status: card.public_status || "approved",
    });
  }, [card]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/cards");
        setEvolutionOptions(data || []);
      } catch (e) {
        toast.error(formatApiError(e));
      }
    })();
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const updateAdditionalInfo = (index, field, value) => {
    setForm(f => {
      const list = [...(f.additional_info || [])];
      list[index] = {
        ...(list[index] || { label: "", value: "" }),
        [field]: value,
      };
      return { ...f, additional_info: list };
    });
  };

  const addAdditionalInfo = () => {
    setForm(f => {
      const list = f.additional_info || [];
      if (list.length >= MAX_ADDITIONAL_INFO) {
        toast.error("Maximo de 10 informacoes adicionais");
        return f;
      }
      return { ...f, additional_info: [...list, { label: "", value: "" }] };
    });
  };

  const removeAdditionalInfo = index => {
    setForm(f => ({
      ...f,
      additional_info: (f.additional_info || []).filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const updateMeta = (field, value) => {
    setForm(f => ({
      ...f,
      meta: {
        ...normalizeCardMeta(f.meta),
        [field]: value,
      },
    }));
  };

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
        rules: [],
        effect_to_add: { ...BLANK_EFFECT },
        rule_to_add: makeBlankRule(),
        energy_type_to_add: ENERGY_TYPES[0],
        energy_amount_to_add: 1,
      }
    ]);
  };

  const removeAbility = (i) => {
    set("abilities", form.abilities.filter((_, idx) => idx !== i));
  };

  const getEvolutionStage = candidate => {
    if (!candidate?.is_evolution) return 1;
    const stages = { I: 2, II: 2, III: 3, IV: 4 };
    return stages[String(candidate.evolution_number || "II").toUpperCase()] || 2;
  };

  const validEvolutionTargets = useMemo(() => {
    const previousStage = getEvolutionStage(form) - 1;
    return evolutionOptions.filter(option =>
      option.id !== card?.id &&
      option.card_type === "Personagem" &&
      getEvolutionStage(option) === previousStage
    );
  }, [card?.id, evolutionOptions, form]);

  const setEvolutionTarget = targetId => {
    const target = evolutionOptions.find(option => option.id === targetId);
    setForm(f => ({
      ...f,
      evolves_from_card_id: target?.id || "",
      evolves_from_name: target?.name || "",
    }));
  };

  const upload = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      set("image_url", data.url);
      toast.success("Imagem carregada");
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setUploading(false);
    }
  };

  const updateAbilityEffectDraft = (abilityIndex, field, value) => {
    const ability = form.abilities[abilityIndex];
    if (field === "type") {
      updateAbility(abilityIndex, "effect_to_add", {
        ...BLANK_EFFECT,
        type: value,
        target: effectFieldsFor(value).includes("target")
          ? TARGETS.OPPONENT_ACTIVE
          : "",
      });
    } else {
      updateAbility(abilityIndex, "effect_to_add", {
        ...(ability.effect_to_add || BLANK_EFFECT),
        [field]: field === "amount" ? parseInt(value, 10) || 0 : value,
      });
    }
  };

  const addAbilityEffect = abilityIndex => {
    const ability = form.abilities[abilityIndex];
    const effects = [
      ...normalizeEffects(ability.effects),
      sanitizeEffectDraft(ability.effect_to_add || BLANK_EFFECT),
    ];
    const list = [...form.abilities];
    list[abilityIndex] = {
      ...ability,
      effects,
      effect_to_add: { ...BLANK_EFFECT, amount: ability.damage ?? 0 },
    };
    set("abilities", list);
  };

  const removeAbilityEffect = (abilityIndex, effectIndex) => {
    const ability = form.abilities[abilityIndex];
    updateAbility(
      abilityIndex,
      "effects",
      normalizeEffects(ability.effects).filter((_, idx) => idx !== effectIndex)
    );
  };

  const updateAbilityRuleDraft = (abilityIndex, field, value) => {
    const ability = form.abilities[abilityIndex];
    updateAbility(abilityIndex, "rule_to_add", {
      ...(ability.rule_to_add || makeBlankRule()),
      [field]: value,
    });
  };

  const updateAbilityRuleConditionDraft = (abilityIndex, field, value) => {
    const ability = form.abilities[abilityIndex];
    const rule = ability.rule_to_add || makeBlankRule();
    const currentCondition = rule.condition_to_add || BLANK_RULE_CONDITION;
    const nextCondition = {
      ...currentCondition,
      [field]: value,
    };
    if (field === "type") {
      nextCondition.value = defaultRuleConditionValue(value);
    }
    updateAbility(abilityIndex, "rule_to_add", {
      ...rule,
      condition_to_add: nextCondition,
    });
  };

  const addAbilityRuleCondition = abilityIndex => {
    const ability = form.abilities[abilityIndex];
    const rule = ability.rule_to_add || makeBlankRule();
    const condition = normalizeRuleConditionDraft(rule.condition_to_add || BLANK_RULE_CONDITION);
    updateAbility(abilityIndex, "rule_to_add", {
      ...rule,
      conditions: [...normalizeAbilityConditions(rule.conditions), condition],
      condition_to_add: { ...BLANK_RULE_CONDITION },
    });
  };

  const removeAbilityRuleCondition = (abilityIndex, conditionIndex) => {
    const ability = form.abilities[abilityIndex];
    const rule = ability.rule_to_add || makeBlankRule();
    updateAbility(abilityIndex, "rule_to_add", {
      ...rule,
      conditions: normalizeAbilityConditions(rule.conditions).filter((_, idx) => idx !== conditionIndex),
    });
  };

  const updateAbilityRuleEffectDraft = (abilityIndex, field, value) => {
    const ability = form.abilities[abilityIndex];
    const rule = ability.rule_to_add || makeBlankRule();
    if (field === "type") {
      updateAbility(abilityIndex, "rule_to_add", {
        ...rule,
        effect_to_add: {
          ...BLANK_EFFECT,
          type: value,
          target: effectFieldsFor(value).includes("target")
            ? TARGETS.OPPONENT_ACTIVE
            : "",
        },
      });
    } else {
      updateAbility(abilityIndex, "rule_to_add", {
        ...rule,
        effect_to_add: {
          ...(rule.effect_to_add || BLANK_EFFECT),
          [field]: field === "amount" ? parseInt(value, 10) || 0 : value,
        },
      });
    }
  };

  const addAbilityRuleEffect = abilityIndex => {
    const ability = form.abilities[abilityIndex];
    const rule = ability.rule_to_add || makeBlankRule();
    updateAbility(abilityIndex, "rule_to_add", {
      ...rule,
      effects: [
        ...normalizeEffects(rule.effects),
        sanitizeEffectDraft(rule.effect_to_add || BLANK_EFFECT),
      ],
      effect_to_add: { ...BLANK_EFFECT },
    });
  };

  const removeAbilityRuleEffect = (abilityIndex, effectIndex) => {
    const ability = form.abilities[abilityIndex];
    const rule = ability.rule_to_add || makeBlankRule();
    updateAbility(abilityIndex, "rule_to_add", {
      ...rule,
      effects: normalizeEffects(rule.effects).filter((_, idx) => idx !== effectIndex),
    });
  };

  const addAbilityRule = abilityIndex => {
    const ability = form.abilities[abilityIndex];
    const rule = ability.rule_to_add || makeBlankRule();
    const effects = normalizeEffects(rule.effects);

    if (effects.length === 0) {
      toast.error("Adicione pelo menos um efeito na regra");
      return;
    }

    const list = [...form.abilities];
    list[abilityIndex] = {
      ...ability,
      rules: [
        ...normalizeAbilityRules(ability.rules),
        {
          trigger: rule.trigger || ABILITY_TRIGGERS.ON_ATTACK,
          conditions: normalizeAbilityConditions(rule.conditions),
          effects,
          duration: rule.duration || DURATIONS.INSTANT,
        },
      ],
      rule_to_add: makeBlankRule(),
    };
    set("abilities", list);
  };

  const removeAbilityRule = (abilityIndex, ruleIndex) => {
    const ability = form.abilities[abilityIndex];
    updateAbility(
      abilityIndex,
      "rules",
      normalizeAbilityRules(ability.rules).filter((_, idx) => idx !== ruleIndex)
    );
  };

  const updateEffectDraft = (draftField, field, value) => {
    setForm(f => ({
      ...f,
      [draftField]: {
        ...(f[draftField] || BLANK_EFFECT),
        [field]: field === "amount" ? parseInt(value, 10) || 0 : value,
      },
    }));
  };

  const addCardEffect = (listField, draftField, resetEffect = BLANK_EFFECT) => {
    setForm(f => ({
      ...f,
      [listField]: [
        ...(listField === "passive_effects" ? normalizeEquipmentPassiveEffects(f[listField]) : normalizeEffects(f[listField])),
        ...(listField === "passive_effects"
          ? normalizeEquipmentPassiveEffects([sanitizeEffectDraft(f[draftField] || resetEffect)])
          : [sanitizeEffectDraft(f[draftField] || resetEffect)]),
      ],
      [draftField]: { ...resetEffect },
    }));
  };

  const removeCardEffect = (listField, effectIndex) => {
    setForm(f => ({
      ...f,
      [listField]: normalizeEffects(f[listField]).filter((_, idx) => idx !== effectIndex),
    }));
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        expansion: String(form.expansion || "").trim(),
        universe: String(form.universe || "").trim(),
        additional_info: normalizeAdditionalInfo(form.additional_info),
        meta: normalizeCardMeta(form.meta),
        evolution_number: form.is_evolution ? (normalizeEvolutionNumber(form.evolution_number) || "II") : null,
        evolves_from_card_id: form.is_evolution ? (form.evolves_from_card_id || null) : null,
        evolves_from_name: form.is_evolution ? (form.evolves_from_name || null) : null,
        effects: normalizeEffects(form.effects),
        passive_effects: normalizeEquipmentPassiveEffects(form.passive_effects),
        abilities: form.abilities.map(({
          energy_type_to_add,
          energy_amount_to_add,
          effect_to_add,
          rule_to_add,
          ...ability
        }) => ({
          ...ability,
          energy_costs: sanitizeEnergyCosts(ability.energy_costs),
          effects: normalizeEffects(ability.effects),
          rules: normalizeAbilityRules(ability.rules),
          energy_cost: totalEnergyCost(ability.energy_costs),
        })),
      };
      delete payload.effect_to_add;
      delete payload.passive_effect_to_add;

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
      <div className="glass rounded-xl p-6 w-full max-w-4xl my-auto space-y-4">

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

        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <label className={labelCls + " mb-0"}>Informacoes adicionais</label>
            <span className="text-[10px] text-slate-500">{(form.additional_info || []).length}/{MAX_ADDITIONAL_INFO}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Expansao</label>
              <input value={form.expansion || ""} onChange={e => set("expansion", e.target.value)} placeholder="Ex: A1" maxLength={40} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Universo</label>
              <input value={form.universe || ""} onChange={e => set("universe", e.target.value)} placeholder="Ex: Naruto" maxLength={60} className={inputCls} />
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-3 space-y-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Meta para efeitos avancados</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <label>
                <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Idade</span>
                <select value={normalizeCardMeta(form.meta).age} onChange={e => updateMeta("age", e.target.value)} className={inputCls}>
                  <option value="">Sem idade</option>
                  {Object.values(CARD_META_AGES).map(age => <option key={age} value={age}>{CARD_META_AGE_LABELS[age]}</option>)}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Arma</span>
                <input list="community-card-meta-weapons" value={normalizeCardMeta(form.meta).weapon} onChange={e => updateMeta("weapon", e.target.value.toUpperCase())} placeholder="Ex: ESPADA" className={inputCls} />
              </label>
              <label>
                <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Estilo</span>
                <input list="community-card-meta-styles" value={normalizeCardMeta(form.meta).style} onChange={e => updateMeta("style", e.target.value.toUpperCase())} placeholder="Ex: LOGIA" className={inputCls} />
              </label>
            </div>
            <div>
              <span className="mb-2 block text-[10px] uppercase tracking-wider text-slate-500">Elementos</span>
              <div className="flex flex-wrap gap-2">
                {COMMON_META_ELEMENTS.map(element => (
                  <button key={element} type="button" onClick={() => updateMeta("elements", toggleListValue(normalizeCardMeta(form.meta).elements, element))} className={`rounded-full border px-2 py-1 text-xs ${normalizeCardMeta(form.meta).elements.includes(element) ? "border-indigo-400 bg-indigo-500/20 text-indigo-100" : "border-slate-700 bg-slate-900 text-slate-300"}`}>{element}</button>
                ))}
              </div>
            </div>
            <label>
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Tags meta</span>
              <input value={normalizeCardMeta(form.meta).tags.join(", ")} onChange={e => updateMeta("tags", e.target.value.split(",").map(item => item.trim().toUpperCase()).filter(Boolean))} placeholder="Ex: LOGIA, MAGO, PIRATA" className={inputCls} />
            </label>
            <datalist id="community-card-meta-weapons">{COMMON_META_WEAPONS.map(item => <option key={item} value={item} />)}</datalist>
            <datalist id="community-card-meta-styles">{COMMON_META_STYLES.map(item => <option key={item} value={item} />)}</datalist>
          </div>
          <div className="space-y-2">
            {(form.additional_info || []).map((info, index) => (
              <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto]">
                <input
                  value={info.label || ""}
                  onChange={e => updateAdditionalInfo(index, "label", e.target.value)}
                  placeholder="Campo"
                  maxLength={40}
                  className={inputCls}
                />
                <input
                  value={info.value || ""}
                  onChange={e => updateAdditionalInfo(index, "value", e.target.value)}
                  placeholder="Valor"
                  maxLength={120}
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={() => removeAdditionalInfo(index)}
                  className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-rose-200 hover:bg-rose-500/20"
                  aria-label="Remover informacao adicional"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={addAdditionalInfo}
                disabled={(form.additional_info || []).length >= MAX_ADDITIONAL_INFO}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/20 px-3 py-2 text-xs text-indigo-200 hover:bg-indigo-500/30 disabled:opacity-40"
              >
                <Plus size={13} /> Adicionar campo
              </button>
            </div>
          </div>
        </div>

        

        <div className="grid grid-cols-2 gap-3">

        {/* Evolução */}
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_evolution}
            onChange={e => {
              const checked = e.target.checked;
              setForm(f => ({
                ...f,
                is_evolution: checked,
                evolution_number: checked
                  ? (normalizeEvolutionNumber(f.evolution_number) || "II")
                  : "",
                evolves_from_card_id: checked ? f.evolves_from_card_id : "",
                evolves_from_name: checked ? f.evolves_from_name : ""
              }));
            }}
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
            value={normalizeEvolutionNumber(form.evolution_number) || "II"}
            onChange={e => setForm(f => ({
              ...f,
              evolution_number: e.target.value,
              evolves_from_card_id: "",
              evolves_from_name: "",
            }))}
            className={inputCls}
          >
            {["II", "III", "IV"].map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <label className={labelCls + " mt-3"}>Evolui de</label>
          <select
            value={form.evolves_from_card_id || ""}
            onChange={e => setEvolutionTarget(e.target.value)}
            className={inputCls}
          >
            <option value="">Selecione a carta base</option>
            {validEvolutionTargets.map(option => (
              <option key={option.id} value={option.id}>{option.name}</option>
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

        <div>
          <label className={labelCls}>Imagem</label>
          <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 hover:bg-slate-700">
            <Upload size={14} />
            <span className="text-sm">{uploading ? "Enviando..." : "Upload imagem"}</span>
            <input type="file" accept="image/*" className="hidden" onChange={upload} disabled={uploading} />
          </label>
          {form.image_url && (
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              Imagem carregada
              <button type="button" onClick={() => set("image_url", "")} className="text-slate-400 hover:text-rose-400">
                <X size={13} />
              </button>
            </div>
          )}
        </div>

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
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <label className={labelCls + " mb-0"}>Efeitos da habilidade</label>
                    <span className="text-[10px] text-slate-500">{normalizeEffects(ab.effects).length} adicionados</span>
                  </div>
                  <DynamicEffectControls
                    effect={ab.effect_to_add || BLANK_EFFECT}
                    onChange={(field, value) => updateAbilityEffectDraft(i, field, value)}
                    onAdd={() => addAbilityEffect(i)}
                  />
                  <EffectsList effects={ab.effects} onRemove={effectIndex => removeAbilityEffect(i, effectIndex)} />
                </div>
                <div className="rounded-lg border border-cyan-500/20 bg-cyan-950/10 p-3 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className={labelCls + " mb-0"}>Regras avancadas</label>
                    <span className="text-[10px] text-slate-500">{normalizeAbilityRules(ab.rules).length} adicionadas</span>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <label>
                      <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Gatilho</span>
                      <select value={ab.rule_to_add?.trigger || ABILITY_TRIGGERS.ON_ATTACK} onChange={e => updateAbilityRuleDraft(i, "trigger", e.target.value)} className={inputCls}>
                        {Object.values(ABILITY_TRIGGERS).map(trigger => (
                          <option key={trigger} value={trigger}>{ABILITY_TRIGGER_LABELS[trigger]}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Duracao da regra</span>
                      <select value={ab.rule_to_add?.duration || DURATIONS.INSTANT} onChange={e => updateAbilityRuleDraft(i, "duration", e.target.value)} className={inputCls}>
                        {Object.values(DURATIONS).map(duration => (
                          <option key={duration} value={duration}>{DURATION_LABELS[duration]}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 space-y-2">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">Condicoes</div>
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="min-w-[13rem] flex-[1_1_14rem]">
                        <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Tipo</span>
                        <select value={ab.rule_to_add?.condition_to_add?.type || ABILITY_CONDITION_TYPES.SOURCE_POSITION} onChange={e => updateAbilityRuleConditionDraft(i, "type", e.target.value)} className={inputCls}>
                          {Object.values(ABILITY_CONDITION_TYPES).map(type => (
                            <option key={type} value={type}>{ABILITY_CONDITION_LABELS[type]}</option>
                          ))}
                        </select>
                      </label>
                      <label className="min-w-[13rem] flex-[2_1_18rem]">
                        <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Valor</span>
                        <RuleConditionValueControl
                          condition={ab.rule_to_add?.condition_to_add}
                          onChange={value => updateAbilityRuleConditionDraft(i, "value", value)}
                          className={inputCls}
                        />
                      </label>
                      <div className="flex basis-full justify-end">
                        <button type="button" onClick={() => addAbilityRuleCondition(i)} className="inline-flex h-10 items-center justify-center rounded-lg border border-cyan-500/40 bg-cyan-500/20 px-4 text-xs text-cyan-100 hover:bg-cyan-500/30">
                          <Plus size={13} />
                        </button>
                      </div>
                    </div>
                    {normalizeAbilityConditions(ab.rule_to_add?.conditions).length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {normalizeAbilityConditions(ab.rule_to_add.conditions).map((condition, conditionIndex) => (
                          <button key={`${condition.type}-${conditionIndex}`} type="button" onClick={() => removeAbilityRuleCondition(i, conditionIndex)} className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300 hover:border-rose-500/60 hover:text-rose-200">
                            {ABILITY_CONDITION_LABELS[condition.type]}{abilityConditionValueLabel(condition) ? `: ${abilityConditionValueLabel(condition)}` : ""}
                            <X size={11} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <DynamicEffectControls effect={ab.rule_to_add?.effect_to_add || BLANK_EFFECT} onChange={(field, value) => updateAbilityRuleEffectDraft(i, field, value)} onAdd={() => addAbilityRuleEffect(i)} />
                  <EffectsList effects={ab.rule_to_add?.effects} onRemove={effectIndex => removeAbilityRuleEffect(i, effectIndex)} />

                  <div className="flex justify-end">
                    <button type="button" onClick={() => addAbilityRule(i)} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-4 py-2 text-xs text-cyan-100 hover:bg-cyan-500/25">
                      <Plus size={13} /> Adicionar regra avancada
                    </button>
                  </div>

                  {normalizeAbilityRules(ab.rules).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {normalizeAbilityRules(ab.rules).map((rule, ruleIndex) => (
                        <button key={`${rule.trigger}-${ruleIndex}`} type="button" onClick={() => removeAbilityRule(i, ruleIndex)} className="inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-950/30 px-2 py-1 text-xs text-cyan-100 hover:border-rose-500/60 hover:text-rose-200">
                          {ruleSummary(rule)}
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

        {["Item", "Mestre"].includes(form.card_type) && (
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <label className={labelCls + " mb-0"}>Efeitos da carta</label>
              <span className="text-[10px] text-slate-500">{normalizeEffects(form.effects).length} adicionados</span>
            </div>
            <DynamicEffectControls
              effect={form.effect_to_add || BLANK_EFFECT}
              onChange={(field, value) => updateEffectDraft("effect_to_add", field, value)}
              onAdd={() => addCardEffect("effects", "effect_to_add", BLANK_EFFECT)}
            />
            <EffectsList effects={form.effects} onRemove={effectIndex => removeCardEffect("effects", effectIndex)} />
          </div>
        )}

        {form.card_type === "Equipamento" && (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Anexar em</label>
              <select value={form.attach_to || "SELF_CHARACTER"} onChange={e => set("attach_to", e.target.value)} className={inputCls}>
                <option value="SELF_CHARACTER">Seu personagem</option>
              </select>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label className={labelCls + " mb-0"}>Efeitos passivos</label>
                <span className="text-[10px] text-slate-500">{normalizeEffects(form.passive_effects).length} adicionados</span>
              </div>
              <DynamicEffectControls
                effect={form.passive_effect_to_add || BLANK_EFFECT}
                onChange={(field, value) => updateEffectDraft("passive_effect_to_add", field, value)}
                onAdd={() => addCardEffect("passive_effects", "passive_effect_to_add", {
                  ...BLANK_EFFECT,
                  type: EFFECT_TYPES.BUFF_EQUIPPED_CARD_DAMAGE,
                  target: TARGETS.EQUIPPED_CARD,
                  condition: EFFECT_CONDITIONS.EQUIPPED_CARD_DEALS_DAMAGE,
                })}
              />
              <EffectsList effects={form.passive_effects} onRemove={effectIndex => removeCardEffect("passive_effects", effectIndex)} />
            </div>
          </div>
        )}

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
