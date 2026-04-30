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
} from "./cardEffects";

const INITIAL_HAND_SIZE = 5;
const BENCH_LIMIT = 3;
const ENERGY_PER_TURN = 1;
const POINTS_TO_WIN = 3;

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
  const valid = (energyTypes || []).filter(type => ENERGY_TYPES.includes(type));
  return valid.length ? valid : ["Universal"];
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

const attachedCounts = card => {
  const counts = {};
  ENERGY_TYPES.forEach(type => { counts[type] = 0; });
  (card?.attached_energy || []).forEach(type => {
    counts[type] = (counts[type] || 0) + 1;
  });
  return counts;
};

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
  if (card?.energy_any_type) {
    return (card.attached_energy || []).length >= costs.reduce((total, cost) => total + cost.amount, 0);
  }
  const counts = attachedCounts(card);
  return costs.every(cost => (counts[cost.energy_type] || 0) >= cost.amount);
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

const DAMAGE_EFFECTS = new Set([
  EFFECT_TYPES.DAMAGE,
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
]);

const HEAL_EFFECTS = new Set([
  EFFECT_TYPES.HEAL,
  EFFECT_TYPES.HEAL_SELF,
  EFFECT_TYPES.HEAL_ACTIVE,
  EFFECT_TYPES.HEAL_BENCH,
  EFFECT_TYPES.HEAL_ANY_SELF_CARD,
  EFFECT_TYPES.HEAL_EQUIPPED_CARD,
  EFFECT_TYPES.HEAL_BY_DAMAGE_DEALT,
  EFFECT_TYPES.HEAL_ALLY_ON_DAMAGE,
  EFFECT_TYPES.HEAL_PER_TURN,
]);

const ADD_ENERGY_EFFECTS = new Set([
  EFFECT_TYPES.ADD_ENERGY,
  EFFECT_TYPES.ADD_TYPED_ENERGY,
  EFFECT_TYPES.ADD_ENERGY_TO_ACTIVE,
  EFFECT_TYPES.ADD_ENERGY_TO_BENCH,
  EFFECT_TYPES.ADD_ENERGY_BY_COIN,
  EFFECT_TYPES.ADD_ENERGY_BY_DAMAGE_TAKEN,
  EFFECT_TYPES.ADD_ENERGY_ON_ATTACK,
  EFFECT_TYPES.ADD_MULTIPLE_ENERGY,
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
  EFFECT_TYPES.SWITCH_ACTIVE,
  EFFECT_TYPES.SWITCH_OWN_ACTIVE,
  EFFECT_TYPES.SWITCH_OPPONENT_ACTIVE,
  EFFECT_TYPES.FORCE_SWITCH_OPPONENT_ACTIVE,
  EFFECT_TYPES.OPPONENT_CHOOSES_NEW_ACTIVE,
  EFFECT_TYPES.PROMOTE_FROM_BENCH,
  EFFECT_TYPES.SUMMON_FROM_BENCH,
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
  EFFECT_TYPES.IMMUNE_TO_DAMAGE_TYPE,
  EFFECT_TYPES.IMMUNE_TO_NEGATIVE_EFFECTS,
  EFFECT_TYPES.IGNORE_TOOL_EFFECTS,
  EFFECT_TYPES.REFLECT_DAMAGE,
  EFFECT_TYPES.REFLECT_DOUBLE_DAMAGE,
  EFFECT_TYPES.REDIRECT_DAMAGE,
  EFFECT_TYPES.SHARE_DAMAGE,
]);

const CONDITION_EFFECTS = new Set([
  EFFECT_TYPES.COIN_FLIP,
  EFFECT_TYPES.DICE_ROLL,
  EFFECT_TYPES.IF_DICE_GREATER_THAN,
  EFFECT_TYPES.IF_DICE_LESS_THAN,
  EFFECT_TYPES.IF_TARGET_NATURE,
  EFFECT_TYPES.IF_TARGET_TAG,
  EFFECT_TYPES.IF_SELF_HAS_ENERGY_COUNT,
  EFFECT_TYPES.IF_BENCH_HAS_CARD,
  EFFECT_TYPES.IF_BENCH_COUNT_BY_NATURE,
  EFFECT_TYPES.IF_HAS_TOOL_ATTACHED,
  EFFECT_TYPES.IF_CARD_WAS_ATTACKED,
  EFFECT_TYPES.IF_CARD_KNOCKED_OUT,
  EFFECT_TYPES.ON_ATTACK,
  EFFECT_TYPES.ON_DAMAGE_TAKEN,
  EFFECT_TYPES.ON_ENERGY_ATTACHED,
  EFFECT_TYPES.ON_KNOCKOUT,
  EFFECT_TYPES.ON_TURN_START,
  EFFECT_TYPES.ON_TURN_END,
]);

const SPECIAL_EFFECTS = new Set([
  EFFECT_TYPES.COPY_OPPONENT_ITEM,
  EFFECT_TYPES.TRANSFORM_INTO_OPPONENT_BENCH_CARD,
  EFFECT_TYPES.ABSORB_OWN_BENCH_CARD,
  EFFECT_TYPES.CREATE_TEMPORARY_UNIT,
  EFFECT_TYPES.PLAY_ITEM_AS_UNIT,
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

const updateSide = (state, side, updater) => ({
  ...state,
  players: {
    ...state.players,
    [side]: updater(state.players[side]),
  },
});

const targetCard = (player, zone, index = 0) => {
  if (zone === "active") return player.active;
  return player.bench[index] || null;
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
  else next.bench[index] = card;
  return next;
};

const removeTargetCard = (player, zone, index = 0) => {
  const next = clone(player);
  if (zone === "active") {
    const removed = next.active;
    next.active = null;
    return { player: promoteIfNeeded(next), removed };
  }
  const removed = next.bench[index] || null;
  if (removed) next.bench.splice(index, 1);
  return { player: next, removed };
};

const promoteIfNeeded = player => {
  const next = clone(player);
  if (!next.active && next.bench.length > 0) {
    next.active = next.bench.shift();
  }
  return next;
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

const targetRefsForEffect = (state, side, effect) => {
  const opponentSide = opponentOf(side);
  const player = state.players[side];
  const opponent = state.players[opponentSide];
  const ownBenchRefs = player.bench.map((card, index) => card ? { side, zone: "bench", index } : null).filter(Boolean);
  const opponentBenchRefs = opponent.bench.map((card, index) => card ? { side: opponentSide, zone: "bench", index } : null).filter(Boolean);
  const randomOne = refs => refs.length ? [refs[Math.floor(Math.random() * refs.length)]] : [];

  if (effect.target_override) return [effect.target_override];
  if (effect.type === EFFECT_TYPES.HEAL_EQUIPPED_CARD && effect.equipped_card_ref) {
    return [effect.equipped_card_ref];
  }
  if (effect.target === TARGETS.EQUIPPED_CARD && effect.equipped_card_ref) {
    return [effect.equipped_card_ref];
  }
  if (effect.target === TARGETS.DAMAGE_SOURCE && effect.damage_source_ref) {
    return [effect.damage_source_ref];
  }
  if (effect.target === TARGETS.DAMAGE_TARGET && effect.damage_target_ref) {
    return [effect.damage_target_ref];
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
    return randomOne([
      ...(opponent.active ? [{ side: opponentSide, zone: "active", index: 0 }] : []),
      ...opponentBenchRefs,
    ]);
  }
  if (effect.type === EFFECT_TYPES.HEAL_SELF || effect.type === EFFECT_TYPES.HEAL_ACTIVE) {
    return player.active ? [{ side, zone: "active", index: 0 }] : [];
  }
  if (effect.type === EFFECT_TYPES.HEAL_BENCH) {
    return ownBenchRefs;
  }
  if ([
    EFFECT_TYPES.HEAL_ANY_SELF_CARD,
    EFFECT_TYPES.HEAL_BY_DAMAGE_DEALT,
    EFFECT_TYPES.HEAL_ALLY_ON_DAMAGE,
    EFFECT_TYPES.HEAL_PER_TURN,
  ].includes(effect.type)) {
    return [
      ...(player.active ? [{ side, zone: "active", index: 0 }] : []),
      ...ownBenchRefs,
    ].slice(0, effect.type === EFFECT_TYPES.HEAL_PER_TURN ? undefined : 1);
  }
  if (effect.type === EFFECT_TYPES.ADD_ENERGY_TO_ACTIVE) {
    return player.active ? [{ side, zone: "active", index: 0 }] : [];
  }
  if (effect.type === EFFECT_TYPES.ADD_ENERGY_TO_BENCH) {
    return ownBenchRefs;
  }
  if (effect.type === EFFECT_TYPES.DISCARD_OWN_ENERGY) {
    return player.active ? [{ side, zone: "active", index: 0 }] : [];
  }

  switch (effect.target) {
    case TARGETS.SELF_ACTIVE:
    case TARGETS.SELF:
      return player.active ? [{ side, zone: "active", index: 0 }] : [];
    case TARGETS.SELF_BENCH:
    case TARGETS.ALL_SELF_BENCH:
      return ownBenchRefs;
    case TARGETS.SELF_BENCH_RANDOM:
      return randomOne(ownBenchRefs);
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

const sourcePosition = ref => ref?.zone === "bench" ? "BENCH" : "ACTIVE";

const valuesInclude = (value, item) => {
  const list = Array.isArray(value)
    ? value
    : String(value || "").split(",").map(part => part.trim()).filter(Boolean);
  return list.includes(item);
};

const ruleCardRefsForSide = (state, side) => [
  ...(state.players[side].active ? [{ side, zone: "active", index: 0 }] : []),
  ...state.players[side].bench.map((card, index) => card ? { side, zone: "bench", index } : null).filter(Boolean),
];

const checkAbilityCondition = (state, condition, context) => {
  const sourceRef = context.sourceRef;
  const targetRef = context.damageTargetRef || context.targetRef || null;
  const source = sourceRef ? targetCard(state.players[sourceRef.side], sourceRef.zone, sourceRef.index) : context.sourceCard;
  const target = targetRef ? targetCard(state.players[targetRef.side], targetRef.zone, targetRef.index) : context.targetCard;

  switch (condition.type) {
    case "SOURCE_POSITION":
      return String(condition.value || "ACTIVE").toUpperCase() === sourcePosition(sourceRef);
    case "TARGET_NATURE_IN":
      return (target?.natures || []).some(nature => valuesInclude(condition.value, nature));
    case "TARGET_IS_DAMAGED":
      return target && (target.hp_remaining || 0) < (target.hp || 0);
    case "SELF_HAS_ENERGY_TYPE":
      return (source?.attached_energy || []).some(type => valuesInclude(condition.value, type));
    case "SELF_ENERGY_COUNT_GTE":
      return (source?.attached_energy || []).length >= (parseInt(condition.value, 10) || 0);
    default:
      return false;
  }
};

function resolveAbilityRules(state, side, sourceRef, trigger, context = {}) {
  const source = sourceRef ? targetCard(state.players[sourceRef.side], sourceRef.zone, sourceRef.index) : null;
  if (!source) return state;

  return (source.abilities || []).reduce((next, ability) => {
    const rules = normalizeAbilityRules(ability.rules).filter(rule => rule.trigger === trigger);
    if (rules.length === 0) return next;

    return rules.reduce((afterRule, rule) => {
      const ruleContext = {
        ...context,
        trigger,
        sourceRef,
        sourceCard: source,
      };
      if (!rule.conditions.every(condition => checkAbilityCondition(afterRule, condition, ruleContext))) return afterRule;
      const resolved = resolveEffects(afterRule, side, source, rule.effects, {
        ...ruleContext,
        suppressRuleTriggers: true,
        skipKnockoutCheck: true,
      });
      return withLog(resolved, `${source.name} ativou ${ability.name}.`);
    }, next);
  }, state);
}

function effectsForAbilityTrigger(state, side, sourceRef, ability, trigger, context = {}) {
  const rules = normalizeAbilityRules(ability?.rules);
  if (rules.length === 0) return abilityEffects(ability);
  const source = sourceRef ? targetCard(state.players[sourceRef.side], sourceRef.zone, sourceRef.index) : null;
  return rules
    .filter(rule => rule.trigger === trigger)
    .filter(rule => rule.conditions.every(condition => checkAbilityCondition(state, condition, {
      ...context,
      trigger,
      sourceRef,
      sourceCard: source,
    })))
    .flatMap(rule => rule.effects);
}

function resolveAbilityRulesForSide(state, side, trigger, context = {}) {
  return ruleCardRefsForSide(state, side).reduce((next, ref) => (
    resolveAbilityRules(next, side, ref, trigger, context)
  ), state);
}

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
        .filter(({ card }) => isCharacter(card));
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
  };
  return addStatus(card, statusByType[effect.type] || effect.type.toLowerCase());
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
  return card;
}

function resolveConditionEffect(state, side, effect, amount, sourceCard) {
  if (effect.type === EFFECT_TYPES.COIN_FLIP) {
    return withLog(state, `Moeda: ${Math.random() >= 0.5 ? "cara" : "coroa"}.`);
  }
  if ([
    EFFECT_TYPES.DICE_ROLL,
    EFFECT_TYPES.IF_DICE_GREATER_THAN,
    EFFECT_TYPES.IF_DICE_LESS_THAN,
  ].includes(effect.type)) {
    const roll = Math.floor(Math.random() * 6) + 1;
    return withLog(state, `Dado: ${roll}${amount ? ` contra ${amount}` : ""}.`);
  }
  if (effect.type === EFFECT_TYPES.IF_SELF_HAS_ENERGY_COUNT) {
    const total = (sourceCard?.attached_energy || []).length;
    return withLog(state, `${sourceCard?.name || "Carta"} tem ${total} energia(s).`);
  }
  if (effect.type === EFFECT_TYPES.IF_BENCH_HAS_CARD) {
    const hasCard = state.players[side].bench.some(card => card.name === effect.card_name);
    return withLog(state, hasCard ? `${effect.card_name} esta no banco.` : `${effect.card_name || "A carta"} nao esta no banco.`);
  }
  if (effect.type === EFFECT_TYPES.IF_BENCH_COUNT_BY_NATURE) {
    const count = state.players[side].bench.filter(card => (card.natures || []).includes(effect.nature)).length;
    return withLog(state, `${count} carta(s) ${effect.nature || ""} no banco.`);
  }
  if (effect.type === EFFECT_TYPES.IF_HAS_TOOL_ATTACHED) {
    return withLog(state, `${sourceCard?.name || "Carta"} ${(sourceCard?.equipments || []).length ? "tem" : "nao tem"} equipamento.`);
  }
  if ([
    EFFECT_TYPES.IF_TARGET_NATURE,
    EFFECT_TYPES.IF_TARGET_TAG,
    EFFECT_TYPES.IF_CARD_WAS_ATTACKED,
    EFFECT_TYPES.IF_CARD_KNOCKED_OUT,
    EFFECT_TYPES.ON_ATTACK,
    EFFECT_TYPES.ON_DAMAGE_TAKEN,
    EFFECT_TYPES.ON_ENERGY_ATTACHED,
    EFFECT_TYPES.ON_KNOCKOUT,
    EFFECT_TYPES.ON_TURN_START,
    EFFECT_TYPES.ON_TURN_END,
  ].includes(effect.type)) {
    return withLog(state, "Condicao registrada para este efeito.");
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
      const points = knockoutPoints(active);
      next = resolveAbilityRulesForSide(next, attackerSide, ABILITY_TRIGGERS.ON_KNOCKOUT, {
        targetRef: { side, zone: "active", index: 0 },
        knockedOutCard: active,
      });
      next = updateSide(next, attackerSide, p => ({ ...p, points: p.points + points }));
      next = updateSide(next, side, p => {
        const updated = clone(p);
        discardCardWithEquipments(updated, updated.active);
        updated.active = null;
        return promoteIfNeeded(updated);
      });
      next = withLog(next, `${active.name} foi nocauteada. ${next.players[attackerSide].name} ganhou ${points} ponto(s).`);
    }

    const defeatedBench = next.players[side].bench
      .map((card, index) => ({ card, index }))
      .filter(({ card }) => card && card.hp_remaining <= 0)
      .reverse();

    defeatedBench.forEach(({ card, index }) => {
      const points = knockoutPoints(card);
      next = resolveAbilityRulesForSide(next, attackerSide, ABILITY_TRIGGERS.ON_KNOCKOUT, {
        targetRef: { side, zone: "bench", index },
        knockedOutCard: card,
      });
      next = updateSide(next, attackerSide, p => ({ ...p, points: p.points + points }));
      next = updateSide(next, side, p => {
        const updated = clone(p);
        discardCardWithEquipments(updated, updated.bench[index]);
        updated.bench.splice(index, 1);
        return updated;
      });
      next = withLog(next, `${card.name} foi nocauteada no banco. ${next.players[attackerSide].name} ganhou ${points} ponto(s).`);
    });
  });

  return checkWinner(next);
};

export function resolveEffects(state, side, sourceCard, effects, context = {}) {
  let next = state;
  let damageDealtThisResolution = 0;
  const sourceRef = context.sourceRef || inferredSourceRef(state, side, sourceCard);
  const normalized = normalizeEffects(effects).map(effect => ({
    ...effect,
    target_override: context.targetOverride && DAMAGE_EFFECTS.has(effect.type) ? context.targetOverride : null,
    energy_source_override: context.energySourceOverride || null,
    equipped_card_ref: context.equippedCardRef || sourceRef,
    damage_source_ref: context.damageSourceRef || sourceRef,
    damage_target_ref: context.damageTargetRef || null,
  })).filter(effect => effectConditionMatches(next, effect, context));

  normalized.forEach(effect => {
    const amount = Math.max(0, parseInt(effect.amount, 10) || 0);
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
      if (next.players[switchSide].active && next.players[switchSide].bench.length > 0) {
        const oldActiveName = next.players[switchSide].active.name;
        next = updateSide(next, switchSide, p => {
          const updated = clone(p);
          const replacement = updated.bench.shift();
          discardEquipments(updated, updated.active);
          updated.bench.push(cardWithoutEquipments(updated.active));
          updated.active = replacement;
          return updated;
        });
        next = withLog(next, `${next.players[switchSide].name} trocou ${oldActiveName} pela carta do banco.`);
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

    const refs = targetRefsForEffect(next, side, effect);
    if (refs.length === 0) return;

    refs.forEach(ref => {
      const target = targetCard(next.players[ref.side], ref.zone, ref.index);
      if (!target) return;

      if (DAMAGE_EFFECTS.has(effect.type)) {
        const redirectedRef = target.redirect_damage && ref.zone === "active" && next.players[ref.side].bench.length > 0
          ? { side: ref.side, zone: "bench", index: 0 }
          : ref;
        const redirectedTarget = targetCard(next.players[redirectedRef.side], redirectedRef.zone, redirectedRef.index) || target;
        if (
          redirectedTarget.immune_to_damage_type === "ANY" ||
          (redirectedTarget.immune_to_damage_type && (sourceCard?.natures || []).includes(redirectedTarget.immune_to_damage_type))
        ) {
          next = withLog(next, `${redirectedTarget.name} ignorou o dano.`);
          return;
        }
        const passiveBonus = sourceCard?.instance_id === next.players[side].active?.instance_id ? passiveDamageBonus(sourceCard) : 0;
        const staticBonus = parseInt(sourceCard?.bonus_damage, 10) || 0;
        const energyBonus = effect.type === EFFECT_TYPES.DAMAGE_EXTRA_BY_ENERGY
          ? (sourceCard?.attached_energy || []).length * amount
          : 0;
        const benchBonus = effect.type === EFFECT_TYPES.DAMAGE_EXTRA_BY_BENCH_CARD
          ? next.players[side].bench.filter(card =>
              (effect.card_name && card.name === effect.card_name) ||
              (effect.nature && (card.natures || []).includes(effect.nature)) ||
              (!effect.card_name && !effect.nature)
            ).length * amount
          : 0;
        const targetTypeBonus = effect.type === EFFECT_TYPES.DAMAGE_EXTRA_BY_TARGET_TYPE &&
          ((effect.nature && (redirectedTarget.natures || []).includes(effect.nature)) || !effect.nature)
          ? amount
          : 0;
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
        const energyType = effect.energy_type || next.players[side].energy_zone?.current || "Universal";
        next = updateCardRef(next, ref, card => ({
          ...card,
          attached_energy: [
            ...(card.attached_energy || []),
            ...Array.from({ length: amount || 1 }, () => energyType),
          ],
        }));
        next = withLog(next, `${target.name} recebeu ${amount || 1} energia(s).`);
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
          pending_damage_reduction: effect.type === EFFECT_TYPES.PREVENT_DAMAGE ? 9999 : Math.max(card.pending_damage_reduction || 0, amount),
          next_damage_multiplier: effect.type === EFFECT_TYPES.HALVE_DAMAGE_TAKEN ? 0.5 : card.next_damage_multiplier,
        }));
        next = withLog(next, `${target.name} se preparou contra o proximo dano.`);
      } else if (STATUS_EFFECTS.has(effect.type)) {
        if (target.immune_to_negative_effects) {
          next = withLog(next, `${target.name} ignorou o efeito negativo.`);
          return;
        }
        next = updateCardRef(next, ref, card => applyStatusEffect(card, effect));
        next = withLog(next, `${target.name} recebeu um status.`);
      } else if (BUFF_EFFECTS.has(effect.type)) {
        next = updateCardRef(next, ref, card => applyBuffEffect(card, effect, amount));
        next = withLog(next, `${target.name} recebeu um efeito de suporte.`);
      } else if (IMMUNITY_EFFECTS.has(effect.type)) {
        next = updateCardRef(next, ref, card => applyImmunityEffect(card, effect, amount));
        next = withLog(next, `${target.name} recebeu um efeito defensivo.`);
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
  }, "Duelo iniciado.");
}

export function playToBench(state, side, handIndex) {
  if (state.phase !== "battle" || state.winner || state.turn !== side) return state;
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

  return withLog(next, `${player.name} evoluiu ${target.name} para ${evolution.name}.`);
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

  let next = withLog(state, `${attacker.name} usou ${ability.name}.`);
  const sourceRef = { side, zone: "active", index: 0 };
  next = resolveEffects(next, side, active, effectsForAbilityTrigger(next, side, sourceRef, ability, ABILITY_TRIGGERS.ON_ATTACK, context), {
    ...context,
    sourceRef,
  });
  next = updateSide(next, side, p => ({
    ...p,
    active: p.active ? { ...p.active, last_used_ability_name: ability.name } : p.active,
  }));
  return next.winner ? next : endTurn(next);
}

export function playActionCard(state, side, handIndex, context = {}) {
  if (state.phase !== "battle" || state.winner || state.turn !== side) return state;
  const player = state.players[side];
  const card = player.hand[handIndex];
  if (!card || card.card_type === "Personagem" || card.card_type === "Energia") return state;

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
    return updated;
  });
  next = withLog(next, `${player.name} usou ${card.name}.`);
  return resolveEffects(next, side, card, card.effects || [], context);
}

export function retreat(state, side, benchIndex) {
  if (state.phase !== "battle" || state.winner || state.turn !== side) return state;
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

  return withLog(next, `${player.name} recuou ${active.name}.`);
}

export function endTurn(state) {
  if (state.phase !== "battle" || state.winner) return state;
  const processed = applyEndTurnEffects(state, state.turn);
  if (processed.winner) return processed;
  const nextSide = opponentOf(processed.turn);
  const nextTurnNumber = processed.turn === "opponent" ? processed.turn_number + 1 : processed.turn_number;

  let next = {
    ...processed,
    turn: nextSide,
    turn_number: nextTurnNumber,
  };

  next = updateSide(next, nextSide, p => ({
    ...draw(p, 1),
    energy_zone: {
      current: p.energy_zone?.next || randomEnergy(p.energy_types),
      next: randomEnergy(p.energy_types),
    },
    energy_remaining: ENERGY_PER_TURN,
  }));

  next = withLog(next, `Turno de ${next.players[nextSide].name}.`);
  next = resolveAbilityRulesForSide(next, nextSide, ABILITY_TRIGGERS.ON_TURN_START);
  return resolveKnockouts(next, nextSide);
}

export function runBotTurn(state) {
  if (state.phase !== "battle" || state.winner || state.turn !== "opponent") return state;
  let next = state;
  const bot = next.players.opponent;

  const benchIndex = bot.hand.findIndex(isBasicCharacter);
  if (benchIndex >= 0 && bot.bench.length < BENCH_LIMIT) {
    next = playToBench(next, "opponent", benchIndex);
  }

  const targetZone = next.players.opponent.active ? "active" : null;
  if (targetZone && next.players.opponent.energy_remaining > 0) {
    next = attachEnergy(next, "opponent", "active", 0);
  }

  const abilityIndex = (next.players.opponent.active?.abilities || []).findIndex((ability, index) =>
    canPayAbility(next.players.opponent.active, ability) && canAttackThisTurn(next, "opponent", index)
  );

  let attacked = false;
  if (abilityIndex >= 0) {
    next = activateAbility(next, "opponent", abilityIndex);
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
