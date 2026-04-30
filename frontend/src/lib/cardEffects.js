export const EFFECT_TYPES = {
  DAMAGE: "DAMAGE",
  DAMAGE_RANDOM_TARGETS: "DAMAGE_RANDOM_TARGETS",
  DAMAGE_ANY_TARGET: "DAMAGE_ANY_TARGET",
  DAMAGE_ACTIVE_AND_BENCH: "DAMAGE_ACTIVE_AND_BENCH",
  DAMAGE_ALL_OPPONENT_BENCH: "DAMAGE_ALL_OPPONENT_BENCH",
  DAMAGE_SELF: "DAMAGE_SELF",
  DAMAGE_EXTRA_BY_ENERGY: "DAMAGE_EXTRA_BY_ENERGY",
  DAMAGE_EXTRA_BY_BENCH_CARD: "DAMAGE_EXTRA_BY_BENCH_CARD",
  DAMAGE_EXTRA_BY_TARGET_TYPE: "DAMAGE_EXTRA_BY_TARGET_TYPE",
  DAMAGE_EXTRA_BY_DICE: "DAMAGE_EXTRA_BY_DICE",
  DAMAGE_EXTRA_BY_COIN: "DAMAGE_EXTRA_BY_COIN",
  DAMAGE_CONSECUTIVE_STACK: "DAMAGE_CONSECUTIVE_STACK",
  DAMAGE_SPLIT: "DAMAGE_SPLIT",
  DAMAGE_TO_PREVIOUSLY_DAMAGED_BENCH: "DAMAGE_TO_PREVIOUSLY_DAMAGED_BENCH",
  HEAL: "HEAL",
  HEAL_SELF: "HEAL_SELF",
  HEAL_ACTIVE: "HEAL_ACTIVE",
  HEAL_BENCH: "HEAL_BENCH",
  HEAL_ANY_SELF_CARD: "HEAL_ANY_SELF_CARD",
  HEAL_EQUIPPED_CARD: "HEAL_EQUIPPED_CARD",
  HEAL_BY_DAMAGE_DEALT: "HEAL_BY_DAMAGE_DEALT",
  HEAL_ALLY_ON_DAMAGE: "HEAL_ALLY_ON_DAMAGE",
  HEAL_PER_TURN: "HEAL_PER_TURN",
  ADD_ENERGY: "ADD_ENERGY",
  ADD_TYPED_ENERGY: "ADD_TYPED_ENERGY",
  ADD_ENERGY_TO_ACTIVE: "ADD_ENERGY_TO_ACTIVE",
  ADD_ENERGY_TO_BENCH: "ADD_ENERGY_TO_BENCH",
  ADD_ENERGY_BY_COIN: "ADD_ENERGY_BY_COIN",
  ADD_ENERGY_BY_DAMAGE_TAKEN: "ADD_ENERGY_BY_DAMAGE_TAKEN",
  ADD_ENERGY_ON_ATTACK: "ADD_ENERGY_ON_ATTACK",
  ADD_MULTIPLE_ENERGY: "ADD_MULTIPLE_ENERGY",
  REMOVE_ENERGY: "REMOVE_ENERGY",
  REMOVE_RANDOM_ENERGY: "REMOVE_RANDOM_ENERGY",
  MOVE_ENERGY: "MOVE_ENERGY",
  MOVE_ALL_ENERGY_FROM_BENCH_TO_ACTIVE: "MOVE_ALL_ENERGY_FROM_BENCH_TO_ACTIVE",
  DISCARD_OWN_ENERGY: "DISCARD_OWN_ENERGY",
  ENERGY_ANY_TYPE: "ENERGY_ANY_TYPE",
  ENERGY_COST_REDUCTION: "ENERGY_COST_REDUCTION",
  ENERGY_REQUIRED_TYPE: "ENERGY_REQUIRED_TYPE",
  DRAW_CARD: "DRAW_CARD",
  DRAW_MULTIPLE: "DRAW_MULTIPLE",
  SEARCH_RANDOM_BASIC: "SEARCH_RANDOM_BASIC",
  LOOK_TOP_DECK: "LOOK_TOP_DECK",
  REVEAL_OPPONENT_HAND: "REVEAL_OPPONENT_HAND",
  REVEAL_ONE_CARD: "REVEAL_ONE_CARD",
  SHUFFLE_OPPONENT_HAND: "SHUFFLE_OPPONENT_HAND",
  OPPONENT_DRAWS_RANDOM: "OPPONENT_DRAWS_RANDOM",
  SWAP_HAND_CARD_RANDOM: "SWAP_HAND_CARD_RANDOM",
  FORCE_OPPONENT_SWAP_CARD: "FORCE_OPPONENT_SWAP_CARD",
  RETURN_CARD_TO_DECK: "RETURN_CARD_TO_DECK",
  RESURRECT_TO_DECK: "RESURRECT_TO_DECK",
  RESURRECT_FROM_DISCARD: "RESURRECT_FROM_DISCARD",
  DISCARD_CARD: "DISCARD_CARD",
  SWITCH_ACTIVE: "SWITCH_ACTIVE",
  SWITCH_OWN_ACTIVE: "SWITCH_OWN_ACTIVE",
  SWITCH_OPPONENT_ACTIVE: "SWITCH_OPPONENT_ACTIVE",
  FORCE_SWITCH_OPPONENT_ACTIVE: "FORCE_SWITCH_OPPONENT_ACTIVE",
  OPPONENT_CHOOSES_NEW_ACTIVE: "OPPONENT_CHOOSES_NEW_ACTIVE",
  IGNORE_RETREAT_COST: "IGNORE_RETREAT_COST",
  REDUCE_RETREAT_COST: "REDUCE_RETREAT_COST",
  BLOCK_RETREAT: "BLOCK_RETREAT",
  ATTACK_FROM_BENCH: "ATTACK_FROM_BENCH",
  PROMOTE_FROM_BENCH: "PROMOTE_FROM_BENCH",
  SUMMON_FROM_BENCH: "SUMMON_FROM_BENCH",
  RESCUE_ACTIVE: "RESCUE_ACTIVE",
  BURN: "BURN",
  PARALYZE: "PARALYZE",
  FREEZE: "FREEZE",
  CONFUSE: "CONFUSE",
  PREVENT_ATTACK: "PREVENT_ATTACK",
  PREVENT_RETREAT: "PREVENT_RETREAT",
  SKIP_NEXT_ATTACK: "SKIP_NEXT_ATTACK",
  CANNOT_USE_SAME_ATTACK_NEXT_TURN: "CANNOT_USE_SAME_ATTACK_NEXT_TURN",
  BUFF_DAMAGE: "BUFF_DAMAGE",
  BUFF_DAMAGE_THIS_TURN: "BUFF_DAMAGE_THIS_TURN",
  BUFF_DAMAGE_NEXT_TURN: "BUFF_DAMAGE_NEXT_TURN",
  BUFF_EQUIPPED_CARD_DAMAGE: "BUFF_EQUIPPED_CARD_DAMAGE",
  BUFF_DAMAGE_BY_TAG: "BUFF_DAMAGE_BY_TAG",
  BUFF_DAMAGE_BY_ATTACHED_ENERGY: "BUFF_DAMAGE_BY_ATTACHED_ENERGY",
  BUFF_BASE_ATTRIBUTES: "BUFF_BASE_ATTRIBUTES",
  INCREASE_MAX_HP: "INCREASE_MAX_HP",
  BUFF_HEAL_AMOUNT: "BUFF_HEAL_AMOUNT",
  DOUBLE_DAMAGE_AGAINST_TYPE: "DOUBLE_DAMAGE_AGAINST_TYPE",
  WEAKNESS_OVERRIDE: "WEAKNESS_OVERRIDE",
  ALPHA_POINT_OVERRIDE: "ALPHA_POINT_OVERRIDE",
  REDUCE_DAMAGE: "REDUCE_DAMAGE",
  REDUCE_NEXT_DAMAGE: "REDUCE_NEXT_DAMAGE",
  PREVENT_DAMAGE: "PREVENT_DAMAGE",
  IMMUNE_TO_DAMAGE_TYPE: "IMMUNE_TO_DAMAGE_TYPE",
  IMMUNE_TO_NEGATIVE_EFFECTS: "IMMUNE_TO_NEGATIVE_EFFECTS",
  IGNORE_TOOL_EFFECTS: "IGNORE_TOOL_EFFECTS",
  HALVE_DAMAGE_TAKEN: "HALVE_DAMAGE_TAKEN",
  REFLECT_DAMAGE: "REFLECT_DAMAGE",
  REFLECT_DOUBLE_DAMAGE: "REFLECT_DOUBLE_DAMAGE",
  REDIRECT_DAMAGE: "REDIRECT_DAMAGE",
  SHARE_DAMAGE: "SHARE_DAMAGE",
  TAKE_DAMAGE_INSTEAD: "TAKE_DAMAGE_INSTEAD",
  COIN_FLIP: "COIN_FLIP",
  DICE_ROLL: "DICE_ROLL",
  IF_DICE_GREATER_THAN: "IF_DICE_GREATER_THAN",
  IF_DICE_LESS_THAN: "IF_DICE_LESS_THAN",
  IF_TARGET_NATURE: "IF_TARGET_NATURE",
  IF_TARGET_TAG: "IF_TARGET_TAG",
  IF_SELF_HAS_ENERGY_COUNT: "IF_SELF_HAS_ENERGY_COUNT",
  IF_BENCH_HAS_CARD: "IF_BENCH_HAS_CARD",
  IF_BENCH_COUNT_BY_NATURE: "IF_BENCH_COUNT_BY_NATURE",
  IF_HAS_TOOL_ATTACHED: "IF_HAS_TOOL_ATTACHED",
  IF_CARD_WAS_ATTACKED: "IF_CARD_WAS_ATTACKED",
  IF_CARD_KNOCKED_OUT: "IF_CARD_KNOCKED_OUT",
  ON_ATTACK: "ON_ATTACK",
  ON_DAMAGE_TAKEN: "ON_DAMAGE_TAKEN",
  ON_ENERGY_ATTACHED: "ON_ENERGY_ATTACHED",
  ON_KNOCKOUT: "ON_KNOCKOUT",
  ON_TURN_START: "ON_TURN_START",
  ON_TURN_END: "ON_TURN_END",
  COPY_OPPONENT_ITEM: "COPY_OPPONENT_ITEM",
  TRANSFORM_INTO_OPPONENT_BENCH_CARD: "TRANSFORM_INTO_OPPONENT_BENCH_CARD",
  ABSORB_OWN_BENCH_CARD: "ABSORB_OWN_BENCH_CARD",
  CREATE_TEMPORARY_UNIT: "CREATE_TEMPORARY_UNIT",
  PLAY_ITEM_AS_UNIT: "PLAY_ITEM_AS_UNIT",
};

const labelFromValue = value => value
  .split("_")
  .map(word => word.charAt(0) + word.slice(1).toLowerCase())
  .join(" ");

export const EFFECT_TYPE_LABELS = {
  [EFFECT_TYPES.DAMAGE]: "Dano",
  [EFFECT_TYPES.DAMAGE_RANDOM_TARGETS]: "Dano em alvo aleatorio",
  [EFFECT_TYPES.DAMAGE_ANY_TARGET]: "Dano em qualquer alvo",
  [EFFECT_TYPES.DAMAGE_ACTIVE_AND_BENCH]: "Dano na ativa e banco",
  [EFFECT_TYPES.DAMAGE_ALL_OPPONENT_BENCH]: "Dano em todo banco oponente",
  [EFFECT_TYPES.DAMAGE_SELF]: "Dano em si mesmo",
  [EFFECT_TYPES.DAMAGE_EXTRA_BY_ENERGY]: "Dano extra por energia",
  [EFFECT_TYPES.DAMAGE_EXTRA_BY_BENCH_CARD]: "Dano extra por carta no banco",
  [EFFECT_TYPES.DAMAGE_EXTRA_BY_TARGET_TYPE]: "Dano extra por tipo do alvo",
  [EFFECT_TYPES.DAMAGE_EXTRA_BY_DICE]: "Dano extra por dado",
  [EFFECT_TYPES.DAMAGE_EXTRA_BY_COIN]: "Dano extra por moeda",
  [EFFECT_TYPES.DAMAGE_CONSECUTIVE_STACK]: "Dano acumulado consecutivo",
  [EFFECT_TYPES.DAMAGE_SPLIT]: "Dano dividido",
  [EFFECT_TYPES.DAMAGE_TO_PREVIOUSLY_DAMAGED_BENCH]: "Dano no banco ja ferido",
  [EFFECT_TYPES.HEAL]: "Cura",
  [EFFECT_TYPES.HEAL_SELF]: "Curar a si mesmo",
  [EFFECT_TYPES.HEAL_ACTIVE]: "Curar ativa",
  [EFFECT_TYPES.HEAL_BENCH]: "Curar banco",
  [EFFECT_TYPES.HEAL_ANY_SELF_CARD]: "Curar qualquer carta propria",
  [EFFECT_TYPES.HEAL_EQUIPPED_CARD]: "Curar carta equipada",
  [EFFECT_TYPES.HEAL_BY_DAMAGE_DEALT]: "Curar pelo dano causado",
  [EFFECT_TYPES.HEAL_ALLY_ON_DAMAGE]: "Curar aliado ao causar dano",
  [EFFECT_TYPES.HEAL_PER_TURN]: "Cura por turno",
  [EFFECT_TYPES.ADD_ENERGY]: "Adicionar energia",
  [EFFECT_TYPES.ADD_TYPED_ENERGY]: "Adicionar energia tipada",
  [EFFECT_TYPES.ADD_ENERGY_TO_ACTIVE]: "Adicionar energia na ativa",
  [EFFECT_TYPES.ADD_ENERGY_TO_BENCH]: "Adicionar energia no banco",
  [EFFECT_TYPES.ADD_ENERGY_BY_COIN]: "Adicionar energia por moeda",
  [EFFECT_TYPES.ADD_ENERGY_BY_DAMAGE_TAKEN]: "Adicionar energia por dano recebido",
  [EFFECT_TYPES.ADD_ENERGY_ON_ATTACK]: "Adicionar energia ao atacar",
  [EFFECT_TYPES.ADD_MULTIPLE_ENERGY]: "Adicionar multiplas energias",
  [EFFECT_TYPES.REMOVE_ENERGY]: "Remover energia",
  [EFFECT_TYPES.REMOVE_RANDOM_ENERGY]: "Remover energia aleatoria",
  [EFFECT_TYPES.MOVE_ENERGY]: "Mover energia",
  [EFFECT_TYPES.MOVE_ALL_ENERGY_FROM_BENCH_TO_ACTIVE]: "Mover energias do banco para ativa",
  [EFFECT_TYPES.DISCARD_OWN_ENERGY]: "Descartar propria energia",
  [EFFECT_TYPES.ENERGY_ANY_TYPE]: "Energia de qualquer tipo",
  [EFFECT_TYPES.ENERGY_COST_REDUCTION]: "Reduzir custo de energia",
  [EFFECT_TYPES.ENERGY_REQUIRED_TYPE]: "Exigir tipo de energia",
  [EFFECT_TYPES.DRAW_CARD]: "Comprar carta",
  [EFFECT_TYPES.DRAW_MULTIPLE]: "Comprar varias cartas",
  [EFFECT_TYPES.SEARCH_RANDOM_BASIC]: "Buscar basica aleatoria",
  [EFFECT_TYPES.LOOK_TOP_DECK]: "Ver topo do deck",
  [EFFECT_TYPES.REVEAL_OPPONENT_HAND]: "Revelar mao do oponente",
  [EFFECT_TYPES.REVEAL_ONE_CARD]: "Revelar uma carta",
  [EFFECT_TYPES.SHUFFLE_OPPONENT_HAND]: "Embaralhar mao do oponente",
  [EFFECT_TYPES.OPPONENT_DRAWS_RANDOM]: "Oponente compra aleatoria",
  [EFFECT_TYPES.SWAP_HAND_CARD_RANDOM]: "Trocar carta da mao aleatoria",
  [EFFECT_TYPES.FORCE_OPPONENT_SWAP_CARD]: "Forcar oponente a trocar carta",
  [EFFECT_TYPES.RETURN_CARD_TO_DECK]: "Retornar carta ao deck",
  [EFFECT_TYPES.RESURRECT_TO_DECK]: "Ressuscitar para o deck",
  [EFFECT_TYPES.RESURRECT_FROM_DISCARD]: "Ressuscitar do cemiterio",
  [EFFECT_TYPES.DISCARD_CARD]: "Descartar carta",
  [EFFECT_TYPES.SWITCH_ACTIVE]: "Trocar ativa",
  [EFFECT_TYPES.SWITCH_OWN_ACTIVE]: "Trocar sua ativa",
  [EFFECT_TYPES.SWITCH_OPPONENT_ACTIVE]: "Trocar ativa oponente",
  [EFFECT_TYPES.FORCE_SWITCH_OPPONENT_ACTIVE]: "Forcar troca do oponente",
  [EFFECT_TYPES.OPPONENT_CHOOSES_NEW_ACTIVE]: "Oponente escolhe nova ativa",
  [EFFECT_TYPES.IGNORE_RETREAT_COST]: "Ignorar custo de recuo",
  [EFFECT_TYPES.REDUCE_RETREAT_COST]: "Reduzir custo de recuo",
  [EFFECT_TYPES.BLOCK_RETREAT]: "Bloquear recuo",
  [EFFECT_TYPES.ATTACK_FROM_BENCH]: "Atacar do banco",
  [EFFECT_TYPES.PROMOTE_FROM_BENCH]: "Promover do banco",
  [EFFECT_TYPES.SUMMON_FROM_BENCH]: "Invocar do banco",
  [EFFECT_TYPES.RESCUE_ACTIVE]: "Resgatar ativa",
  [EFFECT_TYPES.BURN]: "Queimar",
  [EFFECT_TYPES.PARALYZE]: "Paralisar",
  [EFFECT_TYPES.FREEZE]: "Congelar",
  [EFFECT_TYPES.CONFUSE]: "Confundir",
  [EFFECT_TYPES.PREVENT_ATTACK]: "Impedir ataque",
  [EFFECT_TYPES.PREVENT_RETREAT]: "Impedir recuo",
  [EFFECT_TYPES.SKIP_NEXT_ATTACK]: "Pular proximo ataque",
  [EFFECT_TYPES.CANNOT_USE_SAME_ATTACK_NEXT_TURN]: "Nao repetir ataque no proximo turno",
  [EFFECT_TYPES.BUFF_DAMAGE]: "Aumentar dano",
  [EFFECT_TYPES.BUFF_DAMAGE_THIS_TURN]: "Aumentar dano neste turno",
  [EFFECT_TYPES.BUFF_DAMAGE_NEXT_TURN]: "Aumentar dano no proximo turno",
  [EFFECT_TYPES.BUFF_EQUIPPED_CARD_DAMAGE]: "Aumentar dano da carta equipada",
  [EFFECT_TYPES.BUFF_DAMAGE_BY_TAG]: "Aumentar dano por marcador",
  [EFFECT_TYPES.BUFF_DAMAGE_BY_ATTACHED_ENERGY]: "Aumentar dano por energia anexada",
  [EFFECT_TYPES.BUFF_BASE_ATTRIBUTES]: "Aumentar atributos base",
  [EFFECT_TYPES.INCREASE_MAX_HP]: "Aumentar vida maxima",
  [EFFECT_TYPES.BUFF_HEAL_AMOUNT]: "Aumentar cura",
  [EFFECT_TYPES.DOUBLE_DAMAGE_AGAINST_TYPE]: "Dobrar dano contra tipo",
  [EFFECT_TYPES.WEAKNESS_OVERRIDE]: "Alterar fraqueza",
  [EFFECT_TYPES.ALPHA_POINT_OVERRIDE]: "Alterar pontos Alpha",
  [EFFECT_TYPES.REDUCE_DAMAGE]: "Reduzir dano",
  [EFFECT_TYPES.REDUCE_NEXT_DAMAGE]: "Reduzir proximo dano",
  [EFFECT_TYPES.HALVE_DAMAGE_TAKEN]: "Reduzir dano recebido pela metade",
  [EFFECT_TYPES.PREVENT_DAMAGE]: "Prevenir dano",
  [EFFECT_TYPES.IMMUNE_TO_DAMAGE_TYPE]: "Imune a tipo de dano",
  [EFFECT_TYPES.IMMUNE_TO_NEGATIVE_EFFECTS]: "Imune a efeitos negativos",
  [EFFECT_TYPES.IGNORE_TOOL_EFFECTS]: "Ignorar efeitos de ferramenta",
  [EFFECT_TYPES.REFLECT_DAMAGE]: "Refletir dano",
  [EFFECT_TYPES.REFLECT_DOUBLE_DAMAGE]: "Refletir dano dobrado",
  [EFFECT_TYPES.REDIRECT_DAMAGE]: "Redirecionar dano",
  [EFFECT_TYPES.SHARE_DAMAGE]: "Compartilhar dano",
  [EFFECT_TYPES.TAKE_DAMAGE_INSTEAD]: "Receber dano no lugar",
  [EFFECT_TYPES.COIN_FLIP]: "Cara ou coroa",
  [EFFECT_TYPES.DICE_ROLL]: "Rolar dado",
  [EFFECT_TYPES.IF_DICE_GREATER_THAN]: "Se dado maior que",
  [EFFECT_TYPES.IF_DICE_LESS_THAN]: "Se dado menor que",
  [EFFECT_TYPES.IF_TARGET_NATURE]: "Se alvo tiver natureza",
  [EFFECT_TYPES.IF_TARGET_TAG]: "Se alvo tiver marcador",
  [EFFECT_TYPES.IF_SELF_HAS_ENERGY_COUNT]: "Se tiver quantidade de energia",
  [EFFECT_TYPES.IF_BENCH_HAS_CARD]: "Se banco tiver carta",
  [EFFECT_TYPES.IF_BENCH_COUNT_BY_NATURE]: "Se banco tiver natureza",
  [EFFECT_TYPES.IF_HAS_TOOL_ATTACHED]: "Se tiver equipamento anexado",
  [EFFECT_TYPES.IF_CARD_WAS_ATTACKED]: "Se carta foi atacada",
  [EFFECT_TYPES.IF_CARD_KNOCKED_OUT]: "Se carta foi nocauteada",
  [EFFECT_TYPES.ON_ATTACK]: "Ao atacar",
  [EFFECT_TYPES.ON_DAMAGE_TAKEN]: "Ao receber dano",
  [EFFECT_TYPES.ON_ENERGY_ATTACHED]: "Ao anexar energia",
  [EFFECT_TYPES.ON_KNOCKOUT]: "Ao nocautear",
  [EFFECT_TYPES.ON_TURN_START]: "No inicio do turno",
  [EFFECT_TYPES.ON_TURN_END]: "No fim do turno",
  [EFFECT_TYPES.COPY_OPPONENT_ITEM]: "Copiar item do oponente",
  [EFFECT_TYPES.TRANSFORM_INTO_OPPONENT_BENCH_CARD]: "Transformar em carta do banco oponente",
  [EFFECT_TYPES.ABSORB_OWN_BENCH_CARD]: "Absorver carta do proprio banco",
  [EFFECT_TYPES.CREATE_TEMPORARY_UNIT]: "Criar unidade temporaria",
  [EFFECT_TYPES.PLAY_ITEM_AS_UNIT]: "Jogar item como unidade",
};

export const TARGETS = {
  SELF: "SELF",
  SELF_ACTIVE: "SELF_ACTIVE",
  SELF_BENCH: "SELF_BENCH",
  SELF_BENCH_RANDOM: "SELF_BENCH_RANDOM",
  SELF_BENCH_BY_NATURE: "SELF_BENCH_BY_NATURE",
  SELF_BENCH_BY_NAME: "SELF_BENCH_BY_NAME",
  ANY_SELF_CARD: "ANY_SELF_CARD",
  ALL_SELF_CARDS: "ALL_SELF_CARDS",
  ALL_SELF_BENCH: "ALL_SELF_BENCH",
  EQUIPPED_CARD: "EQUIPPED_CARD",
  DAMAGE_SOURCE: "DAMAGE_SOURCE",
  DAMAGE_TARGET: "DAMAGE_TARGET",
  OPPONENT_ACTIVE: "OPPONENT_ACTIVE",
  OPPONENT_BENCH: "OPPONENT_BENCH",
  OPPONENT_BENCH_RANDOM: "OPPONENT_BENCH_RANDOM",
  ANY_OPPONENT_CARD: "ANY_OPPONENT_CARD",
  ALL_OPPONENT_CARDS: "ALL_OPPONENT_CARDS",
  ALL_OPPONENT_BENCH: "ALL_OPPONENT_BENCH",
  PREVIOUSLY_DAMAGED_OPPONENT: "PREVIOUSLY_DAMAGED_OPPONENT",
};

export const TARGET_LABELS = {
  [TARGETS.SELF]: "Voce",
  [TARGETS.SELF_ACTIVE]: "Sua ativa",
  [TARGETS.SELF_BENCH]: "Seu banco",
  [TARGETS.SELF_BENCH_RANDOM]: "Banco proprio aleatorio",
  [TARGETS.SELF_BENCH_BY_NATURE]: "Banco proprio por natureza",
  [TARGETS.SELF_BENCH_BY_NAME]: "Banco proprio por nome",
  [TARGETS.ANY_SELF_CARD]: "Qualquer sua",
  [TARGETS.ALL_SELF_CARDS]: "Todas suas",
  [TARGETS.ALL_SELF_BENCH]: "Todo seu banco",
  [TARGETS.EQUIPPED_CARD]: "Carta equipada",
  [TARGETS.DAMAGE_SOURCE]: "Fonte do dano",
  [TARGETS.DAMAGE_TARGET]: "Alvo do dano",
  [TARGETS.OPPONENT_ACTIVE]: "Ativa oponente",
  [TARGETS.OPPONENT_BENCH]: "Banco oponente",
  [TARGETS.OPPONENT_BENCH_RANDOM]: "Banco oponente aleatorio",
  [TARGETS.ANY_OPPONENT_CARD]: "Qualquer oponente",
  [TARGETS.ALL_OPPONENT_CARDS]: "Todas oponente",
  [TARGETS.ALL_OPPONENT_BENCH]: "Todo banco oponente",
  [TARGETS.PREVIOUSLY_DAMAGED_OPPONENT]: "Oponente ja ferido",
};

export const DURATIONS = {
  INSTANT: "INSTANT",
  THIS_TURN: "THIS_TURN",
  NEXT_TURN: "NEXT_TURN",
  UNTIL_LEAVES_ACTIVE: "UNTIL_LEAVES_ACTIVE",
  UNTIL_RETURNS_TO_BENCH: "UNTIL_RETURNS_TO_BENCH",
  UNTIL_KNOCKED_OUT: "UNTIL_KNOCKED_OUT",
  PERMANENT_WHILE_IN_PLAY: "PERMANENT_WHILE_IN_PLAY",
  ONCE_PER_TURN: "ONCE_PER_TURN",
};

export const DURATION_LABELS = {
  [DURATIONS.INSTANT]: "Instantaneo",
  [DURATIONS.THIS_TURN]: "Neste turno",
  [DURATIONS.NEXT_TURN]: "Proximo turno",
  [DURATIONS.UNTIL_LEAVES_ACTIVE]: "Ate sair da ativa",
  [DURATIONS.UNTIL_RETURNS_TO_BENCH]: "Ate voltar ao banco",
  [DURATIONS.UNTIL_KNOCKED_OUT]: "Ate ser nocauteado",
  [DURATIONS.PERMANENT_WHILE_IN_PLAY]: "Enquanto em jogo",
  [DURATIONS.ONCE_PER_TURN]: "Uma vez por turno",
};

export const EFFECT_CONDITIONS = {
  ALWAYS: "",
  ON_EQUIP: "ON_EQUIP",
  EQUIPPED_CARD_DEALS_DAMAGE: "EQUIPPED_CARD_DEALS_DAMAGE",
  EQUIPPED_CARD_TAKES_DAMAGE: "EQUIPPED_CARD_TAKES_DAMAGE",
  EQUIPPED_CARD_HAS_EQUIPMENT: "EQUIPPED_CARD_HAS_EQUIPMENT",
};

export const EFFECT_CONDITION_LABELS = {
  [EFFECT_CONDITIONS.ALWAYS]: "Sem condicao",
  [EFFECT_CONDITIONS.ON_EQUIP]: "Ao equipar",
  [EFFECT_CONDITIONS.EQUIPPED_CARD_DEALS_DAMAGE]: "Quando carta equipada causa dano",
  [EFFECT_CONDITIONS.EQUIPPED_CARD_TAKES_DAMAGE]: "Quando carta equipada recebe dano",
  [EFFECT_CONDITIONS.EQUIPPED_CARD_HAS_EQUIPMENT]: "Se tiver equipamento anexado",
};

export const EQUIPMENT_DAMAGE_BONUS_EFFECT_TYPES = new Set([
  EFFECT_TYPES.BUFF_DAMAGE,
  EFFECT_TYPES.BUFF_DAMAGE_THIS_TURN,
  EFFECT_TYPES.BUFF_DAMAGE_NEXT_TURN,
  EFFECT_TYPES.BUFF_EQUIPPED_CARD_DAMAGE,
  EFFECT_TYPES.BUFF_DAMAGE_BY_TAG,
  EFFECT_TYPES.BUFF_DAMAGE_BY_ATTACHED_ENERGY,
]);

export const EQUIPMENT_ON_EQUIP_EFFECT_TYPES = new Set([
  EFFECT_TYPES.HEAL,
  EFFECT_TYPES.HEAL_SELF,
  EFFECT_TYPES.HEAL_ACTIVE,
  EFFECT_TYPES.HEAL_EQUIPPED_CARD,
  EFFECT_TYPES.ADD_ENERGY,
  EFFECT_TYPES.ADD_TYPED_ENERGY,
  EFFECT_TYPES.ADD_ENERGY_TO_ACTIVE,
  EFFECT_TYPES.ADD_MULTIPLE_ENERGY,
  EFFECT_TYPES.BURN,
  EFFECT_TYPES.PARALYZE,
  EFFECT_TYPES.FREEZE,
  EFFECT_TYPES.CONFUSE,
  EFFECT_TYPES.PREVENT_ATTACK,
  EFFECT_TYPES.PREVENT_RETREAT,
  EFFECT_TYPES.SKIP_NEXT_ATTACK,
  EFFECT_TYPES.CANNOT_USE_SAME_ATTACK_NEXT_TURN,
  EFFECT_TYPES.BUFF_BASE_ATTRIBUTES,
  EFFECT_TYPES.INCREASE_MAX_HP,
  EFFECT_TYPES.BUFF_HEAL_AMOUNT,
  EFFECT_TYPES.DOUBLE_DAMAGE_AGAINST_TYPE,
  EFFECT_TYPES.WEAKNESS_OVERRIDE,
  EFFECT_TYPES.ALPHA_POINT_OVERRIDE,
  EFFECT_TYPES.REDUCE_DAMAGE,
  EFFECT_TYPES.REDUCE_NEXT_DAMAGE,
  EFFECT_TYPES.PREVENT_DAMAGE,
  EFFECT_TYPES.IMMUNE_TO_DAMAGE_TYPE,
  EFFECT_TYPES.IMMUNE_TO_NEGATIVE_EFFECTS,
  EFFECT_TYPES.IGNORE_TOOL_EFFECTS,
  EFFECT_TYPES.HALVE_DAMAGE_TAKEN,
  EFFECT_TYPES.REFLECT_DAMAGE,
  EFFECT_TYPES.REFLECT_DOUBLE_DAMAGE,
  EFFECT_TYPES.REDIRECT_DAMAGE,
  EFFECT_TYPES.SHARE_DAMAGE,
  EFFECT_TYPES.ENERGY_ANY_TYPE,
  EFFECT_TYPES.ENERGY_COST_REDUCTION,
  EFFECT_TYPES.ENERGY_REQUIRED_TYPE,
  EFFECT_TYPES.IGNORE_RETREAT_COST,
  EFFECT_TYPES.REDUCE_RETREAT_COST,
  EFFECT_TYPES.BLOCK_RETREAT,
  EFFECT_TYPES.ATTACK_FROM_BENCH,
]);

export const ABILITY_TRIGGERS = {
  ON_ATTACK: "ON_ATTACK",
  BEFORE_DAMAGE_TAKEN: "BEFORE_DAMAGE_TAKEN",
  ON_DAMAGE_TAKEN: "ON_DAMAGE_TAKEN",
  ALLY_ACTIVE_TAKES_DAMAGE: "ALLY_ACTIVE_TAKES_DAMAGE",
  ON_ENERGY_ATTACHED: "ON_ENERGY_ATTACHED",
  ON_TURN_START: "ON_TURN_START",
  ON_TURN_END: "ON_TURN_END",
  ON_KNOCKOUT: "ON_KNOCKOUT",
};

export const ABILITY_TRIGGER_LABELS = {
  [ABILITY_TRIGGERS.ON_ATTACK]: "Ao atacar",
  [ABILITY_TRIGGERS.BEFORE_DAMAGE_TAKEN]: "Antes de receber dano",
  [ABILITY_TRIGGERS.ON_DAMAGE_TAKEN]: "Ao receber dano",
  [ABILITY_TRIGGERS.ALLY_ACTIVE_TAKES_DAMAGE]: "Quando aliada ativa recebe dano",
  [ABILITY_TRIGGERS.ON_ENERGY_ATTACHED]: "Ao anexar energia",
  [ABILITY_TRIGGERS.ON_TURN_START]: "No inicio do turno",
  [ABILITY_TRIGGERS.ON_TURN_END]: "No fim do turno",
  [ABILITY_TRIGGERS.ON_KNOCKOUT]: "Ao nocautear",
};

export const ABILITY_CONDITION_TYPES = {
  SOURCE_POSITION: "SOURCE_POSITION",
  TARGET_POSITION: "TARGET_POSITION",
  TARGET_NATURE_IN: "TARGET_NATURE_IN",
  TARGET_IS_DAMAGED: "TARGET_IS_DAMAGED",
  SELF_HAS_ENERGY_TYPE: "SELF_HAS_ENERGY_TYPE",
  SELF_ENERGY_COUNT_GTE: "SELF_ENERGY_COUNT_GTE",
};

export const ABILITY_CONDITION_LABELS = {
  [ABILITY_CONDITION_TYPES.SOURCE_POSITION]: "Posicao da fonte",
  [ABILITY_CONDITION_TYPES.TARGET_POSITION]: "Posicao do alvo",
  [ABILITY_CONDITION_TYPES.TARGET_NATURE_IN]: "Natureza do alvo esta em",
  [ABILITY_CONDITION_TYPES.TARGET_IS_DAMAGED]: "Alvo esta ferido",
  [ABILITY_CONDITION_TYPES.SELF_HAS_ENERGY_TYPE]: "Fonte tem energia",
  [ABILITY_CONDITION_TYPES.SELF_ENERGY_COUNT_GTE]: "Fonte tem energia minima",
};

export const effectTypeLabel = type => EFFECT_TYPE_LABELS[type] || labelFromValue(type);
export const targetLabel = target => TARGET_LABELS[target] || labelFromValue(target);
export const durationLabel = duration => DURATION_LABELS[duration] || labelFromValue(duration);
export const conditionLabel = condition => EFFECT_CONDITION_LABELS[condition || ""] || labelFromValue(condition);
export const abilityTriggerLabel = trigger => ABILITY_TRIGGER_LABELS[trigger] || labelFromValue(trigger);
export const abilityConditionLabel = type => ABILITY_CONDITION_LABELS[type] || labelFromValue(type);

export const normalizeEffects = effects => (
  Array.isArray(effects)
    ? effects
        .filter(effect => effect?.type)
        .map(effect => ({
          type: effect.type,
          target: effect.target || TARGETS.OPPONENT_ACTIVE,
          duration: effect.duration || DURATIONS.INSTANT,
          amount: Math.max(0, parseInt(effect.amount, 10) || 0),
          attribute: effect.attribute || "",
          energy_type: effect.energy_type || "",
          nature: effect.nature || "",
          card_name: effect.card_name || "",
          tag: effect.tag || "",
          condition: effect.condition || "",
        }))
    : []
);

export const shouldApplyEquipmentPassiveEffect = (effect, trigger) => {
  if (!effect?.type || !trigger) return false;
  const condition = effect.condition || EFFECT_CONDITIONS.ALWAYS;
  if (condition === trigger) return true;
  return (
    trigger === EFFECT_CONDITIONS.ON_EQUIP &&
    condition === EFFECT_CONDITIONS.ALWAYS &&
    EQUIPMENT_ON_EQUIP_EFFECT_TYPES.has(effect.type)
  );
};

export const normalizeEquipmentPassiveEffects = effects => (
  normalizeEffects(effects).map(effect => ({
    ...effect,
    condition: (
      (effect.condition || EFFECT_CONDITIONS.ALWAYS) === EFFECT_CONDITIONS.ALWAYS &&
      EQUIPMENT_ON_EQUIP_EFFECT_TYPES.has(effect.type)
    )
      ? EFFECT_CONDITIONS.ON_EQUIP
      : effect.condition,
  }))
);

export const effectSummary = effect => {
  const type = effectTypeLabel(effect.type);
  const target = targetLabel(effect.target);
  const duration = effect.duration && effect.duration !== DURATIONS.INSTANT ? ` (${durationLabel(effect.duration)})` : "";
  const condition = effect.condition ? ` | ${conditionLabel(effect.condition)}` : "";
  const amount = effect.amount ? ` ${effect.amount}` : "";
  const details = [
    effect.nature,
    effect.energy_type,
    effect.attribute,
    effect.card_name,
    effect.tag,
  ].filter(Boolean);
  const extra = details.length ? ` | ${details.join(" / ")}` : "";
  return `${type}${amount} - ${target}${duration}${condition}${extra}`;
};

const normalizeConditionValue = value => {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
  if (typeof value === "string" && value.includes(",")) {
    return value.split(",").map(item => item.trim()).filter(Boolean);
  }
  return value ?? "";
};

export const normalizeAbilityConditions = conditions => (
  Array.isArray(conditions)
    ? conditions
        .filter(condition => condition?.type)
        .map(condition => ({
          type: condition.type,
          value: normalizeConditionValue(condition.value),
        }))
    : []
);

export const normalizeAbilityRules = rules => (
  Array.isArray(rules)
    ? rules
        .filter(rule => rule?.trigger)
        .map(rule => ({
          trigger: rule.trigger,
          conditions: normalizeAbilityConditions(rule.conditions),
          effects: normalizeEffects(rule.effects),
          duration: rule.duration || DURATIONS.INSTANT,
        }))
        .filter(rule => rule.effects.length > 0)
    : []
);

export const ruleSummary = rule => {
  const effects = normalizeEffects(rule.effects).map(effectSummary).join(" + ");
  const conditions = normalizeAbilityConditions(rule.conditions)
    .map(condition => `${abilityConditionLabel(condition.type)}: ${Array.isArray(condition.value) ? condition.value.join(", ") : condition.value}`)
    .join(" | ");
  return `${abilityTriggerLabel(rule.trigger)}${conditions ? ` (${conditions})` : ""}: ${effects}`;
};
