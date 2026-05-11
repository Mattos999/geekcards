import { ENERGY_TYPES } from "./natures";
import { normalizeAbilityEnergyCosts, sanitizeEnergyCosts } from "./energyCosts";
import {
  ABILITY_TRIGGERS,
  EFFECT_CONDITIONS,
  EFFECT_TYPES,
  EQUIPMENT_DAMAGE_BONUS_EFFECT_TYPES,
  TARGETS,
  normalizeAbilityRules,
  normalizeEffects,
  shouldApplyEquipmentPassiveEffect,
  targetFiltersMatchCard,
} from "./cardEffects";

const INITIAL_HAND_SIZE = 5;
const BENCH_LIMIT = 3;
const ENERGY_PER_TURN = 1;
const POINTS_TO_WIN = 3;
const MAX_CHAIN_DEPTH = 10;

export const TURN_MOMENTS = {
  SETUP: "SETUP",
  TURN_START: "TURN_START",
  DRAW: "DRAW",
  ACTION: "ACTION",
  ATTACK: "ATTACK",
  TURN_END: "TURN_END",
};

const clone = value => JSON.parse(JSON.stringify(value));

const shuffle = cards => {
  const list = [...cards];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
};

const normalizeEnergyTypes = energyTypes => {
  const valid = (energyTypes || []).filter(type => type !== GENERIC_ENERGY_TYPE && ENERGY_TYPES.includes(type));
  return valid.length ? valid : ["Superior", "Natural", "Interior"];
};

const randomEnergy = energyTypes => {
  const valid = normalizeEnergyTypes(energyTypes);
  return valid[Math.floor(Math.random() * valid.length)];
};

const newInstanceId = () => `duel-${Math.random().toString(36).slice(2)}-${Date.now()}`;

const makeInstance = (card, turnNumber = 0) => ({
  ...clone(card),
  instance_id: newInstanceId(),
  hp_remaining: Math.max(0, parseInt(card.hp, 10) || 0),
  attached_energy: [],
  equipments: [],
  entered_turn: turnNumber,
});

const isCharacter = card => card?.card_type === "Personagem";
const isBasicCharacter = card => isCharacter(card) && !card.is_evolution;

const toHandCard = card => {
  if (!card) return card;
  const {
    instance_id,
    hp_remaining,
    attached_energy,
    equipments,
    pending_damage_reduction,
    next_damage_multiplier,
    entered_turn,
    evolved_from,
    ...baseCard
  } = card;
  return baseCard;
};

const evolutionStage = card => {
  if (!card?.is_evolution) return 1;
  const value = String(card.evolution_number || "II").toUpperCase();
  const stages = { I: 2, II: 2, III: 3, IV: 4 };
  return stages[value] || 2;
};

const canEvolveTarget = (evolution, target, turnNumber) => {
  if (!evolution?.is_evolution || !target || target.entered_turn >= turnNumber) return false;
  if (evolutionStage(evolution) !== evolutionStage(target) + 1) return false;

  if (evolution.evolves_from_card_id || evolution.evolves_from_name) {
    return (
      evolution.evolves_from_card_id === target.id ||
      evolution.evolves_from_card_id === target.source_card_id ||
      evolution.evolves_from_name === target.name
    );
  }

  return true;
};

const knockoutPoints = card => {
  const explicit = parseInt(card?.knockout_points ?? card?.point_value ?? card?.points, 10);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return card?.is_alpha ? 2 : 1;
};

const abilityCosts = ability => sanitizeEnergyCosts(normalizeAbilityEnergyCosts(ability));
const GENERIC_ENERGY_TYPE = "Universal";

const adjustedAbilityCosts = (card, ability) => {
  let reduction = Math.max(0, parseInt(card?.energy_cost_reduction, 10) || 0);
  return abilityCosts(ability).map(cost => {
    const reduced = Math.min(reduction, cost.amount);
    reduction -= reduced;
    return { ...cost, amount: Math.max(0, cost.amount - reduced) };
  }).filter(cost => cost.amount > 0);
};

const canPayAbility = (card, ability) => {
  const costs = adjustedAbilityCosts(card, ability);
  if ((card?.attached_energy || []).length === 0 && costs.length === 0) return true;
  const attached = card?.attached_energy || [];
  if (card?.energy_any_type) {
    return attached.length >= costs.reduce((total, cost) => total + cost.amount, 0);
  }

  const remaining = [...attached];
  const genericCost = costs
    .filter(cost => cost.energy_type === GENERIC_ENERGY_TYPE)
    .reduce((total, cost) => total + cost.amount, 0);
  const specificCosts = costs.filter(cost => cost.energy_type !== GENERIC_ENERGY_TYPE);

  for (const cost of specificCosts) {
    for (let paid = 0; paid < cost.amount; paid += 1) {
      let index = remaining.findIndex(energy => energy === cost.energy_type);
      if (index < 0) index = remaining.findIndex(energy => energy === GENERIC_ENERGY_TYPE);
      if (index < 0) return false;
      remaining.splice(index, 1);
    }
  }

  return remaining.length >= genericCost;
};

const abilityEffects = ability => {
  if (normalizeAbilityRules(ability?.rules).length > 0) return [];
  const effects = normalizeEffects(ability?.effects);
  if (effects.length > 0) return effects;
  const damage = Math.max(0, parseInt(ability?.damage, 10) || 0);
  return damage > 0 ? [{ type: EFFECT_TYPES.DAMAGE, target: TARGETS.OPPONENT_ACTIVE, amount: damage }] : [];
};

const passiveDamageBonus = card => (card?.equipments || []).reduce((total, equipment) => (
  total + normalizeEffects(equipment.passive_effects)
    .filter(effect => EQUIPMENT_DAMAGE_BONUS_EFFECT_TYPES.has(effect.type))
    .filter(effect => !effect.condition || [
      EFFECT_CONDITIONS.ALWAYS,
      EFFECT_CONDITIONS.EQUIPPED_CARD_DEALS_DAMAGE,
      EFFECT_CONDITIONS.EQUIPPED_CARD_HAS_EQUIPMENT,
    ].includes(effect.condition))
    .reduce((sum, effect) => sum + (parseInt(effect.amount, 10) || 0), 0)
), 0);

const automaticAbilities = card => [
  ...(card?.abilities || []),
  ...(card?.passive_abilities || []),
];

const DAMAGE_EFFECTS = new Set([
  EFFECT_TYPES.DAMAGE,
  EFFECT_TYPES.DAMAGE_BY_FORMULA,
  EFFECT_TYPES.DAMAGE_RANDOM_TARGETS,
  EFFECT_TYPES.DAMAGE_ANY_TARGET,
  EFFECT_TYPES.DAMAGE_ACTIVE_AND_BENCH,
  EFFECT_TYPES.DAMAGE_ALL_OPPONENT_BENCH,
  EFFECT_TYPES.DAMAGE_SELF,
  EFFECT_TYPES.DAMAGE_EXTRA_BY_ENERGY,
  EFFECT_TYPES.DAMAGE_EXTRA_BY_BENCH_CARD,
  EFFECT_TYPES.DAMAGE_EXTRA_BY_TARGET_TYPE,
  EFFECT_TYPES.DAMAGE_EXTRA_BY_DICE,
  EFFECT_TYPES.DAMAGE_EXTRA_BY_COIN,
  EFFECT_TYPES.DAMAGE_CONSECUTIVE_STACK,
  EFFECT_TYPES.DAMAGE_SPLIT,
  EFFECT_TYPES.DAMAGE_TO_PREVIOUSLY_DAMAGED_BENCH,
  EFFECT_TYPES.COUNTER_DAMAGE,
]);

const HEAL_EFFECTS = new Set([
  EFFECT_TYPES.HEAL,
  EFFECT_TYPES.HEAL_BY_DAMAGE_DEALT,
  EFFECT_TYPES.HEAL_PER_TURN,
  EFFECT_TYPES.GAIN_HP_FROM_KO,
]);

const ADD_ENERGY_EFFECTS = new Set([
  EFFECT_TYPES.ADD_ENERGY,
  EFFECT_TYPES.ADD_TYPED_ENERGY,
  EFFECT_TYPES.ADD_ENERGY_BY_COIN,
  EFFECT_TYPES.ADD_ENERGY_BY_DAMAGE_TAKEN,
  EFFECT_TYPES.ADD_ENERGY_ON_ATTACK,
]);

const REMOVE_ENERGY_EFFECTS = new Set([
  EFFECT_TYPES.REMOVE_ENERGY,
  EFFECT_TYPES.REMOVE_RANDOM_ENERGY,
  EFFECT_TYPES.DISCARD_OWN_ENERGY,
]);

const DRAW_EFFECTS = new Set([
  EFFECT_TYPES.DRAW_CARD,
  EFFECT_TYPES.DRAW_MULTIPLE,
]);

const SWITCH_EFFECTS = new Set([
  EFFECT_TYPES.SWITCH_OWN_ACTIVE,
  EFFECT_TYPES.SWITCH_OPPONENT_ACTIVE,
  EFFECT_TYPES.FORCE_SWITCH_OPPONENT_ACTIVE,
  EFFECT_TYPES.OPPONENT_CHOOSES_NEW_ACTIVE,
  EFFECT_TYPES.PROMOTE_FROM_BENCH,
  EFFECT_TYPES.RESCUE_ACTIVE,
]);

const MOVE_ENERGY_EFFECTS = new Set([
  EFFECT_TYPES.MOVE_ENERGY,
  EFFECT_TYPES.MOVE_ALL_ENERGY_FROM_BENCH_TO_ACTIVE,
]);

const DEFENSE_PREP_EFFECTS = new Set([
  EFFECT_TYPES.REDUCE_DAMAGE,
  EFFECT_TYPES.REDUCE_NEXT_DAMAGE,
  EFFECT_TYPES.HALVE_DAMAGE_TAKEN,
  EFFECT_TYPES.PREVENT_DAMAGE,
]);

const HAND_DECK_EFFECTS = new Set([
  EFFECT_TYPES.SEARCH_RANDOM_BASIC,
  EFFECT_TYPES.LOOK_TOP_DECK,
  EFFECT_TYPES.REVEAL_OPPONENT_HAND,
  EFFECT_TYPES.REVEAL_ONE_CARD,
  EFFECT_TYPES.SHUFFLE_OPPONENT_HAND,
  EFFECT_TYPES.OPPONENT_DRAWS_RANDOM,
  EFFECT_TYPES.SWAP_HAND_CARD_RANDOM,
  EFFECT_TYPES.FORCE_OPPONENT_SWAP_CARD,
  EFFECT_TYPES.RETURN_CARD_TO_DECK,
  EFFECT_TYPES.RESURRECT_TO_DECK,
  EFFECT_TYPES.RESURRECT_FROM_DISCARD,
  EFFECT_TYPES.DISCARD_CARD,
  EFFECT_TYPES.SEARCH_CARD_BY_FILTER,
]);

const STATUS_EFFECTS = new Set([
  EFFECT_TYPES.BURN,
  EFFECT_TYPES.PARALYZE,
  EFFECT_TYPES.FREEZE,
  EFFECT_TYPES.CONFUSE,
  EFFECT_TYPES.PREVENT_ATTACK,
  EFFECT_TYPES.PREVENT_RETREAT,
  EFFECT_TYPES.BLOCK_RETREAT,
  EFFECT_TYPES.SKIP_NEXT_ATTACK,
  EFFECT_TYPES.CANNOT_USE_SAME_ATTACK_NEXT_TURN,
  EFFECT_TYPES.POISON,
  EFFECT_TYPES.DAMAGE_OVER_TIME,
  EFFECT_TYPES.STATUS_ON_ATTACKER,
]);

const BUFF_EFFECTS = new Set([
  EFFECT_TYPES.BUFF_DAMAGE,
  EFFECT_TYPES.BUFF_DAMAGE_THIS_TURN,
  EFFECT_TYPES.BUFF_DAMAGE_NEXT_TURN,
  EFFECT_TYPES.BUFF_EQUIPPED_CARD_DAMAGE,
  EFFECT_TYPES.BUFF_DAMAGE_BY_TAG,
  EFFECT_TYPES.BUFF_DAMAGE_BY_ATTACHED_ENERGY,
  EFFECT_TYPES.BUFF_BASE_ATTRIBUTES,
  EFFECT_TYPES.INCREASE_MAX_HP,
  EFFECT_TYPES.BUFF_HEAL_AMOUNT,
  EFFECT_TYPES.DOUBLE_DAMAGE_AGAINST_TYPE,
  EFFECT_TYPES.WEAKNESS_OVERRIDE,
  EFFECT_TYPES.ALPHA_POINT_OVERRIDE,
  EFFECT_TYPES.ENERGY_ANY_TYPE,
  EFFECT_TYPES.ENERGY_COST_REDUCTION,
  EFFECT_TYPES.ENERGY_REQUIRED_TYPE,
  EFFECT_TYPES.IGNORE_RETREAT_COST,
  EFFECT_TYPES.REDUCE_RETREAT_COST,
  EFFECT_TYPES.ATTACK_FROM_BENCH,
]);

const IMMUNITY_EFFECTS = new Set([
  EFFECT_TYPES.PREVENT_DAMAGE_TYPE,
  EFFECT_TYPES.IMMUNE_TO_DAMAGE_TYPE,
  EFFECT_TYPES.IMMUNE_TO_NEGATIVE_EFFECTS,
  EFFECT_TYPES.IGNORE_TOOL_EFFECTS,
  EFFECT_TYPES.REFLECT_DAMAGE,
  EFFECT_TYPES.REFLECT_DOUBLE_DAMAGE,
  EFFECT_TYPES.REDIRECT_DAMAGE,
  EFFECT_TYPES.SHARE_DAMAGE,
  EFFECT_TYPES.PREVENT_POINT_GAIN,
  EFFECT_TYPES.CANCEL_KNOCKOUT_POINT,
  EFFECT_TYPES.CANCEL_KNOCKOUT,
]);

const CONDITION_EFFECTS = new Set([
  EFFECT_TYPES.COIN_FLIP,
  EFFECT_TYPES.DICE_ROLL,
  EFFECT_TYPES.TAKE_DAMAGE_INSTEAD,
]);

const SPECIAL_EFFECTS = new Set([
  EFFECT_TYPES.COPY_OPPONENT_ITEM,
  EFFECT_TYPES.TRANSFORM_INTO_OPPONENT_BENCH_CARD,
  EFFECT_TYPES.ABSORB_OWN_BENCH_CARD,
  EFFECT_TYPES.CREATE_TEMPORARY_UNIT,
  EFFECT_TYPES.PLAY_ITEM_AS_UNIT,
  EFFECT_TYPES.DISCARD_EQUIPMENT_AFTER_TRIGGER,
]);

const ONE_TURN_STATUSES = new Set([
  "paralyze",
  "freeze",
  "prevent_attack",
  "prevent_retreat",
  "block_retreat",
  "skip_next_attack",
  "cannot_use_same_attack",
]);

const draw = (player, amount = 1) => {
  const next = clone(player);
  for (let i = 0; i < amount; i += 1) {
    const card = next.deck.shift();
    if (card) next.hand.push(card);
  }
  return next;
};

const dealOpeningCards = cards => {
  let bestDeck = shuffle(cards);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const deck = shuffle(cards);
    if (deck.slice(0, INITIAL_HAND_SIZE).some(isBasicCharacter)) return deck;
    bestDeck = deck;
  }
  return bestDeck;
};

const makePlayer = (name, cards, turnNumber, energyTypes = ["Universal"]) => {
  const availableEnergy = normalizeEnergyTypes(energyTypes);
  const player = {
    name,
    deck: dealOpeningCards(cards),
    hand: [],
    discard: [],
    active: null,
    bench: [],
    points: 0,
    energy_types: availableEnergy,
    energy_zone: {
      current: randomEnergy(availableEnergy),
      next: randomEnergy(availableEnergy),
    },
    energy_remaining: ENERGY_PER_TURN,
    master_used_this_turn: false,
    drew_this_turn: false,
  };

  return draw(player, INITIAL_HAND_SIZE);
};

export function createDuel(playerCards, opponentCards, playerEnergyTypes = ["Universal"], opponentEnergyTypes = ["Universal"]) {
  const turnNumber = 1;

  return {
    id: newInstanceId(),
    phase: "setup",
    turn: "setup",
    turn_number: turnNumber,
    turn_moment: TURN_MOMENTS.SETUP,
    turn_events: [],
    winner: null,
    log: ["Escolha as cartas iniciais."],
    players: {
      player: makePlayer("Voce", playerCards, turnNumber, playerEnergyTypes),
      opponent: makePlayer("Oponente", opponentCards, turnNumber, opponentEnergyTypes),
    },
  };
}

const opponentOf = side => side === "player" ? "opponent" : "player";

const withLog = (state, message) => ({
  ...state,
  log: [message, ...(state.log || [])].slice(0, 30),
});

const mustDrawBeforeAction = (state, side) => {
  const player = state.players?.[side];
  return (
    state.phase === "battle" &&
    !state.winner &&
    state.turn === side &&
    !player?.drew_this_turn &&
    (player?.deck || []).length > 0
  );
};

const requireDrawBeforeAction = (state, side) => (
  mustDrawBeforeAction(state, side)
    ? withLog(state, "Compre uma carta antes de agir.")
    : null
);

const updateSide = (state, side, updater) => ({
  ...state,
  players: {
    ...state.players,
    [side]: updater(state.players[side]),
  },
});

const targetCard = (player, zone, index = 0) => {
  if (zone === "active") return player.active;
  if (zone === "hand") return (player.hand || [])[index] || null;
  if (zone === "discard" || zone === "cemetery") return (player.discard || [])[index] || null;
  return (player.bench || [])[index] || null;
};

const cardWithoutEquipments = card => card ? { ...card, equipments: [] } : card;

const discardCardWithEquipments = (player, card) => {
  if (!card) return;
  player.discard.push(cardWithoutEquipments(card));
  (card.equipments || []).forEach(equipment => player.discard.push(equipment));
};

const discardEquipments = (player, card) => {
  (card?.equipments || []).forEach(equipment => player.discard.push(equipment));
};

const setTargetCard = (player, zone, index, card) => {
  const next = clone(player);
  if (zone === "active") next.active = card;
  else if (zone === "hand" && Array.isArray(next.hand)) next.hand[index] = card;
  else if ((zone === "discard" || zone === "cemetery") && Array.isArray(next.discard)) next.discard[index] = card;
  else if (Array.isArray(next.bench)) next.bench[index] = card;
  return next;
};

const removeTargetCard = (player, zone, index = 0) => {
  const next = clone(player);
  if (zone === "active") {
    const removed = next.active;
    next.active = null;
    return { player: next, removed };
  }
  const removed = next.bench[index] || null;
  if (removed) next.bench.splice(index, 1);
  return { player: next, removed };
};

const checkWinner = state => {
  const player = state.players.player;
  const opponent = state.players.opponent;
  if (player.points >= POINTS_TO_WIN) return { ...state, winner: "player" };
  if (opponent.points >= POINTS_TO_WIN) return { ...state, winner: "opponent" };
  if (!player.active && player.bench.length === 0) return { ...state, winner: "opponent" };
  if (!opponent.active && opponent.bench.length === 0) return { ...state, winner: "player" };
  return state;
};

const addStatus = (card, status) => ({
  ...card,
  status_effects: Array.from(new Set([...(card?.status_effects || []), status])),
});

const hasStatus = (card, status) => (card?.status_effects || []).includes(status);

const clearOneTurnStatuses = card => card ? ({
  ...card,
  status_effects: (card.status_effects || []).filter(status => !ONE_TURN_STATUSES.has(status)),
}) : card;

const clearSideTurnStatuses = player => ({
  ...player,
  active: clearOneTurnStatuses(player.active),
  bench: (player.bench || []).map(clearOneTurnStatuses),
});

const isAttackBlockedByStatus = card => (
  hasStatus(card, "paralyze") ||
  hasStatus(card, "freeze") ||
  hasStatus(card, "prevent_attack") ||
  hasStatus(card, "skip_next_attack")
);

const isRetreatBlockedByStatus = card => (
  hasStatus(card, "prevent_retreat") ||
  hasStatus(card, "block_retreat")
);

const randomIndex = list => list.length ? Math.floor(Math.random() * list.length) : -1;

const shuffleList = list => shuffle(list || []);

const handOwnerForEffect = (side, effect) => (
  String(effect.target || "").startsWith("OPPONENT") ? opponentOf(side) : side
);

const manualChoiceTargets = new Set([
  TARGETS.SELF_BENCH_CHOOSE,
  TARGETS.OPPONENT_BENCH_CHOOSE,
  TARGETS.ANY_BENCH_CHOOSE,
]);

const selectedTargetRefFromContext = context => {
  const reactionKey = context.currentDamageReactionKey || context.current_damage_reaction_key || "";
  const ref = (
    (reactionKey && (context.selectedTargetRefsByReactionKey?.[reactionKey] || context.selected_target_refs_by_reaction_key?.[reactionKey])) ||
    context.selectedTargetRef ||
    context.selected_target_ref ||
    null
  );
  if (!ref) return null;
  const index = parseInt(ref.index, 10);
  return {
    side: ref.side,
    zone: ref.zone,
    index: Number.isFinite(index) ? index : -1,
  };
};

const refsForPlayerCards = (state, side, zones = ["active", "bench"]) => [
  ...(zones.includes("active") && state.players[side]?.active ? [{ side, zone: "active", index: 0 }] : []),
  ...(zones.includes("bench")
    ? (state.players[side]?.bench || []).map((card, index) => card ? { side, zone: "bench", index } : null).filter(Boolean)
    : []),
];

const manualRefsForTarget = (state, side, target) => {
  const opponentSide = opponentOf(side);
  if ([TARGETS.SELF, TARGETS.SELF_ACTIVE].includes(target)) {
    return refsForPlayerCards(state, side, ["active"]);
  }
  if ([TARGETS.SELF_BENCH_CHOOSE, TARGETS.SELF_BENCH, TARGETS.ALL_SELF_BENCH, TARGETS.SELF_BENCH_RANDOM].includes(target)) {
    return refsForPlayerCards(state, side, ["bench"]);
  }
  if ([TARGETS.ANY_SELF_CARD, TARGETS.ALL_SELF_CARDS, TARGETS.ALL_ALLY].includes(target)) {
    return refsForPlayerCards(state, side, ["active", "bench"]);
  }
  if (target === TARGETS.OPPONENT_ACTIVE) {
    return refsForPlayerCards(state, opponentSide, ["active"]);
  }
  if ([TARGETS.OPPONENT_BENCH_CHOOSE, TARGETS.OPPONENT_BENCH, TARGETS.ALL_OPPONENT_BENCH, TARGETS.OPPONENT_BENCH_RANDOM].includes(target)) {
    return refsForPlayerCards(state, opponentSide, ["bench"]);
  }
  if ([TARGETS.ANY_OPPONENT_CARD, TARGETS.ALL_OPPONENT_CARDS, TARGETS.ALL_ENEMY, TARGETS.PREVIOUSLY_DAMAGED_OPPONENT].includes(target)) {
    return refsForPlayerCards(state, opponentSide, ["active", "bench"]);
  }
  if (target === TARGETS.ANY_BENCH_CHOOSE) {
    return [
      ...refsForPlayerCards(state, side, ["bench"]),
      ...refsForPlayerCards(state, opponentSide, ["bench"]),
    ];
  }
  if (target === TARGETS.ANY) {
    return [
      ...refsForPlayerCards(state, opponentSide, ["active", "bench"]),
      ...refsForPlayerCards(state, side, ["active", "bench"]),
    ];
  }
  return null;
};

const manualTargetRefsForEffect = (state, side, effect, context = {}) => {
  const requiresManualTarget = manualChoiceTargets.has(effect.target);
  const selectedRef = selectedTargetRefFromContext(context);
  if (!requiresManualTarget && !effect.allow_manual_target) return null;

  const allowedRefs = manualRefsForTarget(state, side, effect.target);
  if (!allowedRefs) return null;
  if (!selectedRef) return { applies: true, invalid: false, refs: [] };

  const valid = allowedRefs.some(ref => (
    ref.side === selectedRef.side &&
    ref.zone === selectedRef.zone &&
    ref.index === selectedRef.index
  ));
  const selectedCard = valid ? targetCard(state.players[selectedRef.side], selectedRef.zone, selectedRef.index) : null;
  const filtersMatch = !valid || targetFiltersMatchCard(selectedCard, effect.target_filters);

  return {
    applies: true,
    invalid: !valid || !filtersMatch,
    invalidReason: !valid ? "target" : !filtersMatch ? "filters" : "",
    refs: valid && filtersMatch ? [selectedRef] : [],
  };
};

const targetRefsForEffect = (state, side, effect, context = {}) => {
  const opponentSide = opponentOf(side);
  const player = state.players[side];
  const opponent = state.players[opponentSide];
  const ownBenchRefs = player.bench.map((card, index) => card ? { side, zone: "bench", index } : null).filter(Boolean);
  const opponentBenchRefs = opponent.bench.map((card, index) => card ? { side: opponentSide, zone: "bench", index } : null).filter(Boolean);
  const randomOne = refs => refs.length ? [refs[Math.floor(Math.random() * refs.length)]] : [];
  const randomMany = (refs, count) => shuffleList(refs).slice(0, Math.max(1, count || 1));
  const damageSourceRef = effect.damage_source_ref || context.damageSourceRef || context.sourceRef || null;
  const damageTargetRef = effect.damage_target_ref || context.damageTargetRef || context.targetRef || null;
  const manualTarget = manualTargetRefsForEffect(state, side, effect, context);

  if (manualTarget?.applies) return manualTarget.refs;

  if (effect.target_override) return [effect.target_override];
  if (effect.target === TARGETS.EQUIPPED_CARD && effect.equipped_card_ref) {
    return [effect.equipped_card_ref];
  }
  if (effect.target === TARGETS.DAMAGE_SOURCE && damageSourceRef) {
    return [damageSourceRef];
  }
  if (effect.target === TARGETS.DAMAGE_TARGET && damageTargetRef) {
    return [damageTargetRef];
  }
  if ([TARGETS.EQUIPPED_CARD, TARGETS.DAMAGE_SOURCE, TARGETS.DAMAGE_TARGET].includes(effect.target)) {
    return [];
  }

  if (effect.type === EFFECT_TYPES.DAMAGE_SELF) {
    return player.active ? [{ side, zone: "active", index: 0 }] : [];
  }
  if (effect.type === EFFECT_TYPES.DAMAGE_ACTIVE_AND_BENCH || effect.type === EFFECT_TYPES.DAMAGE_SPLIT) {
    return [
      ...(opponent.active ? [{ side: opponentSide, zone: "active", index: 0 }] : []),
      ...opponentBenchRefs,
    ];
  }
  if (effect.type === EFFECT_TYPES.DAMAGE_ALL_OPPONENT_BENCH) {
    return opponentBenchRefs;
  }
  if (effect.type === EFFECT_TYPES.DAMAGE_TO_PREVIOUSLY_DAMAGED_BENCH) {
    return opponentBenchRefs.filter(ref => {
      const card = targetCard(opponent, ref.zone, ref.index);
      return card && card.hp_remaining < card.hp;
    });
  }
  if (effect.type === EFFECT_TYPES.DAMAGE_RANDOM_TARGETS) {
    return randomMany([
      ...(opponent.active ? [{ side: opponentSide, zone: "active", index: 0 }] : []),
      ...opponentBenchRefs,
    ], effect.random_targets_count || effect.count || effect.hits || 1);
  }
  if ([EFFECT_TYPES.HEAL_BY_DAMAGE_DEALT, EFFECT_TYPES.HEAL_PER_TURN, EFFECT_TYPES.GAIN_HP_FROM_KO].includes(effect.type)) {
    return [
      ...(player.active ? [{ side, zone: "active", index: 0 }] : []),
      ...ownBenchRefs,
    ].slice(0, effect.type === EFFECT_TYPES.HEAL_PER_TURN ? undefined : 1);
  }
  if (effect.type === EFFECT_TYPES.DISCARD_OWN_ENERGY) {
    return player.active ? [{ side, zone: "active", index: 0 }] : [];
  }
  if (effect.type === EFFECT_TYPES.STATUS_ON_ATTACKER && damageSourceRef) {
    return [damageSourceRef];
  }

  switch (effect.target) {
    case TARGETS.ACTIVE:
    case TARGETS.SELF_ACTIVE:
    case TARGETS.SELF:
      return player.active ? [{ side, zone: "active", index: 0 }] : [];
    case TARGETS.BENCH:
    case TARGETS.SELF_BENCH:
    case TARGETS.ALL_SELF_BENCH:
      return ownBenchRefs;
    case TARGETS.ANY:
      return [
        ...(opponent.active ? [{ side: opponentSide, zone: "active", index: 0 }] : []),
        ...opponentBenchRefs,
        ...(player.active ? [{ side, zone: "active", index: 0 }] : []),
        ...ownBenchRefs,
      ].slice(0, 1);
    case TARGETS.ALL_ALLY:
      return [
        ...(player.active ? [{ side, zone: "active", index: 0 }] : []),
        ...ownBenchRefs,
      ];
    case TARGETS.ALL_ENEMY:
      return [
        ...(opponent.active ? [{ side: opponentSide, zone: "active", index: 0 }] : []),
        ...opponentBenchRefs,
      ];
    case TARGETS.SELF_BENCH_RANDOM:
      return randomOne(ownBenchRefs);
    case TARGETS.SELF_BENCH_CHOOSE:
    case TARGETS.ANY_BENCH_CHOOSE:
      return [];
    case TARGETS.SELF_BENCH_BY_NATURE:
      return ownBenchRefs.filter(ref => (targetCard(player, ref.zone, ref.index)?.natures || []).includes(effect.nature));
    case TARGETS.SELF_BENCH_BY_NAME:
      return ownBenchRefs.filter(ref => targetCard(player, ref.zone, ref.index)?.name === effect.card_name);
    case TARGETS.ANY_SELF_CARD:
      return player.active
        ? [{ side, zone: "active", index: 0 }]
        : player.bench.map((card, index) => card ? { side, zone: "bench", index } : null).filter(Boolean).slice(0, 1);
    case TARGETS.ALL_SELF_CARDS:
      return [
        ...(player.active ? [{ side, zone: "active", index: 0 }] : []),
        ...player.bench.map((card, index) => card ? { side, zone: "bench", index } : null).filter(Boolean),
      ];
    case TARGETS.OPPONENT_BENCH:
    case TARGETS.ALL_OPPONENT_BENCH:
      return opponentBenchRefs;
    case TARGETS.OPPONENT_BENCH_RANDOM:
      return randomOne(opponentBenchRefs);
    case TARGETS.OPPONENT_BENCH_CHOOSE:
      return [];
    case TARGETS.ANY_OPPONENT_CARD:
      return opponent.active
        ? [{ side: opponentSide, zone: "active", index: 0 }]
        : opponent.bench.map((card, index) => card ? { side: opponentSide, zone: "bench", index } : null).filter(Boolean).slice(0, 1);
    case TARGETS.ALL_OPPONENT_CARDS:
      return [
        ...(opponent.active ? [{ side: opponentSide, zone: "active", index: 0 }] : []),
        ...opponentBenchRefs,
      ];
    case TARGETS.PREVIOUSLY_DAMAGED_OPPONENT:
      return [
        ...(opponent.active && opponent.active.hp_remaining < opponent.active.hp ? [{ side: opponentSide, zone: "active", index: 0 }] : []),
        ...opponentBenchRefs.filter(ref => {
          const card = targetCard(opponent, ref.zone, ref.index);
          return card && card.hp_remaining < card.hp;
        }),
      ];
    case TARGETS.OPPONENT_ACTIVE:
    default:
      return opponent.active ? [{ side: opponentSide, zone: "active", index: 0 }] : [];
  }
};

const updateCardRef = (state, ref, updater) => updateSide(state, ref.side, p => {
  const updated = clone(p);
  if (ref.zone === "active") updated.active = updater(updated.active);
  else updated.bench[ref.index] = updater(updated.bench[ref.index]);
  return updated;
});

const inferredSourceRef = (state, side, sourceCard) => (
  state.players[side].active?.instance_id === sourceCard?.instance_id
    ? { side, zone: "active", index: 0 }
    : null
);

const effectConditionMatches = (state, effect, context) => {
  const condition = effect.condition || EFFECT_CONDITIONS.ALWAYS;
  if (!condition || condition === EFFECT_CONDITIONS.ALWAYS) return true;
  if (condition === context.trigger) return true;

  if (condition === EFFECT_CONDITIONS.EQUIPPED_CARD_HAS_EQUIPMENT && context.equippedCardRef) {
    const equipped = targetCard(
      state.players[context.equippedCardRef.side],
      context.equippedCardRef.zone,
      context.equippedCardRef.index
    );
    return (equipped?.equipments || []).length > 0;
  }

  return false;
};

const sourcePosition = ref => {
  if (ref?.zone === "bench") return "BENCH";
  if (ref?.zone === "hand") return "HAND";
  if (ref?.zone === "discard" || ref?.zone === "cemetery") return "DISCARD";
  return "ACTIVE";
};

const valuesInclude = (value, item) => {
  const list = Array.isArray(value)
    ? value
    : String(value || "").split(",").map(part => part.trim()).filter(Boolean);
  return list.includes(item);
};

const cardTags = card => [
  ...(card?.tags || []),
  ...(card?.meta?.tags || []),
].map(tag => String(tag).toUpperCase());

const normalizeStatusName = value => {
  const normalized = String(value || "").trim().toUpperCase();
  const map = {
    POISON: "poison",
    BURN: "burn",
    PARALYSIS: "paralyze",
    PARALYZE: "paralyze",
    FREEZE: "freeze",
    CONFUSED: "confuse",
    CONFUSE: "confuse",
    SLEEP: "sleep",
    PREVENT_ATTACK: "prevent_attack",
    PREVENT_RETREAT: "prevent_retreat",
    BLOCK_RETREAT: "block_retreat",
  };
  return map[normalized] || normalized.toLowerCase();
};

const compareValue = (actual, expected, comparison = "GTE") => {
  const left = Number(actual) || 0;
  const right = Number(expected) || 0;
  switch (String(comparison || "GTE").toUpperCase()) {
    case "GT": return left > right;
    case "LT": return left < right;
    case "LTE": return left <= right;
    case "EQ": return left === right;
    case "GTE":
    default: return left >= right;
  }
};

const benchCountByNature = (state, side, nature) => (
  (state.players[side]?.bench || []).filter(card => (
    !nature || (card?.natures || []).includes(nature)
  )).length
);

const safeFormulaValue = (formula, variables = {}) => {
  const source = String(formula || "").trim();
  if (!source) return null;
  let expression = source.replace(/benchCount\(['"]?([^'")]+)['"]?\)/g, (_, nature) => (
    String(variables.benchCount?.(nature) ?? 0)
  ));
  Object.entries(variables).forEach(([key, value]) => {
    if (typeof value !== "number") return;
    expression = expression.replace(new RegExp(`\\b${key}\\b`, "g"), String(value));
  });
  if (!/^[\d+\-*/().\s]+$/.test(expression)) return null;
  const tokens = expression.match(/\d+(?:\.\d+)?|[()+\-*/]/g) || [];
  const precedence = { "+": 1, "-": 1, "*": 2, "/": 2 };
  const output = [];
  const ops = [];
  tokens.forEach(token => {
    if (/^\d/.test(token)) output.push(Number(token));
    else if (token === "(") ops.push(token);
    else if (token === ")") {
      while (ops.length && ops[ops.length - 1] !== "(") output.push(ops.pop());
      ops.pop();
    } else {
      while (ops.length && precedence[ops[ops.length - 1]] >= precedence[token]) output.push(ops.pop());
      ops.push(token);
    }
  });
  while (ops.length) output.push(ops.pop());
  const stack = [];
  output.forEach(token => {
    if (typeof token === "number") stack.push(token);
    else {
      const b = stack.pop() ?? 0;
      const a = stack.pop() ?? 0;
      stack.push(token === "+" ? a + b : token === "-" ? a - b : token === "*" ? a * b : b === 0 ? 0 : a / b);
    }
  });
  const result = stack.pop();
  return Number.isFinite(result) ? Math.max(0, Math.floor(result)) : null;
};

const effectAmount = (effect, fallback, context = {}, state = null, side = "player", sourceCard = null, target = null) => (
  safeFormulaValue(effect.formula || effect.value_formula, {
    incomingDamage: Number(context.damageAmount || 0),
    baseAmount: Number(fallback || effect.amount || 0),
    amount: Number(effect.amount || fallback || 0),
    useCount: Number(sourceCard?.consecutive_damage_stack || 0),
    attachedEnergyCount: Number((sourceCard?.attached_energy || []).length),
    targetEnergyCount: Number((target?.attached_energy || []).length),
    benchCount: nature => state ? benchCountByNature(state, side, nature) : 0,
  }) ?? fallback
);

const sortByPriority = list => [...list].sort((a, b) => (
  (parseInt(a.priority, 10) || 10) - (parseInt(b.priority, 10) || 10)
));

const metaValueMatches = (card, value) => {
  const key = value?.key || value?.meta_key;
  const expected = Array.isArray(value?.values) ? value.values : String(value?.values || value?.value || "").split(",");
  const normalizedExpected = expected.map(item => String(item).trim().toUpperCase()).filter(Boolean);
  if (!key || normalizedExpected.length === 0) return false;
  const current = card?.meta?.[key];
  const values = Array.isArray(current) ? current : [current];
  return values.map(item => String(item).trim().toUpperCase()).some(item => normalizedExpected.includes(item));
};

const ruleCardRefsForSide = (state, side, zones = ["active", "bench"]) => [
  ...(zones.includes("active") && state.players[side].active ? [{ side, zone: "active", index: 0 }] : []),
  ...(zones.includes("bench")
    ? state.players[side].bench.map((card, index) => card ? { side, zone: "bench", index } : null).filter(Boolean)
    : []),
];

const checkAbilityCondition = (state, condition, context) => {
  const sourceRef = context.sourceRef;
  const targetRef = context.damageTargetRef || context.targetRef || null;
  const source = sourceRef ? targetCard(state.players[sourceRef.side], sourceRef.zone, sourceRef.index) : context.sourceCard;
  const target = targetRef ? targetCard(state.players[targetRef.side], targetRef.zone, targetRef.index) : context.targetCard;
  const sourceSide = sourceRef?.side || context.side || "player";
  const baseResult = (() => {

  switch (condition.type) {
    case "SOURCE_IS_ACTIVE":
      return sourcePosition(sourceRef) === "ACTIVE";
    case "SOURCE_IS_ON_BENCH":
      return sourcePosition(sourceRef) === "BENCH";
    case "TARGET_IS_ACTIVE":
      return sourcePosition(targetRef) === "ACTIVE";
    case "TARGET_IS_ON_BENCH":
      return sourcePosition(targetRef) === "BENCH";
    case "SOURCE_POSITION":
      return String(condition.value || "ACTIVE").toUpperCase() === sourcePosition(sourceRef);
    case "TARGET_POSITION":
      return String(condition.value || "ACTIVE").toUpperCase() === sourcePosition(targetRef);
    case "TARGET_NATURE_IN":
      return (target?.natures || []).some(nature => valuesInclude(condition.value, nature));
    case "SOURCE_NATURE_IN":
      return (source?.natures || []).some(nature => valuesInclude(condition.value, nature));
    case "TARGET_CARD_TYPE_IN":
      return valuesInclude(condition.value, target?.card_type);
    case "SOURCE_CARD_TYPE_IN":
      return valuesInclude(condition.value, source?.card_type);
    case "TARGET_IS_DAMAGED":
      return target && (target.hp_remaining || 0) < (target.hp || 0);
    case "TARGET_HAS_ENERGY":
      return (target?.attached_energy || []).length > 0;
    case "SELF_HAS_ENERGY_TYPE":
      return (source?.attached_energy || []).some(type => valuesInclude(condition.value, type));
    case "SELF_ENERGY_COUNT_GTE":
      return (source?.attached_energy || []).length >= (parseInt(condition.value, 10) || 0);
    case "SELF_ENERGY_EQUALS":
      return (source?.attached_energy || []).length === (parseInt(condition.value, 10) || 0);
    case "TARGET_ENERGY_COUNT_GTE":
      return (target?.attached_energy || []).length >= (parseInt(condition.value, 10) || 0);
    case "BENCH_HAS_CARD_NAME":
      return state.players[sourceSide]?.bench?.some(card => card?.name === condition.value);
    case "TARGET_IS_CARD_NAME":
      return target?.name === condition.value;
    case "BENCH_HAS_NATURE":
      return state.players[sourceSide]?.bench?.some(card => (card?.natures || []).some(nature => valuesInclude(condition.value, nature)));
    case "BENCH_COUNT_BY_NATURE":
      return benchCountByNature(state, sourceSide, condition.value?.nature || condition.value) >= (parseInt(condition.value?.amount ?? condition.amount, 10) || 1);
    case "HAS_EQUIPMENT":
      return (source?.equipments || []).length > 0 || (target?.equipments || []).length > 0;
    case "SOURCE_HAS_EQUIPMENT":
      return (source?.equipments || []).length > 0;
    case "SOURCE_HAS_NO_EQUIPMENT":
      return (source?.equipments || []).length === 0;
    case "TARGET_HAS_EQUIPMENT":
      return (target?.equipments || []).length > 0;
    case "TARGET_HAS_TAG":
      return cardTags(target).some(tag => valuesInclude(condition.value, tag));
    case "TARGET_USES_ELEMENT":
      return (target?.meta?.elements || []).some(element => valuesInclude(condition.value, element));
    case "SOURCE_META_IN":
    case "SOURCE_META_VALUE_IN":
      return metaValueMatches(source, condition.value);
    case "TARGET_META_IN":
    case "TARGET_META_VALUE_IN":
      return metaValueMatches(target, condition.value);
    case "SOURCE_WAS_ATTACKED":
      return Boolean(source?.was_attacked_this_turn || source?.was_attacked);
    case "SOURCE_HAS_CONDITION":
      return (source?.status_effects || []).some(status => !condition.value || condition.value === "ANY" || normalizeStatusName(condition.value) === status);
    case "TARGET_HAS_CONDITION":
      return (target?.status_effects || []).some(status => !condition.value || condition.value === "ANY" || normalizeStatusName(condition.value) === status);
    case "DICE_RESULT_GTE":
      return compareValue(context.diceResult, condition.value, "GTE");
    case "DICE_RESULT_LTE":
      return compareValue(context.diceResult, condition.value, "LTE");
    case "COIN_IS_HEADS":
      return context.coinResult === "HEADS";
    case "COIN_IS_TAILS":
      return context.coinResult === "TAILS";
    case "IS_OWN_TURN":
      return state.turn === sourceSide;
    case "IS_OPPONENT_TURN":
      return state.turn !== sourceSide;
    case "SUPPORT_IS_ACTIVE":
      return Boolean(state.players[sourceSide]?.active_support);
    case "DAMAGE_AMOUNT_GTE":
      return (parseInt(context.damageAmount, 10) || 0) >= (parseInt(condition.value, 10) || 0);
    case "WOULD_BE_KNOCKED_OUT":
      return Boolean(context.wouldBeKnockedOut || (target && (target.hp_remaining || 0) <= (parseInt(context.damageAmount, 10) || 0)));
    case "ONCE_PER_TURN":
      return !source?.last_rule_turn || source.last_rule_turn !== state.turn_number;
    default:
      return false;
  }
  })();
  return condition.negate ? !baseResult : baseResult;
};

const ruleTriggerMatches = (ruleTrigger, trigger, sourceRef) => {
  if (ruleTrigger === trigger) return true;
  if (ruleTrigger === ABILITY_TRIGGERS.ON_ITEM_USE && trigger === ABILITY_TRIGGERS.ON_ITEM_USED) return true;
  if (ruleTrigger === ABILITY_TRIGGERS.ON_ITEM_USED && trigger === ABILITY_TRIGGERS.ON_ITEM_USE) return true;
  if (ruleTrigger === ABILITY_TRIGGERS.ON_RECEIVE_DAMAGE) {
    return [
      ABILITY_TRIGGERS.BEFORE_DAMAGE_TAKEN,
      ABILITY_TRIGGERS.ON_DAMAGE_TAKEN,
    ].includes(trigger);
  }
  if (ruleTrigger === ABILITY_TRIGGERS.ON_KO) {
    return [ABILITY_TRIGGERS.BEFORE_KNOCKOUT, ABILITY_TRIGGERS.AFTER_KNOCKOUT].includes(trigger);
  }
  if (ruleTrigger === ABILITY_TRIGGERS.ON_OPPONENT_KO) {
    return [ABILITY_TRIGGERS.ON_KNOCKOUT, ABILITY_TRIGGERS.AFTER_KNOCKOUT].includes(trigger);
  }
  if (ruleTrigger === ABILITY_TRIGGERS.INTERRUPT) {
    return [
      ABILITY_TRIGGERS.BEFORE_DAMAGE_TAKEN,
      ABILITY_TRIGGERS.BEFORE_DAMAGE_APPLIED,
      ABILITY_TRIGGERS.BEFORE_ALLY_ACTIVE_TAKES_DAMAGE,
      ABILITY_TRIGGERS.ALLY_ACTIVE_WOULD_BE_KNOCKED_OUT,
    ].includes(trigger);
  }
  if (ruleTrigger === ABILITY_TRIGGERS.PASSIVE_ACTIVE) {
    return sourceRef?.zone === "active" && [
      ABILITY_TRIGGERS.ON_TURN_START,
      ABILITY_TRIGGERS.ON_TURN_END,
      ABILITY_TRIGGERS.BEFORE_DAMAGE_TAKEN,
      ABILITY_TRIGGERS.BEFORE_DAMAGE_APPLIED,
      ABILITY_TRIGGERS.BEFORE_KNOCKOUT,
      ABILITY_TRIGGERS.ALLY_ACTIVE_WOULD_BE_KNOCKED_OUT,
      ABILITY_TRIGGERS.ON_DAMAGE_TAKEN,
      ABILITY_TRIGGERS.ON_ENERGY_ATTACHED,
    ].includes(trigger);
  }
  if (ruleTrigger === ABILITY_TRIGGERS.PASSIVE_BENCH) {
    return sourceRef?.zone === "bench" && [
      ABILITY_TRIGGERS.BEFORE_ATTACK,
      ABILITY_TRIGGERS.ON_ATTACK,
      ABILITY_TRIGGERS.ON_TURN_START,
      ABILITY_TRIGGERS.ON_TURN_END,
      ABILITY_TRIGGERS.BEFORE_DAMAGE_TAKEN,
      ABILITY_TRIGGERS.BEFORE_DAMAGE_APPLIED,
      ABILITY_TRIGGERS.BEFORE_ALLY_ACTIVE_TAKES_DAMAGE,
      ABILITY_TRIGGERS.ALLY_ACTIVE_WOULD_BE_KNOCKED_OUT,
      ABILITY_TRIGGERS.BEFORE_KNOCKOUT,
      ABILITY_TRIGGERS.ON_DAMAGE_TAKEN,
      ABILITY_TRIGGERS.AFTER_DAMAGE_APPLIED,
      ABILITY_TRIGGERS.ON_ENERGY_ATTACHED,
      ABILITY_TRIGGERS.ON_KNOCKOUT,
      ABILITY_TRIGGERS.AFTER_KNOCKOUT,
    ].includes(trigger);
  }
  return false;
};

function resolveChainTrigger(state, side, trigger, context = {}) {
  const depth = parseInt(context.chainDepth, 10) || 0;
  if (!trigger || depth >= MAX_CHAIN_DEPTH) {
    return depth >= MAX_CHAIN_DEPTH ? withLog(state, "Limite de cadeia de efeitos atingido.") : state;
  }
  return resolveAbilityRulesForSide(state, side, trigger, {
    ...context,
    chainDepth: depth + 1,
  });
}

function resolveAbilityRules(state, side, sourceRef, trigger, context = {}) {
  const source = sourceRef ? targetCard(state.players[sourceRef.side], sourceRef.zone, sourceRef.index) : null;
  if (!source) return state;

  return automaticAbilities(source).reduce((next, ability) => {
    const currentSource = targetCard(next.players[sourceRef.side], sourceRef.zone, sourceRef.index);
    if (!currentSource || !canPayAbility(currentSource, ability)) return next;
    const rules = sortByPriority(normalizeAbilityRules(ability.rules).filter(rule => ruleTriggerMatches(rule.trigger, trigger, sourceRef)));
    if (rules.length === 0) return next;

    return rules.reduce((afterRule, rule) => {
      const ruleSource = targetCard(afterRule.players[sourceRef.side], sourceRef.zone, sourceRef.index);
      if (!ruleSource || !canPayAbility(ruleSource, ability)) return afterRule;
      if (rule.once_per_turn && ruleSource.last_rule_turn === afterRule.turn_number) return afterRule;
      const ruleContext = {
        ...context,
        trigger,
        sourceRef,
        sourceCard: ruleSource,
      };
      if (!rule.conditions.every(condition => checkAbilityCondition(afterRule, condition, ruleContext))) return afterRule;
      let resolved = resolveEffects(afterRule, side, ruleSource, sortByPriority(rule.effects), {
        ...ruleContext,
        suppressRuleTriggers: true,
        skipKnockoutCheck: true,
      });
      if (rule.once_per_turn) {
        resolved = updateCardRef(resolved, sourceRef, card => ({ ...card, last_rule_turn: resolved.turn_number }));
      }
      if (rule.chainTrigger) {
        const chainSide = rule.chainTarget === "OPPONENT" ? opponentOf(side) : side;
        resolved = resolveChainTrigger(resolved, chainSide, rule.chainTrigger, ruleContext);
      }
      return withLog(resolved, `${ruleSource.name} ativou ${ability.name}.`);
    }, next);
  }, state);
}

function effectsForAbilityTrigger(state, side, sourceRef, ability, trigger, context = {}) {
  const rules = normalizeAbilityRules(ability?.rules);
  if (rules.length === 0) return abilityEffects(ability);
  const source = sourceRef ? targetCard(state.players[sourceRef.side], sourceRef.zone, sourceRef.index) : null;
  return rules
    .filter(rule => ruleTriggerMatches(rule.trigger, trigger, sourceRef))
    .filter(rule => rule.conditions.every(condition => checkAbilityCondition(state, condition, {
      ...context,
      trigger,
      sourceRef,
      sourceCard: source,
    })))
    .sort((a, b) => (parseInt(a.priority, 10) || 10) - (parseInt(b.priority, 10) || 10))
    .flatMap(rule => sortByPriority(rule.effects));
}

function resolveAbilityRulesForSide(state, side, trigger, context = {}, zones = ["active", "bench"]) {
  return ruleCardRefsForSide(state, side, zones).reduce((next, ref) => (
    resolveAbilityRules(next, side, ref, trigger, context)
  ), state);
}

const damageReactionOptions = (state, defendingSide, damageTargetRef, damageSourceRef, damageAmount, context = {}) => (
  ruleCardRefsForSide(state, defendingSide).flatMap(sourceRef => {
    const source = targetCard(state.players[sourceRef.side], sourceRef.zone, sourceRef.index);
    if (!source) return [];
    const damageTarget = targetCard(state.players[damageTargetRef.side], damageTargetRef.zone, damageTargetRef.index);
    const wouldBeKnockedOut = Boolean(damageTarget && (damageTarget.hp_remaining || 0) <= damageAmount);
    const triggers = [
      ABILITY_TRIGGERS.BEFORE_DAMAGE_TAKEN,
      ABILITY_TRIGGERS.BEFORE_DAMAGE_APPLIED,
      damageTargetRef.zone === "active" ? ABILITY_TRIGGERS.BEFORE_ALLY_ACTIVE_TAKES_DAMAGE : null,
      wouldBeKnockedOut ? ABILITY_TRIGGERS.ALLY_ACTIVE_WOULD_BE_KNOCKED_OUT : null,
    ].filter(Boolean);

    return automaticAbilities(source).flatMap((ability, abilityIndex) => {
      if (!canPayAbility(source, ability)) return [];

      return sortByPriority(normalizeAbilityRules(ability.rules))
        .map((rule, ruleIndex) => ({ rule, ruleIndex }))
        .filter(({ rule }) => triggers.some(trigger => ruleTriggerMatches(rule.trigger, trigger, sourceRef)))
        .filter(({ rule }) => rule.conditions.every(condition => checkAbilityCondition(state, condition, {
          ...context,
          trigger: rule.trigger,
          sourceRef,
          sourceCard: source,
          damageSourceRef,
          damageTargetRef,
          targetRef: damageTargetRef,
          damageAmount,
          wouldBeKnockedOut,
        })))
        .map(({ rule, ruleIndex }) => ({
          side: defendingSide,
          sourceRef,
          sourceCard: source,
          ability,
          abilityIndex,
          rule,
          ruleIndex,
          reactionKey: damageReactionKey(sourceRef, abilityIndex, ruleIndex),
        }))
        .filter(option => !context.usedDamageReactionKeys?.has(option.reactionKey))
        .filter(option => {
          const takesDamageInstead = normalizeEffects(option.rule.effects)
            .some(effect => effect.type === EFFECT_TYPES.TAKE_DAMAGE_INSTEAD);
          const sameTarget = option.sourceRef.side === damageTargetRef.side &&
            option.sourceRef.zone === damageTargetRef.zone &&
            option.sourceRef.index === damageTargetRef.index;
          return !(takesDamageInstead && sameTarget);
        });
    });
  })
);

const damageReactionKey = (sourceRef, abilityIndex, ruleIndex) => (
  `${sourceRef.side}:${sourceRef.zone}:${sourceRef.index}:${abilityIndex}:${ruleIndex}`
);

export function previewAttackDamageReactionOptions(state, attackingSide, abilityIndex, context = {}) {
  if (state.phase !== "battle" || state.winner || state.turn !== attackingSide) return [];
  const attacker = state.players[attackingSide];
  const sourceCard = attacker?.active;
  const targetSide = opponentOf(attackingSide);
  const targetCardRef = state.players[targetSide]?.active ? { side: targetSide, zone: "active", index: 0 } : null;
  if (!sourceCard || !targetCardRef) return [];

  const sourceRef = { side: attackingSide, zone: "active", index: 0 };
  const ability = sourceCard.abilities?.[abilityIndex];
  if (!ability) return [];

  const effects = effectsForAbilityTrigger(state, attackingSide, sourceRef, ability, ABILITY_TRIGGERS.ON_ATTACK, context);
  const damageAmounts = normalizeEffects(effects)
    .filter(effect => DAMAGE_EFFECTS.has(effect.type))
    .map(effect => effectAmount(
      effect,
      Math.max(0, parseInt(effect.amount, 10) || parseInt(ability.damage, 10) || 0),
      context,
      state,
      attackingSide,
      sourceCard,
      targetCard(state.players[targetSide], "active", 0)
    ));
  const damageAmount = Math.max(0, ...damageAmounts, parseInt(ability.damage, 10) || 0);
  if (damageAmount <= 0) return [];

  return damageReactionOptions(state, targetSide, targetCardRef, sourceRef, damageAmount, context);
}

const applyDamageReaction = (state, options, details, chooseDamageReaction) => {
  if (!options.length || typeof chooseDamageReaction !== "function") {
    return { state, damageTargetRef: details.damageTargetRef };
  }

  let next = state;
  let damageTargetRef = details.damageTargetRef;
  let safety = 0;
  while (safety < MAX_CHAIN_DEPTH) {
    safety += 1;
    const remainingOptions = options.filter(option => {
      const key = option.reactionKey || damageReactionKey(option.sourceRef, option.abilityIndex, option.ruleIndex);
      return !details.context?.usedDamageReactionKeys?.has(key);
    });
    if (remainingOptions.length === 0) break;

    const choice = chooseDamageReaction({
      ...details,
      state: next,
      damageTargetRef,
      options: remainingOptions,
    });
    const choiceIndex = Number.isInteger(choice) ? choice : parseInt(choice, 10);
    if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= remainingOptions.length) {
      break;
    }

    const selected = remainingOptions[choiceIndex];
    const selectedKey = selected.reactionKey || damageReactionKey(selected.sourceRef, selected.abilityIndex, selected.ruleIndex);
    if (details.context) {
      if (!details.context.usedDamageReactionKeys) {
        details.context.usedDamageReactionKeys = new Set();
      }
      details.context.usedDamageReactionKeys.add(selectedKey);
    }
    const interceptsDamage = normalizeEffects(selected.rule.effects)
      .some(effect => effect.type === EFFECT_TYPES.TAKE_DAMAGE_INSTEAD);
    next = resolveEffects(next, selected.sourceRef.side, selected.sourceCard, selected.rule.effects, {
      ...details.context,
      trigger: selected.rule.trigger,
      sourceRef: selected.sourceRef,
      sourceCard: selected.sourceCard,
      damageSourceRef: details.damageSourceRef,
      damageTargetRef,
      targetRef: damageTargetRef,
      damageAmount: details.damageAmount,
      currentDamageReactionKey: selectedKey,
      suppressDamageReactions: true,
      suppressRuleTriggers: true,
      skipKnockoutCheck: true,
    });
    next = withLog(next, `${selected.sourceCard.name} ativou ${selected.ability.name}.`);
    damageTargetRef = interceptsDamage ? selected.sourceRef : damageTargetRef;
  }

  return { state: next, damageTargetRef };
};

function resolveEquipmentTrigger(state, side, equippedCardRef, trigger, context = {}) {
  const equipped = targetCard(state.players[equippedCardRef.side], equippedCardRef.zone, equippedCardRef.index);
  if (!equipped || (equipped.equipments || []).length === 0) return state;

  return (equipped.equipments || []).reduce((next, equipment) => {
    const effects = normalizeEffects(equipment.passive_effects)
      .filter(effect => shouldApplyEquipmentPassiveEffect(effect, trigger));
    if (effects.length === 0) return next;

    return resolveEffects(next, side, equipment, effects, {
      ...context,
      trigger,
      equippedCardRef,
      suppressEquipmentTriggers: true,
      skipKnockoutCheck: true,
    });
  }, state);
}

function resolveHandDeckEffect(state, side, effect, amount) {
  let next = state;
  const ownerSide = handOwnerForEffect(side, effect);
  const opponentSide = opponentOf(side);

  if (effect.type === EFFECT_TYPES.SEARCH_RANDOM_BASIC) {
    next = updateSide(next, side, p => {
      const updated = clone(p);
      const candidates = updated.deck
        .map((card, index) => ({ card, index }))
        .filter(({ card }) => isBasicCharacter(card));
      const pickIndex = randomIndex(candidates);
      if (pickIndex < 0) return updated;
      const [{ card, index }] = [candidates[pickIndex]];
      updated.hand.push(card);
      updated.deck.splice(index, 1);
      return updated;
    });
    return withLog(next, `${next.players[side].name} buscou uma carta basica aleatoria.`);
  }

  if (effect.type === EFFECT_TYPES.LOOK_TOP_DECK) {
    const topCards = next.players[side].deck.slice(0, amount || 1).map(card => card.name).join(", ") || "nenhuma carta";
    return withLog(next, `${next.players[side].name} olhou o topo do deck: ${topCards}.`);
  }

  if (effect.type === EFFECT_TYPES.REVEAL_OPPONENT_HAND) {
    const names = next.players[opponentSide].hand.map(card => card.name).join(", ") || "mao vazia";
    return withLog(next, `Mao do oponente revelada: ${names}.`);
  }

  if (effect.type === EFFECT_TYPES.REVEAL_ONE_CARD) {
    const hand = next.players[opponentSide].hand;
    const index = randomIndex(hand);
    return withLog(next, index >= 0 ? `Carta revelada: ${hand[index].name}.` : "Oponente nao tem cartas na mao.");
  }

  if (effect.type === EFFECT_TYPES.SHUFFLE_OPPONENT_HAND) {
    next = updateSide(next, opponentSide, p => ({ ...p, hand: shuffleList(p.hand) }));
    return withLog(next, "Mao do oponente embaralhada.");
  }

  if (effect.type === EFFECT_TYPES.OPPONENT_DRAWS_RANDOM) {
    next = updateSide(next, opponentSide, p => draw(p, amount || 1));
    return withLog(next, `Oponente comprou ${amount || 1} carta(s).`);
  }

  if (effect.type === EFFECT_TYPES.SWAP_HAND_CARD_RANDOM || effect.type === EFFECT_TYPES.FORCE_OPPONENT_SWAP_CARD) {
    const swapSide = effect.type === EFFECT_TYPES.FORCE_OPPONENT_SWAP_CARD ? opponentSide : ownerSide;
    next = updateSide(next, swapSide, p => {
      const updated = clone(p);
      const handIndex = randomIndex(updated.hand);
      if (handIndex < 0) return updated;
      const [card] = updated.hand.splice(handIndex, 1);
      updated.deck.push(card);
      updated.deck = shuffleList(updated.deck);
      const drawn = updated.deck.shift();
      if (drawn) updated.hand.push(drawn);
      return updated;
    });
    return withLog(next, `${next.players[swapSide].name} trocou uma carta da mao aleatoriamente.`);
  }

  if (effect.type === EFFECT_TYPES.RESURRECT_TO_DECK || effect.type === EFFECT_TYPES.RESURRECT_FROM_DISCARD) {
    next = updateSide(next, side, p => {
      const updated = clone(p);
      const candidates = updated.discard
        .map((card, index) => ({ card, index }))
        .filter(({ card }) => (
          (!effect.card_type || card.card_type === effect.card_type) &&
          (!effect.card_name || card.name === effect.card_name) &&
          (!effect.nature || (card.natures || []).includes(effect.nature)) &&
          (!effect.tag || cardTags(card).includes(String(effect.tag).toUpperCase()))
        ));
      const pickIndex = randomIndex(candidates);
      if (pickIndex < 0) return updated;
      const { card, index } = candidates[pickIndex];
      updated.discard.splice(index, 1);
      if (effect.type === EFFECT_TYPES.RESURRECT_TO_DECK) {
        updated.deck.push(toHandCard(card));
        updated.deck = shuffleList(updated.deck);
      } else if (updated.bench.length < BENCH_LIMIT) {
        updated.bench.push(makeInstance(card, state.turn_number));
      } else {
        updated.hand.push(toHandCard(card));
      }
      return updated;
    });
    return withLog(next, `${next.players[side].name} recuperou uma carta do cemiterio.`);
  }

  if (effect.type === EFFECT_TYPES.DISCARD_CARD) {
    next = updateSide(next, ownerSide, p => {
      const updated = clone(p);
      const discardIndex = randomIndex(updated.hand);
      if (discardIndex < 0) return updated;
      const [card] = updated.hand.splice(discardIndex, 1);
      updated.discard.push(card);
      return updated;
    });
    return withLog(next, `${next.players[ownerSide].name} descartou uma carta aleatoria.`);
  }

  return next;
}

function applyStatusEffect(card, effect) {
  const statusByType = {
    [EFFECT_TYPES.BURN]: "burn",
    [EFFECT_TYPES.PARALYZE]: "paralyze",
    [EFFECT_TYPES.FREEZE]: "freeze",
    [EFFECT_TYPES.CONFUSE]: "confuse",
    [EFFECT_TYPES.PREVENT_ATTACK]: "prevent_attack",
    [EFFECT_TYPES.PREVENT_RETREAT]: "prevent_retreat",
    [EFFECT_TYPES.BLOCK_RETREAT]: "block_retreat",
    [EFFECT_TYPES.SKIP_NEXT_ATTACK]: "skip_next_attack",
    [EFFECT_TYPES.CANNOT_USE_SAME_ATTACK_NEXT_TURN]: "cannot_use_same_attack",
    [EFFECT_TYPES.POISON]: "poison",
    [EFFECT_TYPES.DAMAGE_OVER_TIME]: "damage_over_time",
    [EFFECT_TYPES.STATUS_ON_ATTACKER]: normalizeStatusName(effect.condition_type || effect.tag || "PREVENT_ATTACK"),
  };
  const status = statusByType[effect.type] || effect.type.toLowerCase();
  return status ? addStatus(card, status) : card;
}

function applyBuffEffect(card, effect, amount) {
  if ([
    EFFECT_TYPES.BUFF_DAMAGE,
    EFFECT_TYPES.BUFF_DAMAGE_THIS_TURN,
    EFFECT_TYPES.BUFF_DAMAGE_NEXT_TURN,
    EFFECT_TYPES.BUFF_EQUIPPED_CARD_DAMAGE,
    EFFECT_TYPES.BUFF_DAMAGE_BY_TAG,
    EFFECT_TYPES.BUFF_DAMAGE_BY_ATTACHED_ENERGY,
  ].includes(effect.type)) {
    return { ...card, bonus_damage: (card.bonus_damage || 0) + amount };
  }

  if (effect.type === EFFECT_TYPES.BUFF_BASE_ATTRIBUTES || effect.type === EFFECT_TYPES.INCREASE_MAX_HP) {
    return {
      ...card,
      hp: (parseInt(card.hp, 10) || 0) + amount,
      hp_remaining: (parseInt(card.hp_remaining, 10) || 0) + amount,
    };
  }

  if (effect.type === EFFECT_TYPES.BUFF_HEAL_AMOUNT) {
    return { ...card, heal_bonus: (card.heal_bonus || 0) + amount };
  }

  if (effect.type === EFFECT_TYPES.DOUBLE_DAMAGE_AGAINST_TYPE) {
    return { ...card, double_damage_against: effect.nature || effect.tag || "ANY" };
  }

  if (effect.type === EFFECT_TYPES.WEAKNESS_OVERRIDE) {
    return { ...card, weakness_override: effect.nature || effect.tag || "none" };
  }

  if (effect.type === EFFECT_TYPES.ALPHA_POINT_OVERRIDE) {
    return { ...card, knockout_points: amount || 1 };
  }

  if (effect.type === EFFECT_TYPES.ENERGY_ANY_TYPE) {
    return { ...card, energy_any_type: true };
  }

  if (effect.type === EFFECT_TYPES.ENERGY_COST_REDUCTION) {
    return { ...card, energy_cost_reduction: (card.energy_cost_reduction || 0) + (amount || 1) };
  }

  if (effect.type === EFFECT_TYPES.ENERGY_REQUIRED_TYPE) {
    return { ...card, required_energy_type: effect.energy_type || "Universal" };
  }

  if (effect.type === EFFECT_TYPES.IGNORE_RETREAT_COST) {
    return { ...card, ignore_retreat_cost: true };
  }

  if (effect.type === EFFECT_TYPES.REDUCE_RETREAT_COST) {
    return { ...card, retreat_cost_reduction: (card.retreat_cost_reduction || 0) + (amount || 1) };
  }

  if (effect.type === EFFECT_TYPES.ATTACK_FROM_BENCH) {
    return { ...card, can_attack_from_bench: true };
  }

  return card;
}

function applyImmunityEffect(card, effect, amount) {
  if (effect.type === EFFECT_TYPES.IMMUNE_TO_DAMAGE_TYPE) {
    return { ...card, immune_to_damage_type: effect.nature || effect.tag || "ANY" };
  }
  if (effect.type === EFFECT_TYPES.PREVENT_DAMAGE_TYPE) {
    return { ...card, immune_to_damage_type: effect.damage_type || effect.nature || effect.tag || "ANY" };
  }
  if (effect.type === EFFECT_TYPES.IMMUNE_TO_NEGATIVE_EFFECTS) {
    return { ...card, immune_to_negative_effects: true };
  }
  if (effect.type === EFFECT_TYPES.IGNORE_TOOL_EFFECTS) {
    return { ...card, ignore_tool_effects: true };
  }
  if (effect.type === EFFECT_TYPES.REFLECT_DAMAGE) {
    return { ...card, reflect_damage: amount || 1 };
  }
  if (effect.type === EFFECT_TYPES.REFLECT_DOUBLE_DAMAGE) {
    return { ...card, reflect_damage: 2 };
  }
  if (effect.type === EFFECT_TYPES.REDIRECT_DAMAGE) {
    return { ...card, redirect_damage: true };
  }
  if (effect.type === EFFECT_TYPES.SHARE_DAMAGE) {
    return { ...card, share_damage: true };
  }

  if (effect.type === EFFECT_TYPES.PREVENT_POINT_GAIN || effect.type === EFFECT_TYPES.CANCEL_KNOCKOUT_POINT) {
    return { ...card, prevent_point_gain: true };
  }
  if (effect.type === EFFECT_TYPES.CANCEL_KNOCKOUT) {
    return { ...card, cancel_next_knockout: true };
  }
  return card;
}

function resolveConditionEffect(state, side, effect, amount, sourceCard) {
  if (effect.type === EFFECT_TYPES.COIN_FLIP) {
    const success = Math.random() >= 0.5;
    const after = resolveEffects(state, side, sourceCard, success ? effect.success_effects : effect.fail_effects, {
      suppressRuleTriggers: true,
      skipKnockoutCheck: true,
    });
    return withLog(after, `Moeda: ${success ? "cara" : "coroa"}.`);
  }
  if (effect.type === EFFECT_TYPES.DICE_ROLL) {
    const rollCount = effect.roll_count_source === "SELF_BENCH_COUNT"
      ? Math.max(1, state.players[side].bench.length)
      : effect.roll_count_source === "ENERGY_COUNT"
        ? Math.max(1, (sourceCard?.attached_energy || []).length)
        : 1;
    const threshold = effect.dice_threshold || amount || 0;
    const comparison = effect.comparison || "GT";
    const rolls = Array.from({ length: rollCount }, () => Math.floor(Math.random() * 6) + 1);
    const compare = roll => (
      comparison === "GTE" ? roll >= threshold :
      comparison === "LTE" ? roll <= threshold :
      comparison === "EQ" ? roll === threshold :
      comparison === "LT" ? roll < threshold :
      roll > threshold
    );
    const successes = rolls.filter(compare).length;
    const after = resolveEffects(state, side, sourceCard, successes > 0 ? effect.success_effects : effect.fail_effects, {
      suppressRuleTriggers: true,
      skipKnockoutCheck: true,
    });
    return withLog(after, `Dado: ${rolls.join(", ")}. Sucessos: ${successes}.`);
  }
  if (effect.type === EFFECT_TYPES.TAKE_DAMAGE_INSTEAD) {
    return withLog(state, `${sourceCard?.name || "Carta"} entrou na frente do dano.`);
  }
  return state;
}

function resolveSpecialEffect(state, side, effect, amount, sourceCard) {
  let next = state;
  const opponentSide = opponentOf(side);

  if (effect.type === EFFECT_TYPES.COPY_OPPONENT_ITEM) {
    const item = [...next.players[opponentSide].discard, ...next.players[opponentSide].hand]
      .find(card => card.card_type === "Item");
    if (!item) return withLog(next, "Nenhum item do oponente para copiar.");
    next = resolveEffects(next, side, item, item.effects || [], { skipKnockoutCheck: true });
    return withLog(next, `${next.players[side].name} copiou ${item.name}.`);
  }

  if (effect.type === EFFECT_TYPES.TRANSFORM_INTO_OPPONENT_BENCH_CARD) {
    const template = next.players[opponentSide].bench[0];
    const ref = inferredSourceRef(next, side, sourceCard);
    if (!template || !ref) return next;
    next = updateCardRef(next, ref, card => ({
      ...makeInstance(template, state.turn_number),
      instance_id: card.instance_id,
      attached_energy: card.attached_energy || [],
      equipments: card.equipments || [],
      hp_remaining: Math.min(template.hp || 0, card.hp_remaining || template.hp || 0),
      transformed_from: card.name,
    }));
    return withLog(next, `${sourceCard.name} se transformou em ${template.name}.`);
  }

  if (effect.type === EFFECT_TYPES.ABSORB_OWN_BENCH_CARD) {
    const ref = inferredSourceRef(next, side, sourceCard);
    if (!ref || next.players[side].bench.length === 0) return next;
    const absorbed = next.players[side].bench[0];
    next = updateSide(next, side, p => {
      const updated = clone(p);
      updated.active = {
        ...updated.active,
        hp: (updated.active.hp || 0) + (absorbed.hp || 0),
        hp_remaining: (updated.active.hp_remaining || 0) + (absorbed.hp_remaining || absorbed.hp || 0),
        attached_energy: [...(updated.active.attached_energy || []), ...(absorbed.attached_energy || [])],
      };
      updated.discard.push(cardWithoutEquipments(absorbed));
      updated.bench.splice(0, 1);
      return updated;
    });
    return withLog(next, `${sourceCard.name} absorveu ${absorbed.name}.`);
  }

  if (effect.type === EFFECT_TYPES.CREATE_TEMPORARY_UNIT || effect.type === EFFECT_TYPES.PLAY_ITEM_AS_UNIT) {
    next = updateSide(next, side, p => {
      const updated = clone(p);
      if (updated.bench.length >= BENCH_LIMIT) return updated;
      updated.bench.push(makeInstance({
        id: newInstanceId(),
        name: effect.card_name || sourceCard?.name || "Unidade temporaria",
        card_type: "Personagem",
        hp: amount || 40,
        recuo: 0,
        abilities: [],
        natures: sourceCard?.natures || [],
      }, state.turn_number));
      return updated;
    });
    return withLog(next, `${next.players[side].name} criou uma unidade temporaria.`);
  }

  if (effect.type === EFFECT_TYPES.DISCARD_EQUIPMENT_AFTER_TRIGGER) {
    const equippedRef = effect.equipped_card_ref;
    if (!equippedRef) return next;
    next = updateCardRef(next, equippedRef, card => ({
      ...card,
      equipments: (card.equipments || []).slice(1),
    }));
    return withLog(next, "Um equipamento foi descartado apos ativar.");
  }

  return next;
}

function applyEndTurnEffects(state, side) {
  let next = state;
  const active = next.players[side].active;
  if (active && hasStatus(active, "burn")) {
    next = updateCardRef(next, { side, zone: "active", index: 0 }, card => ({
      ...card,
      hp_remaining: Math.max(0, (card.hp_remaining || 0) - 10),
    }));
    next = withLog(next, `${active.name} sofreu 10 de dano de queimadura.`);
    next = resolveKnockouts(next, opponentOf(side));
  }
  if (active && (hasStatus(active, "poison") || hasStatus(active, "damage_over_time"))) {
    next = updateCardRef(next, { side, zone: "active", index: 0 }, card => ({
      ...card,
      hp_remaining: Math.max(0, (card.hp_remaining || 0) - 10),
    }));
    next = withLog(next, `${active.name} sofreu 10 de dano continuo.`);
    next = resolveKnockouts(next, opponentOf(side));
  }
  if (!next.winner) {
    next = resolveAbilityRulesForSide(next, side, ABILITY_TRIGGERS.ON_TURN_END);
  }
  if (!next.winner) {
    next = updateSide(next, side, clearSideTurnStatuses);
  }
  return resolveKnockouts(next, side);
}

const resolveKnockouts = (state, attackerSide) => {
  let next = state;
  ["player", "opponent"].forEach(side => {
    const active = next.players[side].active;
    if (active && active.hp_remaining <= 0) {
      next = resolveAbilityRulesForSide(next, side, ABILITY_TRIGGERS.BEFORE_KNOCKOUT, {
        targetRef: { side, zone: "active", index: 0 },
        knockedOutCard: active,
        wouldBeKnockedOut: true,
      });
      const currentActive = next.players[side].active;
      if (!currentActive || currentActive.hp_remaining > 0) return;
      if (currentActive.cancel_next_knockout) {
        next = updateCardRef(next, { side, zone: "active", index: 0 }, card => ({
          ...card,
          hp_remaining: Math.max(1, card.hp_remaining || 0),
          cancel_next_knockout: false,
        }));
        next = withLog(next, `${currentActive.name} evitou o nocaute.`);
        return;
      }
      const points = currentActive.prevent_point_gain ? 0 : knockoutPoints(currentActive);
      next = resolveAbilityRulesForSide(next, attackerSide, ABILITY_TRIGGERS.ON_KNOCKOUT, {
        targetRef: { side, zone: "active", index: 0 },
        knockedOutCard: currentActive,
      });
      next = updateSide(next, attackerSide, p => ({ ...p, points: p.points + points }));
      next = updateSide(next, side, p => {
        const updated = clone(p);
        if (updated.active?.return_knocked_out_to_hand) {
          updated.hand.push(toHandCard(updated.active));
          discardEquipments(updated, updated.active);
        } else if (updated.active?.return_knocked_out_to_deck) {
          updated.deck.push(toHandCard(cardWithoutEquipments(updated.active)));
          updated.deck = shuffleList(updated.deck);
          discardEquipments(updated, updated.active);
        } else {
          discardCardWithEquipments(updated, updated.active);
        }
        updated.active = null;
        return updated;
      });
      next = resolveAbilityRulesForSide(next, attackerSide, ABILITY_TRIGGERS.AFTER_KNOCKOUT, {
        knockedOutCard: currentActive,
      });
      next = withLog(next, `${currentActive.name} foi nocauteada. ${next.players[attackerSide].name} ganhou ${points} ponto(s).`);
    }

    const defeatedBench = next.players[side].bench
      .map((card, index) => ({ card, index }))
      .filter(({ card }) => card && card.hp_remaining <= 0)
      .reverse();

    defeatedBench.forEach(({ card, index }) => {
      next = resolveAbilityRulesForSide(next, side, ABILITY_TRIGGERS.BEFORE_KNOCKOUT, {
        targetRef: { side, zone: "bench", index },
        knockedOutCard: card,
        wouldBeKnockedOut: true,
      });
      const currentCard = next.players[side].bench[index];
      if (!currentCard || currentCard.hp_remaining > 0) return;
      if (currentCard.cancel_next_knockout) {
        next = updateCardRef(next, { side, zone: "bench", index }, card => ({
          ...card,
          hp_remaining: Math.max(1, card.hp_remaining || 0),
          cancel_next_knockout: false,
        }));
        next = withLog(next, `${currentCard.name} evitou o nocaute.`);
        return;
      }
      const points = currentCard.prevent_point_gain ? 0 : knockoutPoints(currentCard);
      next = resolveAbilityRulesForSide(next, attackerSide, ABILITY_TRIGGERS.ON_KNOCKOUT, {
        targetRef: { side, zone: "bench", index },
        knockedOutCard: currentCard,
      });
      next = updateSide(next, attackerSide, p => ({ ...p, points: p.points + points }));
      next = updateSide(next, side, p => {
        const updated = clone(p);
        if (updated.bench[index]?.return_knocked_out_to_hand) {
          updated.hand.push(toHandCard(updated.bench[index]));
          discardEquipments(updated, updated.bench[index]);
        } else if (updated.bench[index]?.return_knocked_out_to_deck) {
          updated.deck.push(toHandCard(cardWithoutEquipments(updated.bench[index])));
          updated.deck = shuffleList(updated.deck);
          discardEquipments(updated, updated.bench[index]);
        } else {
          discardCardWithEquipments(updated, updated.bench[index]);
        }
        updated.bench.splice(index, 1);
        return updated;
      });
      next = resolveAbilityRulesForSide(next, attackerSide, ABILITY_TRIGGERS.AFTER_KNOCKOUT, {
        knockedOutCard: currentCard,
      });
      next = withLog(next, `${currentCard.name} foi nocauteada no banco. ${next.players[attackerSide].name} ganhou ${points} ponto(s).`);
    });
  });

  return checkWinner(next);
};

export function resolveEffects(state, side, sourceCard, effects, context = {}) {
  let next = state;
  let damageDealtThisResolution = 0;
  const sourceRef = context.sourceRef || inferredSourceRef(state, side, sourceCard);
  const normalized = sortByPriority(normalizeEffects(effects).map(effect => ({
    ...effect,
    target_override: context.targetOverride && DAMAGE_EFFECTS.has(effect.type) ? context.targetOverride : null,
    energy_source_override: context.energySourceOverride || null,
    equipped_card_ref: context.equippedCardRef || sourceRef,
    damage_source_ref: context.damageSourceRef || context.sourceRef || sourceRef,
    damage_target_ref: context.damageTargetRef || context.targetRef || null,
  })).filter(effect => effectConditionMatches(next, effect, context)));

  normalized.forEach(effect => {
    const amount = effectAmount(effect, Math.max(0, parseInt(effect.amount, 10) || 0), context, next, side, sourceCard);
    if (DRAW_EFFECTS.has(effect.type)) {
      next = updateSide(next, side, p => draw(p, amount || 1));
      next = withLog(next, `${next.players[side].name} comprou ${amount || 1} carta(s).`);
      return;
    }

    if (SWITCH_EFFECTS.has(effect.type)) {
      const switchSide = [
        EFFECT_TYPES.SWITCH_OPPONENT_ACTIVE,
        EFFECT_TYPES.FORCE_SWITCH_OPPONENT_ACTIVE,
        EFFECT_TYPES.OPPONENT_CHOOSES_NEW_ACTIVE,
      ].includes(effect.type) ? opponentOf(side) : side;
      const manualTarget = manualTargetRefsForEffect(next, side, effect, context);
      if (manualTarget?.invalid) {
        next = withLog(next, manualTarget.invalidReason === "filters" ? "Alvo escolhido não atende aos filtros." : "Alvo escolhido inválido.");
        return;
      }
      const benchIndex = manualTarget?.applies
        ? manualTarget.refs.find(ref => ref.side === switchSide && ref.zone === "bench")?.index
        : 0;
      if (manualTarget?.applies && !Number.isInteger(benchIndex)) return;

      if (next.players[switchSide].active && next.players[switchSide].bench[benchIndex]) {
        const oldActiveName = next.players[switchSide].active.name;
        next = updateSide(next, switchSide, p => {
          const updated = clone(p);
          const [replacement] = updated.bench.splice(benchIndex, 1);
          discardEquipments(updated, updated.active);
          updated.bench.push(cardWithoutEquipments(updated.active));
          updated.active = replacement;
          return updated;
        });
        next = withLog(next, `${next.players[switchSide].name} trocou ${oldActiveName} pela carta do banco.`);
        next = resolveChainTrigger(next, switchSide, ABILITY_TRIGGERS.ON_ENTER_ACTIVE, {
          ...context,
          targetRef: { side: switchSide, zone: "active", index: 0 },
        });
      }
      return;
    }

    if (MOVE_ENERGY_EFFECTS.has(effect.type)) {
      const sourceIndex = Number.isInteger(effect.energy_source_override)
        ? effect.energy_source_override
        : next.players[side].bench.findIndex(card => (card?.attached_energy || []).length > 0);
      const source = next.players[side].bench[sourceIndex];
      if (next.players[side].active && source && (source.attached_energy || []).length > 0) {
        const moveAmount = effect.type === EFFECT_TYPES.MOVE_ALL_ENERGY_FROM_BENCH_TO_ACTIVE
          ? source.attached_energy.length
          : Math.min(amount || 1, source.attached_energy.length);
        const moved = source.attached_energy.slice(0, moveAmount);
        next = updateSide(next, side, p => {
          const updated = clone(p);
          updated.active = {
            ...updated.active,
            attached_energy: [...(updated.active.attached_energy || []), ...moved],
          };
          updated.bench[sourceIndex] = {
            ...updated.bench[sourceIndex],
            attached_energy: (updated.bench[sourceIndex].attached_energy || []).slice(moveAmount),
          };
          return updated;
        });
        next = withLog(next, `${next.players[side].name} moveu ${moveAmount} energia(s) de ${source.name} para a ativa.`);
      }
      return;
    }

    if (HAND_DECK_EFFECTS.has(effect.type) && effect.type !== EFFECT_TYPES.RETURN_CARD_TO_DECK) {
      next = resolveHandDeckEffect(next, side, effect, amount);
      return;
    }

    if (CONDITION_EFFECTS.has(effect.type)) {
      next = resolveConditionEffect(next, side, effect, amount, sourceCard);
      return;
    }

    if (SPECIAL_EFFECTS.has(effect.type)) {
      next = resolveSpecialEffect(next, side, effect, amount, sourceCard);
      return;
    }

    const manualTarget = manualTargetRefsForEffect(next, side, effect, context);
    if (manualTarget?.invalid) {
      next = withLog(next, manualTarget.invalidReason === "filters" ? "Alvo escolhido não atende aos filtros." : "Alvo escolhido inválido.");
      return;
    }
    const refs = manualTarget?.applies ? manualTarget.refs : targetRefsForEffect(next, side, effect, context);
    if (refs.length === 0) return;

    refs.forEach(ref => {
      const target = targetCard(next.players[ref.side], ref.zone, ref.index);
      if (!target) return;

      if (DAMAGE_EFFECTS.has(effect.type)) {
        let redirectedRef = target.redirect_damage && ref.zone === "active" && next.players[ref.side].bench.length > 0
          ? { side: ref.side, zone: "bench", index: 0 }
          : ref;
        let redirectedTarget = targetCard(next.players[redirectedRef.side], redirectedRef.zone, redirectedRef.index) || target;
        if (
          redirectedTarget.immune_to_damage_type === "ANY" ||
          (redirectedTarget.immune_to_damage_type && (sourceCard?.natures || []).includes(redirectedTarget.immune_to_damage_type))
        ) {
          next = withLog(next, `${redirectedTarget.name} ignorou o dano.`);
          return;
        }
        const passiveBonus = sourceCard?.instance_id === next.players[side].active?.instance_id ? passiveDamageBonus(sourceCard) : 0;
        const staticBonus = parseInt(sourceCard?.bonus_damage, 10) || 0;
        const energySource = effect.energy_owner === "TARGET" ? redirectedTarget : sourceCard;
        const energyUnitAmount = effect.per_energy_amount || amount;
        const energyBonus = effect.type === EFFECT_TYPES.DAMAGE_EXTRA_BY_ENERGY
          ? (energySource?.attached_energy || []).filter(type => !effect.energy_type || type === effect.energy_type).length * energyUnitAmount
          : 0;
        const benchBonus = effect.type === EFFECT_TYPES.DAMAGE_EXTRA_BY_BENCH_CARD
          ? next.players[side].bench.filter(card =>
              (effect.card_name && card.name === effect.card_name) ||
              (effect.nature && (card.natures || []).includes(effect.nature)) ||
              (!effect.card_name && !effect.nature)
            ).length * amount
          : 0;
        const targetNatures = [effect.nature, ...(effect.natures || [])].filter(Boolean);
        const targetTags = [effect.tag, ...(effect.tags || [])].map(tag => String(tag).toUpperCase()).filter(Boolean);
        const targetTypeMatches = (
          (targetNatures.length === 0 && targetTags.length === 0) ||
          targetNatures.some(nature => (redirectedTarget.natures || []).includes(nature)) ||
          targetTags.some(tag => cardTags(redirectedTarget).includes(tag))
        );
        const targetTypeBonus = effect.type === EFFECT_TYPES.DAMAGE_EXTRA_BY_TARGET_TYPE && targetTypeMatches ? amount : 0;
        const diceBonus = effect.type === EFFECT_TYPES.DAMAGE_EXTRA_BY_DICE
          ? (Math.floor(Math.random() * 6) + 1) * amount
          : 0;
        const coinBonus = effect.type === EFFECT_TYPES.DAMAGE_EXTRA_BY_COIN
          ? (Math.random() >= 0.5 ? amount : 0)
          : 0;
        const consecutiveBonus = effect.type === EFFECT_TYPES.DAMAGE_CONSECUTIVE_STACK
          ? (parseInt(sourceCard?.consecutive_damage_stack, 10) || 0) * amount
          : 0;
        const splitAmount = effect.type === EFFECT_TYPES.DAMAGE_SPLIT && refs.length > 0
          ? Math.ceil(amount / refs.length)
          : amount;
        const reactionBaseDamage = Math.max(0, splitAmount + passiveBonus + staticBonus + energyBonus + benchBonus + diceBonus + coinBonus + consecutiveBonus);
        if (reactionBaseDamage > 0 && !context.suppressDamageReactions) {
          const damageSourceRef = effect.damage_source_ref || sourceRef;
          const options = damageReactionOptions(next, redirectedRef.side, redirectedRef, damageSourceRef, reactionBaseDamage, context);
          const reaction = applyDamageReaction(next, options, {
            side: redirectedRef.side,
            damageSourceRef,
            damageTargetRef: redirectedRef,
            damageAmount: reactionBaseDamage,
            sourceCard,
            targetCard: redirectedTarget,
            context,
          }, context.chooseDamageReaction);
          next = reaction.state;
          redirectedRef = reaction.damageTargetRef;
          redirectedTarget = targetCard(next.players[redirectedRef.side], redirectedRef.zone, redirectedRef.index);
          if (!redirectedTarget) return;
        }
        const doubleMultiplier = sourceCard?.double_damage_against === "ANY" ||
          (sourceCard?.double_damage_against && (redirectedTarget.natures || []).includes(sourceCard.double_damage_against))
          ? 2
          : 1;
        const rawTotal = Math.max(0, splitAmount + passiveBonus + staticBonus + energyBonus + benchBonus + targetTypeBonus + diceBonus + coinBonus + consecutiveBonus);
        const reduction = Math.max(0, parseInt(redirectedTarget.pending_damage_reduction, 10) || 0);
        const multiplier = (Number.isFinite(redirectedTarget.next_damage_multiplier) ? redirectedTarget.next_damage_multiplier : 1) * doubleMultiplier;
        const total = Math.max(0, Math.floor((rawTotal - reduction) * multiplier));
        next = updateCardRef(next, redirectedRef, card => ({
          ...card,
          hp_remaining: Math.max(0, (card.hp_remaining || 0) - total),
          pending_damage_reduction: 0,
          next_damage_multiplier: null,
        }));
        damageDealtThisResolution += total;
        next = withLog(next, `${sourceCard.name} causou ${total} de dano em ${redirectedTarget.name}.`);
        if (effect.type === EFFECT_TYPES.DAMAGE_CONSECUTIVE_STACK && sourceRef) {
          next = updateCardRef(next, sourceRef, card => ({
            ...card,
            consecutive_damage_stack: (parseInt(card.consecutive_damage_stack, 10) || 0) + 1,
          }));
        }
        if (total > 0 && redirectedTarget.reflect_damage && effect.damage_source_ref) {
          if (context.sourceType === "REFLECT") return;
          const reflected = redirectedTarget.reflect_damage === 2 ? total * 2 : Math.min(total, redirectedTarget.reflect_damage || total);
          next = updateCardRef(next, effect.damage_source_ref, card => ({
            ...card,
            hp_remaining: Math.max(0, (card.hp_remaining || 0) - reflected),
          }));
          next = withLog(next, `${redirectedTarget.name} refletiu ${reflected} de dano.`);
        }
        if (total > 0 && redirectedTarget.share_damage && effect.damage_source_ref) {
          next = updateCardRef(next, effect.damage_source_ref, card => ({
            ...card,
            hp_remaining: Math.max(0, (card.hp_remaining || 0) - total),
          }));
          next = withLog(next, `${redirectedTarget.name} compartilhou ${total} de dano.`);
        }
        if (total > 0 && !context.suppressEquipmentTriggers) {
          const damageSourceRef = effect.damage_source_ref || sourceRef;
          const damageTargetRef = redirectedRef;
          next = resolveEquipmentTrigger(
            next,
            redirectedRef.side,
            damageTargetRef,
            EFFECT_CONDITIONS.EQUIPPED_CARD_TAKES_DAMAGE,
            { damageSourceRef, damageTargetRef }
          );
          if (damageSourceRef) {
            next = resolveEquipmentTrigger(
              next,
              damageSourceRef.side,
              damageSourceRef,
              EFFECT_CONDITIONS.EQUIPPED_CARD_DEALS_DAMAGE,
              { damageSourceRef, damageTargetRef }
            );
          }
        }
        if (total > 0 && !context.suppressRuleTriggers) {
          const damageSourceRef = effect.damage_source_ref || sourceRef;
          const damageTargetRef = redirectedRef;
          if (damageSourceRef) {
            next = resolveAbilityRules(next, damageSourceRef.side, damageSourceRef, ABILITY_TRIGGERS.AFTER_DAMAGE_APPLIED, {
              damageSourceRef,
              damageTargetRef,
              targetRef: damageTargetRef,
              damageAmount: total,
              damageDealt: total,
            });
          }
          next = resolveAbilityRules(next, redirectedRef.side, damageTargetRef, ABILITY_TRIGGERS.ON_DAMAGE_TAKEN, {
            damageSourceRef,
            damageTargetRef,
            targetRef: damageTargetRef,
            damageAmount: total,
          });
          if (redirectedRef.zone === "active") {
            next = resolveAbilityRulesForSide(next, redirectedRef.side, ABILITY_TRIGGERS.ALLY_ACTIVE_TAKES_DAMAGE, {
              damageSourceRef,
              damageTargetRef,
              targetRef: damageTargetRef,
              damageAmount: total,
            });
          }
        }
      } else if (HEAL_EFFECTS.has(effect.type)) {
        const healAmount = effect.type === EFFECT_TYPES.HEAL_BY_DAMAGE_DEALT
          ? damageDealtThisResolution || amount
          : amount;
        const totalHeal = healAmount + (parseInt(target.heal_bonus, 10) || 0);
        next = updateCardRef(next, ref, card => ({
          ...card,
          hp_remaining: Math.min(card.hp || 0, (card.hp_remaining || 0) + totalHeal),
        }));
        next = withLog(next, `${target.name} recuperou ${totalHeal} HP.`);
      } else if (ADD_ENERGY_EFFECTS.has(effect.type)) {
        if (effect.type === EFFECT_TYPES.ADD_ENERGY_BY_COIN && Math.random() < 0.5) {
          next = withLog(next, `${target.name} nao recebeu energia na moeda.`);
          return;
        }
        const energyType = (
          effect.energy_type && effect.energy_type !== GENERIC_ENERGY_TYPE
            ? effect.energy_type
            : next.players[side].energy_zone?.current || randomEnergy(next.players[side].energy_types)
        );
        next = updateCardRef(next, ref, card => ({
          ...card,
          attached_energy: [
            ...(card.attached_energy || []),
            ...Array.from({ length: amount || 1 }, () => energyType),
          ],
        }));
        next = withLog(next, `${target.name} recebeu ${amount || 1} energia(s).`);
        if (!context.suppressRuleTriggers) {
          next = resolveChainTrigger(next, ref.side, ABILITY_TRIGGERS.ON_ENERGY_ATTACHED, {
            ...context,
            targetRef: ref,
            attachedEnergyType: energyType,
          });
        }
      } else if (REMOVE_ENERGY_EFFECTS.has(effect.type)) {
        const removeAmount = amount || 1;
        next = updateCardRef(next, ref, card => ({
          ...card,
          attached_energy: (() => {
            const energy = [...(card.attached_energy || [])];
            if (effect.type === EFFECT_TYPES.REMOVE_RANDOM_ENERGY) {
              for (let i = 0; i < removeAmount && energy.length > 0; i += 1) {
                energy.splice(randomIndex(energy), 1);
              }
              return energy;
            }
            return energy.slice(removeAmount);
          })(),
        }));
        next = withLog(next, `${target.name} perdeu ${removeAmount} energia(s).`);
      } else if (DEFENSE_PREP_EFFECTS.has(effect.type)) {
        next = updateCardRef(next, ref, card => ({
          ...card,
          pending_damage_reduction: effect.type === EFFECT_TYPES.PREVENT_DAMAGE
            ? 9999
            : (card.pending_damage_reduction || 0) + amount,
          next_damage_multiplier: effect.type === EFFECT_TYPES.HALVE_DAMAGE_TAKEN ? 0.5 : card.next_damage_multiplier,
        }));
        next = withLog(next, `${target.name} se preparou contra o proximo dano.`);
      } else if (effect.type === EFFECT_TYPES.REMOVE_CONDITIONS) {
        next = updateCardRef(next, ref, card => ({
          ...card,
          status_effects: effect.condition_type
            ? (card.status_effects || []).filter(status => status !== normalizeStatusName(effect.condition_type))
            : [],
        }));
        next = withLog(next, `${target.name} removeu condicao de status.`);
      } else if (STATUS_EFFECTS.has(effect.type)) {
        if (target.immune_to_negative_effects) {
          next = withLog(next, `${target.name} ignorou o efeito negativo.`);
          return;
        }
        next = updateCardRef(next, ref, card => applyStatusEffect(card, effect));
        next = withLog(next, `${target.name} recebeu um status.`);
        if (!context.suppressRuleTriggers) {
          next = resolveChainTrigger(next, ref.side, ABILITY_TRIGGERS.ON_CONDITION_APPLIED, {
            ...context,
            targetRef: ref,
            conditionType: effect.condition_type || effect.type,
          });
        }
      } else if (BUFF_EFFECTS.has(effect.type)) {
        next = updateCardRef(next, ref, card => applyBuffEffect(card, effect, amount));
        next = withLog(next, `${target.name} recebeu um efeito de suporte.`);
      } else if (IMMUNITY_EFFECTS.has(effect.type)) {
        next = updateCardRef(next, ref, card => applyImmunityEffect(card, effect, amount));
        next = withLog(next, `${target.name} recebeu um efeito defensivo.`);
      } else if (effect.type === EFFECT_TYPES.RETURN_KNOCKED_OUT_TO_HAND) {
        next = updateCardRef(next, ref, card => ({ ...card, return_knocked_out_to_hand: true }));
        next = withLog(next, `${target.name} voltara para a mao se for nocauteada.`);
      } else if (effect.type === EFFECT_TYPES.RETURN_TO_DECK_ON_KO) {
        next = updateCardRef(next, ref, card => ({ ...card, return_knocked_out_to_deck: true }));
        next = withLog(next, `${target.name} voltara para o deck se for nocauteada.`);
      } else if (effect.type === EFFECT_TYPES.CANCEL_KNOCKOUT) {
        next = updateCardRef(next, ref, card => ({ ...card, cancel_next_knockout: true }));
        next = withLog(next, `${target.name} pode cancelar o proximo nocaute.`);
      } else if (effect.type === EFFECT_TYPES.RETURN_CARD_TO_DECK) {
        next = updateSide(next, ref.side, p => {
          const { player: updated, removed } = removeTargetCard(p, ref.zone, ref.index);
          if (removed) {
            discardEquipments(updated, removed);
            updated.deck.push(toHandCard(cardWithoutEquipments(removed)));
            updated.deck = shuffleList(updated.deck);
          }
          return updated;
        });
        next = withLog(next, `${target.name} voltou para o deck.`);
      } else {
        next = withLog(next, `Efeito aplicado: ${effect.type}.`);
      }
    });
  });

  return context.skipKnockoutCheck ? next : resolveKnockouts(next, side);
}

export function setupActive(state, side, handIndex) {
  if (state.phase !== "setup") return state;
  const player = state.players[side];
  const card = player.hand[handIndex];
  if (!isBasicCharacter(card)) return state;

  let next = updateSide(state, side, p => {
    const updated = clone(p);
    if (updated.active) updated.hand.push(toHandCard(updated.active));
    updated.active = makeInstance(card, state.turn_number);
    updated.hand.splice(handIndex, 1);
    return updated;
  });

  return withLog(next, `${player.name} escolheu ${card.name} como ativa.`);
}

export function setupToBench(state, side, handIndex) {
  if (state.phase !== "setup") return state;
  const player = state.players[side];
  const card = player.hand[handIndex];
  if (!isBasicCharacter(card) || player.bench.length >= BENCH_LIMIT) return state;

  let next = updateSide(state, side, p => {
    const updated = clone(p);
    updated.bench.push(makeInstance(card, state.turn_number));
    updated.hand.splice(handIndex, 1);
    return updated;
  });

  return withLog(next, `${player.name} colocou ${card.name} no banco inicial.`);
}

export function setupBenchToHand(state, side, benchIndex) {
  if (state.phase !== "setup") return state;
  const player = state.players[side];
  const card = player.bench[benchIndex];
  if (!card) return state;

  return updateSide(state, side, p => {
    const updated = clone(p);
    updated.hand.push(toHandCard(card));
    updated.bench.splice(benchIndex, 1);
    return updated;
  });
}

export function finishSetup(state) {
  if (state.phase !== "setup") return state;
  if (!state.players.player.active || !state.players.opponent.active) return state;
  return withLog({
    ...state,
    phase: "battle",
    turn: "player",
    turn_moment: TURN_MOMENTS.ACTION,
    turn_events: [TURN_MOMENTS.TURN_START, TURN_MOMENTS.ACTION],
    players: {
      ...state.players,
      player: { ...state.players.player, drew_this_turn: true },
    },
  }, "Duelo iniciado.");
}

export function drawTurnCard(state, side) {
  if (state.phase !== "battle" || state.winner || state.turn !== side) return state;
  const player = state.players[side];
  if (player.drew_this_turn || (player.deck || []).length === 0) return state;

  let next = updateSide(state, side, p => ({
    ...draw(p, 1),
    drew_this_turn: true,
  }));

  next = {
    ...next,
    turn_moment: TURN_MOMENTS.ACTION,
    turn_events: Array.from(new Set([...(next.turn_events || []), TURN_MOMENTS.DRAW])),
  };

  return withLog(next, `${player.name} comprou 1 carta.`);
}

export function playToBench(state, side, handIndex) {
  if (state.phase !== "battle" || state.winner || state.turn !== side) return state;
  const drawBlock = requireDrawBeforeAction(state, side);
  if (drawBlock) return drawBlock;
  const player = state.players[side];
  const card = player.hand[handIndex];
  if (!isBasicCharacter(card) || player.bench.length >= BENCH_LIMIT) return state;

  let next = updateSide(state, side, p => {
    const updated = clone(p);
    updated.bench.push(makeInstance(card, state.turn_number));
    updated.hand.splice(handIndex, 1);
    return updated;
  });

  return withLog(next, `${player.name} colocou ${card.name} no banco.`);
}

export function evolveFromHand(state, side, handIndex, zone, targetIndex = 0) {
  if (state.phase !== "battle" || state.winner || state.turn !== side) return state;
  const drawBlock = requireDrawBeforeAction(state, side);
  if (drawBlock) return drawBlock;
  const player = state.players[side];
  const evolution = player.hand[handIndex];
  const target = targetCard(player, zone, targetIndex);

  if (!canEvolveTarget(evolution, target, state.turn_number)) {
    return state;
  }

  const damageTaken = Math.max(0, (target.hp || 0) - (target.hp_remaining || 0));
  const evolved = {
    ...makeInstance(evolution, state.turn_number),
    attached_energy: target.attached_energy || [],
    equipments: target.equipments || [],
    hp_remaining: Math.max(1, (evolution.hp || 0) - damageTaken),
    evolved_from: target.name,
  };

  let next = updateSide(state, side, p => {
    const updated = setTargetCard(p, zone, targetIndex, evolved);
    updated.hand.splice(handIndex, 1);
    updated.discard.push(cardWithoutEquipments(target));
    return updated;
  });

  next = withLog(next, `${player.name} evoluiu ${target.name} para ${evolution.name}.`);
  return resolveChainTrigger(next, side, ABILITY_TRIGGERS.ON_EVOLVE, {
    sourceRef: { side, zone, index: targetIndex },
    targetRef: { side, zone, index: targetIndex },
  });
}

export function findEvolutionTargets(state, side, handIndex) {
  if (state.phase !== "battle" || state.winner || state.turn !== side) return [];
  const player = state.players[side];
  const evolution = player.hand[handIndex];
  if (!evolution?.is_evolution) return [];

  return [
    ...(canEvolveTarget(evolution, player.active, state.turn_number) ? [{ zone: "active", index: 0 }] : []),
    ...player.bench
      .map((card, index) => canEvolveTarget(evolution, card, state.turn_number) ? { zone: "bench", index } : null)
      .filter(Boolean),
  ];
}

export function findEvolutionTarget(state, side, handIndex) {
  return findEvolutionTargets(state, side, handIndex)[0] || null;
}

export function canEvolveFromHand(state, side, handIndex) {
  return Boolean(findEvolutionTarget(state, side, handIndex));
}

export function evolveFromHandAuto(state, side, handIndex) {
  const target = findEvolutionTarget(state, side, handIndex);
  if (!target) return state;
  return evolveFromHand(state, side, handIndex, target.zone, target.index);
}

export function attachEnergy(state, side, zone, targetIndex) {
  if (state.phase !== "battle" || state.winner || state.turn !== side) return state;
  const drawBlock = requireDrawBeforeAction(state, side);
  if (drawBlock) return drawBlock;
  const player = state.players[side];
  const target = targetCard(player, zone, targetIndex);
  const energyType = player.energy_zone?.current;
  if (!target || player.energy_remaining <= 0) return state;

  let next = updateSide(state, side, p => {
    const updatedTarget = {
      ...target,
      attached_energy: [...(target.attached_energy || []), energyType],
    };
    const updated = setTargetCard(p, zone, targetIndex, updatedTarget);
    updated.energy_remaining -= 1;
    return updated;
  });

  next = withLog(next, `${player.name} anexou energia ${energyType} em ${target.name}.`);
  next = resolveAbilityRules(next, side, { side, zone, index: targetIndex }, ABILITY_TRIGGERS.ON_ENERGY_ATTACHED, {
    attachedEnergyType: energyType,
    targetRef: { side, zone, index: targetIndex },
  });
  return resolveKnockouts(next, side);
}

export function canAttackThisTurn(state, side, abilityIndex = null) {
  if (state.phase !== "battle" || state.winner || state.turn !== side) return false;
  if (mustDrawBeforeAction(state, side)) return false;
  if (state.turn_number <= 1) return false;
  const active = state.players[side].active;
  if (!active || isAttackBlockedByStatus(active)) return false;
  if (abilityIndex !== null && hasStatus(active, "cannot_use_same_attack")) {
    const ability = active.abilities?.[abilityIndex];
    if (ability?.name && ability.name === active.last_used_ability_name) return false;
  }
  return true;
}

export function activateAbility(state, side, abilityIndex, context = {}) {
  if (state.phase !== "battle" || state.winner || state.turn !== side) return state;
  const drawBlock = requireDrawBeforeAction(state, side);
  if (drawBlock) return drawBlock;
  const attacker = state.players[side];
  const active = attacker.active;
  const ability = active?.abilities?.[abilityIndex];
  if (!active || !ability || !canPayAbility(active, ability)) return state;
  if (!canAttackThisTurn(state, side, abilityIndex)) {
    return withLog(state, state.turn_number <= 1 ? "Nao e possivel atacar no primeiro turno." : `${active.name} nao pode atacar agora.`);
  }
  if (hasStatus(active, "confuse") && Math.random() < 0.5) {
    return endTurn(withLog(state, `${active.name} ficou confuso e falhou o ataque.`));
  }

  let next = withLog({ ...state, turn_moment: TURN_MOMENTS.ATTACK }, `${attacker.name} usou ${ability.name}.`);
  const sourceRef = { side, zone: "active", index: 0 };
  next = resolveAbilityRulesForSide(next, side, ABILITY_TRIGGERS.BEFORE_ATTACK, {
    ...context,
    sourceRef,
  }, ["bench"]);
  next = resolveAbilityRules(next, side, sourceRef, ABILITY_TRIGGERS.BEFORE_ATTACK, {
    ...context,
    sourceRef,
  });
  next = resolveEffects(next, side, active, effectsForAbilityTrigger(next, side, sourceRef, ability, ABILITY_TRIGGERS.ON_ATTACK, context), {
    ...context,
    sourceRef,
  });
  next = resolveAbilityRulesForSide(next, side, ABILITY_TRIGGERS.ON_ATTACK, {
    ...context,
    sourceRef,
  }, ["bench"]);
  next = updateSide(next, side, p => ({
    ...p,
    active: p.active ? { ...p.active, last_used_ability_name: ability.name } : p.active,
  }));
  return next.winner ? next : endTurn(next);
}

export function activateManualAbility(state, {
  side = "player",
  sourceRef,
  abilityIndex = 0,
  selectedTargetRef = null,
} = {}) {
  if (state.phase !== "battle" || state.winner || state.turn !== side) return state;
  const drawBlock = requireDrawBeforeAction(state, side);
  if (drawBlock) return drawBlock;
  if (!sourceRef || sourceRef.side !== side || !["active", "bench"].includes(sourceRef.zone)) return state;

  const source = targetCard(state.players[side], sourceRef.zone, sourceRef.index);
  const abilities = automaticAbilities(source);
  const ability = abilities[abilityIndex];
  if (!source || !ability) return state;
  if (!canPayAbility(source, ability)) {
    return withLog(state, `${source.name} nao tem energia suficiente para ativar ${ability.name}.`);
  }

  const rules = sortByPriority(
    normalizeAbilityRules(ability.rules)
      .filter(rule => ruleTriggerMatches(rule.trigger, ABILITY_TRIGGERS.MANUAL_ABILITY, sourceRef))
  );
  if (rules.length === 0) return state;

  let next = state;
  let applied = false;
  rules.forEach(rule => {
    const currentSource = targetCard(next.players[side], sourceRef.zone, sourceRef.index);
    if (!currentSource || !canPayAbility(currentSource, ability)) return;
    if (rule.once_per_turn && currentSource.last_rule_turn === next.turn_number) return;

    const ruleContext = {
      selectedTargetRef,
      targetRef: selectedTargetRef,
      trigger: ABILITY_TRIGGERS.MANUAL_ABILITY,
      sourceRef,
      sourceCard: currentSource,
      side,
    };
    if (!rule.conditions.every(condition => checkAbilityCondition(next, condition, ruleContext))) return;

    next = resolveEffects(next, side, currentSource, sortByPriority(rule.effects), {
      ...ruleContext,
      skipKnockoutCheck: true,
    });
    applied = true;
    if (rule.once_per_turn) {
      next = updateCardRef(next, sourceRef, card => ({ ...card, last_rule_turn: next.turn_number }));
    }
    if (rule.chainTrigger) {
      const chainSide = rule.chainTarget === "OPPONENT" ? opponentOf(side) : side;
      next = resolveChainTrigger(next, chainSide, rule.chainTrigger, ruleContext);
    }
  });

  if (!applied) return state;
  next = withLog(next, `${source.name} ativou ${ability.name}.`);
  return resolveKnockouts(next, side);
}

export function playActionCard(state, side, handIndex, context = {}) {
  if (state.phase !== "battle" || state.winner || state.turn !== side) return state;
  const drawBlock = requireDrawBeforeAction(state, side);
  if (drawBlock) return drawBlock;
  const player = state.players[side];
  const card = player.hand[handIndex];
  if (!card || card.card_type === "Personagem" || card.card_type === "Energia") return state;

  if (card.card_type === "Mestre" && player.master_used_this_turn) {
    return withLog(state, `${player.name} ja usou uma carta Mestre neste turno.`);
  }

  if (card.card_type === "Equipamento") {
    if (!player.active) return state;
    if ((player.active.equipments || []).length > 0) {
      return withLog(state, `${player.active.name} ja tem um equipamento.`);
    }
    let next = updateSide(state, side, p => {
      const updated = clone(p);
      updated.active = {
        ...updated.active,
        equipments: [...(updated.active.equipments || []), card],
      };
      updated.hand.splice(handIndex, 1);
      return updated;
    });
    next = withLog(next, `${player.name} equipou ${card.name} em ${player.active.name}.`);
    next = resolveEquipmentTrigger(next, side, { side, zone: "active", index: 0 }, EFFECT_CONDITIONS.ON_EQUIP);
    return resolveKnockouts(next, side);
  }

  let next = updateSide(state, side, p => {
    const updated = clone(p);
    updated.hand.splice(handIndex, 1);
    updated.discard.push(card);
    if (card.card_type === "Mestre") updated.master_used_this_turn = true;
    return updated;
  });
  next = withLog(next, `${player.name} usou ${card.name}.`);
  next = resolveEffects(next, side, card, card.effects || [], {
    ...context,
    trigger: card.card_type === "Mestre" ? ABILITY_TRIGGERS.ON_SUPPORT_PLAYED : ABILITY_TRIGGERS.ON_ITEM_USED,
  });
  return resolveChainTrigger(next, side, card.card_type === "Mestre" ? ABILITY_TRIGGERS.ON_SUPPORT_PLAYED : ABILITY_TRIGGERS.ON_ITEM_USED, {
    ...context,
    sourceCard: card,
  });
}

export function retreat(state, side, benchIndex) {
  if (state.phase !== "battle" || state.winner || state.turn !== side) return state;
  const drawBlock = requireDrawBeforeAction(state, side);
  if (drawBlock) return drawBlock;
  const player = state.players[side];
  const active = player.active;
  const replacement = player.bench[benchIndex];
  const baseCost = Math.max(0, parseInt(active?.recuo, 10) || 0);
  const cost = active?.ignore_retreat_cost ? 0 : Math.max(0, baseCost - (parseInt(active?.retreat_cost_reduction, 10) || 0));
  if (active && isRetreatBlockedByStatus(active)) return withLog(state, `${active.name} nao pode recuar agora.`);
  if (!active || !replacement || (active.attached_energy || []).length < cost) return state;

  let next = updateSide(state, side, p => {
    const updated = clone(p);
    discardEquipments(updated, active);
    updated.active = {
      ...replacement,
      entered_turn: replacement.entered_turn,
    };
    updated.bench[benchIndex] = {
      ...active,
      attached_energy: (active.attached_energy || []).slice(cost),
      equipments: [],
    };
    return updated;
  });

  next = withLog(next, `${player.name} recuou ${active.name}.`);
  next = resolveChainTrigger(next, side, ABILITY_TRIGGERS.ON_RETREAT, {
    sourceRef: { side, zone: "bench", index: benchIndex },
    targetRef: { side, zone: "active", index: 0 },
  });
  return resolveChainTrigger(next, side, ABILITY_TRIGGERS.ON_ENTER_ACTIVE, {
    sourceRef: { side, zone: "active", index: 0 },
    targetRef: { side, zone: "active", index: 0 },
  });
}

export function promoteFromBench(state, side, benchIndex) {
  if (state.phase !== "battle" || state.winner) return state;
  const player = state.players[side];
  if (player.active || benchIndex < 0 || benchIndex >= player.bench.length || !player.bench[benchIndex]) return state;

  let next = updateSide(state, side, p => {
    const updated = clone(p);
    updated.active = updated.bench[benchIndex];
    updated.bench.splice(benchIndex, 1);
    return updated;
  });

  next = withLog(next, `${player.name} promoveu ${player.bench[benchIndex].name} para a ativa.`);
  return resolveChainTrigger(next, side, ABILITY_TRIGGERS.ON_ENTER_ACTIVE, {
    sourceRef: { side, zone: "active", index: 0 },
    targetRef: { side, zone: "active", index: 0 },
  });
}

export function endTurn(state) {
  if (state.phase !== "battle" || state.winner) return state;
  const drawBlock = requireDrawBeforeAction(state, state.turn);
  if (drawBlock) return drawBlock;
  const processed = applyEndTurnEffects({ ...state, turn_moment: TURN_MOMENTS.TURN_END }, state.turn);
  if (processed.winner) return processed;
  const nextSide = opponentOf(processed.turn);
  const nextTurnNumber = processed.turn === "opponent" ? processed.turn_number + 1 : processed.turn_number;

  let next = {
    ...processed,
    turn: nextSide,
    turn_number: nextTurnNumber,
    turn_moment: TURN_MOMENTS.TURN_START,
    turn_events: [TURN_MOMENTS.TURN_START],
  };

  next = updateSide(next, nextSide, p => ({
    ...p,
    energy_zone: {
      current: p.energy_zone?.next || randomEnergy(p.energy_types),
      next: randomEnergy(p.energy_types),
    },
    energy_remaining: ENERGY_PER_TURN,
    master_used_this_turn: false,
    drew_this_turn: false,
  }));

  next = withLog(next, `Turno de ${next.players[nextSide].name}.`);
  next = resolveAbilityRulesForSide(next, nextSide, ABILITY_TRIGGERS.ON_TURN_START);
  return resolveKnockouts(next, nextSide);
}

export function runBotTurn(state, context = {}) {
  if (state.phase !== "battle" || state.winner || state.turn !== "opponent") return state;
  let next = state;
  if (!context.skipPreparation) {
    if (!next.players.opponent.active && next.players.opponent.bench.length > 0) {
      next = promoteFromBench(next, "opponent", 0);
    }
    if (!next.players.opponent.drew_this_turn) {
      next = drawTurnCard(next, "opponent");
    }
    const bot = next.players.opponent;

    const benchIndex = bot.hand.findIndex(isBasicCharacter);
    if (benchIndex >= 0 && bot.bench.length < BENCH_LIMIT) {
      next = playToBench(next, "opponent", benchIndex);
    }

    const targetZone = next.players.opponent.active ? "active" : null;
    if (targetZone && next.players.opponent.energy_remaining > 0) {
      next = attachEnergy(next, "opponent", "active", 0);
    }
  }

  const abilityIndex = (next.players.opponent.active?.abilities || []).findIndex((ability, index) =>
    canPayAbility(next.players.opponent.active, ability) && canAttackThisTurn(next, "opponent", index)
  );

  let attacked = false;
  if (abilityIndex >= 0) {
    if (typeof context.beforeBotAttack === "function") {
      const decision = context.beforeBotAttack(next, abilityIndex);
      if (decision?.pause) return decision.state || next;
    }
    next = activateAbility(next, "opponent", abilityIndex, context);
    attacked = true;
  }

  if (!attacked && !next.winner) next = endTurn(next);
  return next;
}

export const DUEL_RULES = {
  INITIAL_HAND_SIZE,
  BENCH_LIMIT,
  ENERGY_PER_TURN,
  POINTS_TO_WIN,
};

export { abilityCosts, canPayAbility, knockoutPoints };
