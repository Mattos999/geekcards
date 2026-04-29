import React, { useMemo, useState, useEffect } from "react";
import { api, formatApiError, imageUrl } from "../lib/api";
import { NATURE_COLORS } from "../lib/natures";
import { EnergyCostSymbols } from "../components/EnergyCostSymbols";
import { CommunityCardDetailModal } from "../components/CommunityCardDetailModal";
import { EFFECT_TYPES, TARGETS, normalizeEffects } from "../lib/cardEffects";
import {
  DUEL_RULES,
  attachEnergy,
  createDuel,
  endTurn,
  evolveFromHand,
  findEvolutionTargets,
  playToBench,
  retreat,
  runBotTurn,
  activateAbility,
  canAttackThisTurn,
  canPayAbility,
  finishSetup,
  knockoutPoints,
  playActionCard,
  setupActive,
  setupBenchToHand,
  setupToBench,
} from "../lib/duelEngine";
import { Archive, Bot, ChevronRight, Loader2, Play, RotateCcw, Shield, Sparkles, Sword, Users, X, Zap } from "lucide-react";
import { toast } from "sonner";

const CardThumb = ({ card, compact = false, onClick }) => {
  if (!card) {
    return (
      <div className={`aspect-[2.5/3.5] rounded-lg border border-dashed border-slate-700 bg-slate-950/60 ${compact ? "w-16" : "w-28"}`} />
    );
  }

  const color = card.natures?.[0] ? NATURE_COLORS[card.natures[0]] : "#334155";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`relative aspect-[2.5/3.5] overflow-hidden rounded-lg border bg-slate-950 ${compact ? "w-16" : "w-28"}`}
      style={{ borderColor: `${color}88` }}
    >
      {card.image_url ? (
        <img src={imageUrl(card.image_url)} alt={card.name} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-2xl font-bold opacity-20">
          {card.name?.[0] || "?"}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent p-2">
        <div className="truncate text-[10px] font-bold text-white">{card.name}</div>
        {card.hp_remaining !== undefined && (
          <div className="mt-0.5 text-[10px] font-mono text-rose-300">
            {card.hp_remaining}/{card.hp || 0} HP
          </div>
        )}
      </div>
      {card.is_alpha && (
        <div className="absolute left-1 top-1 rounded bg-yellow-300 px-1 text-[8px] font-black text-slate-950">A</div>
      )}
    </button>
  );
};

const FieldCard = ({ card, title, children, onCardClick }) => (
  <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
    <div className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">{title}</div>
    <div className="flex gap-3">
      <CardThumb card={card} onClick={card ? () => onCardClick?.(card) : undefined} />
      <div className="min-w-0 flex-1 space-y-2">
        {card ? (
          <>
            <div className="truncate text-sm font-bold">{card.name}</div>
            <div className="flex flex-wrap gap-1 text-[10px]">
              {(card.attached_energy || []).map((energy, index) => (
                <span key={`${energy}-${index}`} className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-indigo-200">
                  {energy}
                </span>
              ))}
              {(card.attached_energy || []).length === 0 && <span className="text-slate-500">Sem energia</span>}
            </div>
            <div className="text-[10px] text-slate-500">
              Recuo {card.recuo ?? 0} · Vale {knockoutPoints(card)} ponto(s)
            </div>
            {(card.equipments || []).length > 0 && (
              <div className="inline-flex max-w-full items-center gap-1 rounded border border-fuchsia-500/25 bg-fuchsia-500/10 px-1.5 py-1">
                <span className="shrink-0 text-[8px] uppercase tracking-wider text-fuchsia-200/80">Eq.</span>
                {(card.equipments || []).map((equipment, index) => (
                  <button
                    key={`${equipment.id || equipment.name}-${index}`}
                    type="button"
                    onClick={() => onCardClick?.(equipment)}
                    className="min-w-0 max-w-28 truncate rounded bg-slate-950/70 px-1.5 py-0.5 text-left text-[10px] text-fuchsia-100 hover:bg-slate-900"
                  >
                    {equipment.name}
                  </button>
                ))}
              </div>
            )}
            {children}
          </>
        ) : (
          <div className="text-sm text-slate-500">Sem carta ativa</div>
        )}
      </div>
    </div>
  </div>
);

const SetupPanel = ({ title, player, side, onAction, onCardClick }) => (
  <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-4">
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-sm font-bold">{title}</h3>
      <span className="text-xs text-slate-500">Banco {player.bench.length}/{DUEL_RULES.BENCH_LIMIT}</span>
    </div>

    <div className="grid gap-3 lg:grid-cols-[10rem_1fr]">
      <div>
        <div className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Ativa</div>
        <CardThumb card={player.active} onClick={player.active ? () => onCardClick?.(player.active) : undefined} />
      </div>
      <div>
        <div className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Banco</div>
        <div className="flex gap-2">
          {[0, 1, 2].map(index => (
            <div key={index} className="space-y-1">
              <CardThumb card={player.bench[index]} compact onClick={player.bench[index] ? () => onCardClick?.(player.bench[index]) : undefined} />
              {player.bench[index] && (
                <button
                  type="button"
                  onClick={() => onAction(state => setupBenchToHand(state, side, index))}
                  className="w-full rounded bg-slate-800 px-1 py-0.5 text-[10px] text-slate-300"
                >
                  Remover
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>

    <div className="mt-4">
      <div className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Mao inicial</div>
      <div className="max-h-56 overflow-x-auto overflow-y-hidden rounded-lg border border-slate-800 bg-slate-950/40 p-2">
        <div className="flex min-w-max gap-2 pb-1">
        {player.hand.map((card, index) => {
          const isBasic = card.card_type === "Personagem" && !card.is_evolution;
          return (
            <div key={`${card.id}-${index}`} className="w-28 shrink-0 space-y-2 rounded-lg border border-slate-800 bg-slate-950/50 p-2">
              <CardThumb card={card} onClick={() => onCardClick?.(card)} />
              <div className="grid gap-1">
                <button
                  type="button"
                  onClick={() => onAction(state => setupActive(state, side, index))}
                  disabled={!isBasic}
                  className="rounded bg-emerald-500/15 px-2 py-1 text-[10px] text-emerald-200 disabled:opacity-35"
                >
                  Ativa
                </button>
                <button
                  type="button"
                  onClick={() => onAction(state => setupToBench(state, side, index))}
                  disabled={!isBasic || player.bench.length >= DUEL_RULES.BENCH_LIMIT}
                  className="rounded bg-indigo-500/15 px-2 py-1 text-[10px] text-indigo-200 disabled:opacity-35"
                >
                  Banco
                </button>
              </div>
            </div>
          );
        })}
        </div>
      </div>
    </div>
  </div>
);

const CemeteryModal = ({ title, cards, onClose, onCardClick }) => (
  <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
    <div className="max-h-[86vh] w-full max-w-3xl overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-800 p-4">
        <div className="flex items-center gap-2">
          <Archive size={16} className="text-slate-400" />
          <div>
            <h3 className="text-sm font-bold">{title}</h3>
            <p className="text-xs text-slate-500">{cards.length} carta(s)</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-300 hover:text-white"
          aria-label="Fechar cemiterio"
        >
          <X size={16} />
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto p-4">
        {cards.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-800 p-8 text-center text-sm text-slate-500">
            Cemiterio vazio
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {cards.map((card, index) => (
              <div key={`${card.id || card.instance_id || card.name}-${index}`} className="flex justify-center">
                <CardThumb card={card} compact onClick={() => onCardClick?.(card)} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
);

const expandDeckCards = deckData => {
  const cardsById = Object.fromEntries((deckData.cards || []).map(card => [card.id, card]));
  return (deckData.deck.card_ids || [])
    .map(id => cardsById[id])
    .filter(Boolean);
};

const validateDuelDeck = (cards, ownerLabel) => {
  if (cards.length !== 20) return `${ownerLabel} precisa ter exatamente 20 cartas`;
  if (cards.some(card => card.card_type === "Energia")) return `${ownerLabel} nao pode ter cartas de energia`;
  if (!cards.some(card => card.card_type === "Personagem" && !card.is_evolution)) {
    return `${ownerLabel} precisa ter pelo menos uma carta basica`;
  }

  const countsByName = {};
  cards.forEach(card => {
    countsByName[card.name] = (countsByName[card.name] || 0) + 1;
  });

  const repeated = Object.entries(countsByName).find(([, amount]) => amount > 2);
  if (repeated) return `${ownerLabel} tem ${repeated[1]} copias de "${repeated[0]}" (maximo 2)`;
  return "";
};

const abilityDamage = ability => {
  const damageEffect = normalizeEffects(ability.effects).find(effect => effect.type === EFFECT_TYPES.DAMAGE);
  return damageEffect?.amount ?? ability.damage ?? 0;
};

const needsOpponentTargetChoice = effects => normalizeEffects(effects).some(effect =>
  effect.type === EFFECT_TYPES.DAMAGE_ANY_TARGET ||
  effect.target === TARGETS.ANY_OPPONENT_CARD ||
  effect.target === TARGETS.OPPONENT_BENCH
);

const needsEnergySourceChoice = effects => normalizeEffects(effects).some(effect =>
  effect.type === EFFECT_TYPES.MOVE_ENERGY ||
  effect.type === EFFECT_TYPES.MOVE_ALL_ENERGY_FROM_BENCH_TO_ACTIVE
);

export default function DuelPage() {
  const [mode, setMode] = useState("");
  const [decks, setDecks] = useState([]);
  const [playerDeckId, setPlayerDeckId] = useState("");
  const [opponentDeckId, setOpponentDeckId] = useState("");
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [duel, setDuel] = useState(null);
  const [retreatChoosing, setRetreatChoosing] = useState(false);
  const [detailCard, setDetailCard] = useState(null);
  const [pendingTargetAction, setPendingTargetAction] = useState(null);
  const [pendingEnergyMoveAction, setPendingEnergyMoveAction] = useState(null);
  const [pendingEvolutionHandIndex, setPendingEvolutionHandIndex] = useState(null);
  const [cemeterySide, setCemeterySide] = useState(null);
  const [onlinePlayers, setOnlinePlayers] = useState([]);
  const [onlineDuels, setOnlineDuels] = useState([]);
  const [activeOnlineDuel, setActiveOnlineDuel] = useState(null);
  const [onlineBusy, setOnlineBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/decks");
        setDecks(data);
        setPlayerDeckId(data?.[0]?.id || "");
        setOpponentDeckId(data?.[1]?.id || data?.[0]?.id || "");
      } catch (e) {
        toast.error(formatApiError(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadOnlineLobby = async ({ silent = false } = {}) => {
    if (!silent) setOnlineBusy(true);
    try {
      const [playersRes, duelsRes] = await Promise.all([
        api.get("/duels/online/players"),
        api.get("/duels/online"),
      ]);
      setOnlinePlayers(playersRes.data || []);
      setOnlineDuels(duelsRes.data || []);
      setActiveOnlineDuel(current => {
        const currentFresh = current ? (duelsRes.data || []).find(duel => duel.id === current.id) : null;
        return currentFresh || (duelsRes.data || [])[0] || null;
      });
    } catch (e) {
      if (!silent) toast.error(formatApiError(e));
    } finally {
      if (!silent) setOnlineBusy(false);
    }
  };

  useEffect(() => {
    if (mode !== "online") return undefined;
    loadOnlineLobby();
    const timer = window.setInterval(() => loadOnlineLobby({ silent: true }), 3000);
    return () => window.clearInterval(timer);
  }, [mode]);

  const startDuel = async () => {
    if (!playerDeckId) {
      toast.error("Escolha um deck");
      return;
    }

    setStarting(true);
    try {
      const [playerRes, opponentRes] = await Promise.all([
        api.get(`/decks/${playerDeckId}`),
        api.get(`/decks/${opponentDeckId || playerDeckId}`),
      ]);

      const playerCards = expandDeckCards(playerRes.data);
      const opponentCards = expandDeckCards(opponentRes.data);
      const chosenOpponentCards = opponentCards.length ? opponentCards : playerCards;

      const playerDeckError = validateDuelDeck(playerCards, "Seu deck");
      if (playerDeckError) { toast.error(playerDeckError); return; }

      const opponentDeckError = validateDuelDeck(chosenOpponentCards, "O deck do oponente");
      if (opponentDeckError) { toast.error(opponentDeckError); return; }

      if (!playerCards.some(card => card.card_type === "Personagem" && !card.is_evolution)) {
        toast.error("Seu deck precisa ter pelo menos uma carta básica");
        return;
      }

      if (!chosenOpponentCards.some(card => card.card_type === "Personagem" && !card.is_evolution)) {
        toast.error("O deck do oponente precisa ter pelo menos uma carta básica");
        return;
      }

      setDuel(createDuel(
        playerCards,
        chosenOpponentCards,
        playerRes.data.deck.energy_types,
        opponentRes.data.deck.energy_types
      ));
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setStarting(false);
    }
  };

  const inviteOnlinePlayer = async playerId => {
    setOnlineBusy(true);
    try {
      const { data } = await api.post("/duels/online/invite", { opponent_id: playerId });
      setActiveOnlineDuel(data);
      await loadOnlineLobby({ silent: true });
      toast.success("Convite enviado");
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setOnlineBusy(false);
    }
  };

  const postOnline = async (path, payload = {}) => {
    if (!activeOnlineDuel) return;
    setOnlineBusy(true);
    try {
      const { data } = await api.post(`/duels/online/${activeOnlineDuel.id}${path}`, payload);
      setActiveOnlineDuel(data);
      await loadOnlineLobby({ silent: true });
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setOnlineBusy(false);
    }
  };

  const chooseOnlineDeck = () => {
    if (!playerDeckId) {
      toast.error("Escolha um deck");
      return;
    }
    postOnline("/deck", { deck_id: playerDeckId });
  };

  const onlineAction = payload => postOnline("/action", payload);

  const player = duel?.players.player;
  const opponent = duel?.players.opponent;
  const isSetup = duel?.phase === "setup";
  const isPlayerTurn = duel?.turn === "player" && !duel?.winner;
  const activeRetreatCost = player?.active?.ignore_retreat_cost
    ? 0
    : Math.max(0, (parseInt(player?.active?.recuo, 10) || 0) - (parseInt(player?.active?.retreat_cost_reduction, 10) || 0));
  const canPlayerRetreat = Boolean(
    isPlayerTurn &&
    player?.active &&
    player?.bench?.length > 0 &&
    !(player.active.status_effects || []).some(status => ["prevent_retreat", "block_retreat"].includes(status)) &&
    (player.active.attached_energy || []).length >= activeRetreatCost
  );

  const applyAndBot = action => {
    setDuel(current => {
      if (!current) return current;
      const next = action(current);
      return next.turn === "opponent" && !next.winner ? runBotTurn(next) : next;
    });
  };

  const applySetup = action => {
    setDuel(current => current ? action(current) : current);
  };

  const runCardAction = (action, context = {}) => {
    if (!action) return;
    if (action.kind === "ability") {
      applyAndBot(state => activateAbility(state, "player", action.abilityIndex, context));
    } else if (action.kind === "hand") {
      applyAndBot(state => playActionCard(state, "player", action.handIndex, context));
    }
    setPendingTargetAction(null);
    setPendingEnergyMoveAction(null);
    setPendingEvolutionHandIndex(null);
  };

  const handleAbilityClick = (ability, index) => {
    if (!canAttackThisTurn(duel, "player", index)) {
      toast.error(duel?.turn_number <= 1 ? "Nao e possivel atacar no primeiro turno" : "Esta carta nao pode atacar agora");
      return;
    }
    const effects = normalizeEffects(ability.effects);
    const action = { kind: "ability", abilityIndex: index };
    setPendingEvolutionHandIndex(null);
    if (needsEnergySourceChoice(effects)) {
      setPendingEnergyMoveAction(action);
      setPendingTargetAction(null);
      return;
    }
    if (needsOpponentTargetChoice(effects)) {
      setPendingTargetAction(action);
      setPendingEnergyMoveAction(null);
      return;
    }
    applyAndBot(state => activateAbility(state, "player", index));
  };

  const handleHandActionClick = (card, index) => {
    const effects = normalizeEffects(card.effects);
    const action = { kind: "hand", handIndex: index };
    setPendingEvolutionHandIndex(null);
    if (needsEnergySourceChoice(effects)) {
      setPendingEnergyMoveAction(action);
      setPendingTargetAction(null);
      return;
    }
    if (needsOpponentTargetChoice(effects)) {
      setPendingTargetAction(action);
      setPendingEnergyMoveAction(null);
      return;
    }
    applyAndBot(state => playActionCard(state, "player", index));
  };

  const getEvolutionTargets = handIndex => duel ? findEvolutionTargets(duel, "player", handIndex) : [];

  const canChooseEvolutionTarget = (zone, index) => (
    pendingEvolutionHandIndex !== null &&
    getEvolutionTargets(pendingEvolutionHandIndex).some(target => target.zone === zone && target.index === index)
  );

  const handleEvolutionClick = handIndex => {
    const targets = getEvolutionTargets(handIndex);
    if (targets.length === 0) return;

    setPendingTargetAction(null);
    setPendingEnergyMoveAction(null);
    if (targets.length === 1) {
      const target = targets[0];
      applyAndBot(state => evolveFromHand(state, "player", handIndex, target.zone, target.index));
      setPendingEvolutionHandIndex(null);
      return;
    }

    setPendingEvolutionHandIndex(handIndex);
  };

  const chooseEvolutionTarget = (zone, index) => {
    if (pendingEvolutionHandIndex === null) return;
    applyAndBot(state => evolveFromHand(state, "player", pendingEvolutionHandIndex, zone, index));
    setPendingEvolutionHandIndex(null);
  };

  const playableHand = useMemo(() => {
    if (!player) return [];
    return player.hand.map((card, index) => ({ card, index }));
  }, [player]);

  useEffect(() => {
    if (!canPlayerRetreat) setRetreatChoosing(false);
  }, [canPlayerRetreat]);

  useEffect(() => {
    if (
      pendingEvolutionHandIndex !== null &&
      (!duel || findEvolutionTargets(duel, "player", pendingEvolutionHandIndex).length === 0)
    ) {
      setPendingEvolutionHandIndex(null);
    }
  }, [duel, pendingEvolutionHandIndex]);

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-indigo-400" /></div>;
  }

  if (!mode) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <div className="mb-6">
          <div className="mb-1 flex items-center gap-2 text-sm uppercase tracking-[0.2em] text-indigo-400">
            <Sword size={14} />
            Duelo
          </div>
          <h1 className="text-4xl font-bold" style={{ fontFamily: "Outfit" }}>Arena GeekCards</h1>
          <p className="mt-1 text-sm text-slate-400">Escolha como quer entrar na arena.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setMode("online")}
            className="glass min-h-56 rounded-xl p-6 text-left transition-colors hover:border-indigo-500/50"
          >
            <Users className="mb-4 text-indigo-300" size={34} />
            <h2 className="text-2xl font-bold" style={{ fontFamily: "Outfit" }}>Duelo online</h2>
            <p className="mt-2 text-sm text-slate-400">
              Convide jogadores online, escolha seu deck em privado e jogue por polling assíncrono.
            </p>
          </button>
          <button
            type="button"
            onClick={() => setMode("bot")}
            className="glass min-h-56 rounded-xl p-6 text-left transition-colors hover:border-rose-500/50"
          >
            <Bot className="mb-4 text-rose-300" size={34} />
            <h2 className="text-2xl font-bold" style={{ fontFamily: "Outfit" }}>Duelo contra bot</h2>
            <p className="mt-2 text-sm text-slate-400">
              Use o modo local já existente para testar seus decks contra um oponente automático.
            </p>
          </button>
        </div>
      </div>
    );
  }

  if (mode === "online") {
    const onlineState = activeOnlineDuel?.state;
    const onlinePlayer = onlineState?.players?.player;
    const onlineOpponent = onlineState?.players?.opponent;
    const onlineIsPlayerTurn = onlineState?.turn === "player" && !onlineState?.winner;
    const inviteReceived = activeOnlineDuel?.status === "invited" && activeOnlineDuel?.invitee_id === activeOnlineDuel?.me?.user_id;
    const inviteSent = activeOnlineDuel?.status === "invited" && !inviteReceived;

    return (
      <div className="p-6 max-w-[1500px] mx-auto">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-sm uppercase tracking-[0.2em] text-indigo-400 mb-1 flex items-center gap-2">
              <Users size={14} />
              Duelo online
            </div>
            <h1 className="text-4xl font-bold" style={{ fontFamily: "Outfit" }}>Arena Online</h1>
            <p className="mt-1 text-sm text-slate-400">
              Polling ativo. A mão do oponente fica sempre privada no servidor.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setMode(""); setActiveOnlineDuel(null); }}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            Trocar modo
          </button>
        </div>

        <div className="grid gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <aside className="space-y-4">
            <div className="glass rounded-xl p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold">Jogadores online</h2>
                {onlineBusy && <Loader2 size={14} className="animate-spin text-indigo-300" />}
              </div>
              <div className="space-y-2">
                {onlinePlayers.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-800 p-4 text-center text-sm text-slate-500">
                    Nenhum jogador online agora
                  </div>
                ) : onlinePlayers.map(other => (
                  <div key={other.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold">{other.name}</div>
                      <div className="text-xs text-emerald-300">online</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => inviteOnlinePlayer(other.id)}
                      disabled={onlineBusy}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium hover:bg-indigo-500 disabled:opacity-50"
                    >
                      Convidar
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass rounded-xl p-4">
              <h2 className="mb-3 text-sm font-bold">Convites e duelos</h2>
              <div className="space-y-2">
                {onlineDuels.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-800 p-4 text-center text-sm text-slate-500">
                    Sem convites ativos
                  </div>
                ) : onlineDuels.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveOnlineDuel(item)}
                    className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${activeOnlineDuel?.id === item.id ? "border-indigo-500/60 bg-indigo-500/10" : "border-slate-800 bg-slate-950/50 hover:border-slate-700"}`}
                  >
                    <div className="font-bold">{item.opponent?.name || "Oponente"}</div>
                    <div className="mt-1 text-xs text-slate-400">{item.status}</div>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <section className="min-w-0">
            {!activeOnlineDuel ? (
              <div className="glass rounded-xl p-12 text-center">
                <Shield className="mx-auto mb-3 text-slate-600" size={34} />
                <p className="text-slate-400">Convide alguém online ou aceite um convite para começar.</p>
              </div>
            ) : activeOnlineDuel.status === "invited" ? (
              <div className="glass rounded-xl p-6">
                <h2 className="text-xl font-bold">{inviteReceived ? "Você recebeu um convite" : "Convite enviado"}</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Oponente: {activeOnlineDuel.opponent?.name}
                </p>
                {inviteReceived ? (
                  <div className="mt-5 flex gap-2">
                    <button onClick={() => postOnline("/accept")} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500">Aceitar</button>
                    <button onClick={() => postOnline("/decline")} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">Recusar</button>
                  </div>
                ) : (
                  <p className="mt-5 text-sm text-slate-400">Aguardando resposta do jogador convidado.</p>
                )}
                {inviteSent && (
                  <button onClick={() => postOnline("/decline")} className="mt-4 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">Cancelar convite</button>
                )}
              </div>
            ) : activeOnlineDuel.status === "deck_selection" ? (
              <div className="glass rounded-xl p-6">
                <h2 className="text-xl font-bold">Escolha seu deck</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Cada jogador escolhe o próprio deck. O duelo começa a preparar quando ambos confirmarem.
                </p>
                <div className="mt-5 flex flex-wrap items-end gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">Seu deck</label>
                    <select value={playerDeckId} onChange={event => setPlayerDeckId(event.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm">
                      {decks.map(deck => <option key={deck.id} value={deck.id}>{deck.name}</option>)}
                    </select>
                  </div>
                  <button onClick={chooseOnlineDeck} disabled={onlineBusy || decks.length === 0}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50">
                    Confirmar deck
                  </button>
                </div>
                <div className="mt-5 grid gap-2 text-sm text-slate-400 sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">Você: {activeOnlineDuel.me?.ready ? "pronto" : "escolhendo"}</div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">{activeOnlineDuel.opponent?.name}: {activeOnlineDuel.opponent?.ready ? "pronto" : "escolhendo"}</div>
                </div>
              </div>
            ) : onlineState?.phase === "setup" ? (
              <div className="glass rounded-xl p-5">
                <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-xl font-bold">Preparação online</h2>
                    <p className="mt-1 text-sm text-slate-400">
                      {activeOnlineDuel.coin?.winner_name} começa. Escolha sua ativa e banco; a mão do oponente não é exibida.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => postOnline("/setup-ready", { ready: !onlinePlayer?.setup_ready })}
                    disabled={!onlinePlayer?.active}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-40"
                  >
                    {onlinePlayer?.setup_ready ? "Desmarcar pronto" : "Pronto"}
                  </button>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-bold">Você</h3>
                      <span className="text-xs text-slate-500">Banco {onlinePlayer?.bench?.length || 0}/{DUEL_RULES.BENCH_LIMIT}</span>
                    </div>
                    <div className="mb-4 flex gap-3">
                      <CardThumb card={onlinePlayer?.active} onClick={onlinePlayer?.active ? () => setDetailCard(onlinePlayer.active) : undefined} />
                      <div className="flex gap-2">
                        {[0, 1, 2].map(index => (
                          <div key={index} className="space-y-1">
                            <CardThumb card={onlinePlayer?.bench?.[index]} compact onClick={onlinePlayer?.bench?.[index] ? () => setDetailCard(onlinePlayer.bench[index]) : undefined} />
                            {onlinePlayer?.bench?.[index] && (
                              <button onClick={() => onlineAction({ kind: "setup_bench_to_hand", bench_index: index })} className="w-full rounded bg-slate-800 px-1 py-0.5 text-[10px] text-slate-300">Remover</button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="max-h-56 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/40 p-2">
                      <div className="flex min-w-max gap-2">
                        {(onlinePlayer?.hand || []).map((card, index) => (
                          <div key={`${card.id}-${index}`} className="w-28 shrink-0 space-y-2 rounded-lg border border-slate-800 bg-slate-950/50 p-2">
                            <CardThumb card={card} onClick={() => setDetailCard(card)} />
                            <button onClick={() => onlineAction({ kind: "setup_active", hand_index: index })} disabled={card.card_type !== "Personagem" || card.is_evolution} className="w-full rounded bg-emerald-500/15 px-2 py-1 text-[10px] text-emerald-200 disabled:opacity-35">Ativa</button>
                            <button onClick={() => onlineAction({ kind: "setup_to_bench", hand_index: index })} disabled={card.card_type !== "Personagem" || card.is_evolution || (onlinePlayer?.bench?.length || 0) >= DUEL_RULES.BENCH_LIMIT} className="w-full rounded bg-indigo-500/15 px-2 py-1 text-[10px] text-indigo-200 disabled:opacity-35">Banco</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-bold">{activeOnlineDuel.opponent?.name}</h3>
                      <span className="text-xs text-slate-500">{onlineOpponent?.setup_ready ? "pronto" : "preparando"}</span>
                    </div>
                    <div className="flex gap-3">
                      <CardThumb card={onlineOpponent?.active} onClick={onlineOpponent?.active ? () => setDetailCard(onlineOpponent.active) : undefined} />
                      <div className="flex gap-2">
                        {[0, 1, 2].map(index => (
                          <CardThumb key={index} card={onlineOpponent?.bench?.[index]} compact onClick={onlineOpponent?.bench?.[index] ? () => setDetailCard(onlineOpponent.bench[index]) : undefined} />
                        ))}
                      </div>
                    </div>
                    <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-400">
                      Mão do oponente: {onlineOpponent?.hand_count ?? onlineOpponent?.hand?.length ?? 0} cartas ocultas
                    </div>
                  </div>
                </div>
              </div>
            ) : onlineState ? (
              <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
                <div className="min-w-0 space-y-5">
                  {onlineState.winner && (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center text-emerald-200">
                      {onlineState.winner === "player" ? "Você venceu!" : "Oponente venceu!"}
                    </div>
                  )}
                  <div className="glass rounded-xl p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-bold"><Bot size={16} className="text-rose-300" /> {activeOnlineDuel.opponent?.name}</div>
                      <div className="font-mono text-sm text-rose-300">{onlineOpponent.points} / {DUEL_RULES.POINTS_TO_WIN}</div>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-[1fr_20rem]">
                      <FieldCard card={onlineOpponent.active} title="Ativa" onCardClick={setDetailCard} />
                      <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                        <div className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Banco</div>
                        <div className="flex gap-2">{[0, 1, 2].map(index => <CardThumb key={index} card={onlineOpponent.bench?.[index]} compact onClick={onlineOpponent.bench?.[index] ? () => setDetailCard(onlineOpponent.bench[index]) : undefined} />)}</div>
                        <div className="mt-3 text-xs text-slate-500">Mão: {onlineOpponent.hand_count ?? 0} cartas ocultas</div>
                      </div>
                    </div>
                  </div>

                  <div className="glass rounded-xl p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-bold"><Sparkles size={16} className="text-indigo-300" /> Você</div>
                      <div className="flex items-center gap-3">
                        <div className="font-mono text-sm text-indigo-300">{onlinePlayer.points} / {DUEL_RULES.POINTS_TO_WIN}</div>
                        <span className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-2 py-1 text-xs text-yellow-200">Atual: {onlinePlayer.energy_zone?.current}</span>
                        <span className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-400">Próxima: {onlinePlayer.energy_zone?.next}</span>
                        <span className="text-xs text-slate-400">Anexos: {onlinePlayer.energy_remaining}</span>
                      </div>
                    </div>
                    <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
                      <FieldCard card={onlinePlayer.active} title="Ativa" onCardClick={setDetailCard}>
                        {onlineIsPlayerTurn && onlinePlayer.active && (
                          <div className="space-y-2">
                            <button onClick={() => onlineAction({ kind: "attach_energy", zone: "active", target_index: 0 })} disabled={onlinePlayer.energy_remaining <= 0} className="inline-flex items-center gap-1 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-2 py-1 text-[11px] text-yellow-200 disabled:opacity-40"><Zap size={12} /> Energia</button>
                            <div className="space-y-1">
                              {(onlinePlayer.active.abilities || []).map((ability, index) => (
                                <button key={index} onClick={() => onlineAction({ kind: "ability", ability_index: index, zone: "active", target_index: 0 })} disabled={(onlinePlayer.active.attached_energy || []).length < (ability.energy_cost || 0) || onlineState.turn_number <= 1} className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-left text-[11px] hover:border-indigo-500/60 disabled:opacity-40">
                                  <span className="truncate">{ability.name}</span>
                                  <span className="font-mono text-rose-300">{abilityDamage(ability)}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </FieldCard>
                      <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                        <div className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Banco</div>
                        <div className="flex gap-2">
                          {[0, 1, 2].map(index => (
                            <div key={index} className="space-y-1">
                              <CardThumb card={onlinePlayer.bench?.[index]} compact onClick={onlinePlayer.bench?.[index] ? () => setDetailCard(onlinePlayer.bench[index]) : undefined} />
                              {onlineIsPlayerTurn && onlinePlayer.bench?.[index] && (
                                <div className="grid gap-1">
                                  <button onClick={() => onlineAction({ kind: "attach_energy", zone: "bench", target_index: index })} disabled={onlinePlayer.energy_remaining <= 0} className="rounded bg-yellow-500/10 px-1 py-0.5 text-[10px] text-yellow-200 disabled:opacity-40">Energia</button>
                                  <button onClick={() => onlineAction({ kind: "retreat", bench_index: index })} className="rounded bg-indigo-500/15 px-1 py-0.5 text-[10px] text-indigo-200">Trocar</button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="mb-2 flex items-center justify-between"><div className="text-[10px] uppercase tracking-wider text-slate-500">Mão</div><div className="text-[10px] font-mono text-slate-500">{onlinePlayer.hand.length} cartas</div></div>
                      <div className="max-h-64 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/45 p-2">
                        <div className="flex min-w-max gap-2">
                          {onlinePlayer.hand.map((card, index) => (
                            <div key={`${card.id}-${index}`} className="w-28 shrink-0 space-y-2 rounded-lg border border-slate-800 bg-slate-950/50 p-2">
                              <CardThumb card={card} onClick={() => setDetailCard(card)} />
                              {onlineIsPlayerTurn && card.card_type === "Personagem" && !card.is_evolution && (
                                <button onClick={() => onlineAction({ kind: "play_to_bench", hand_index: index })} disabled={(onlinePlayer.bench?.length || 0) >= DUEL_RULES.BENCH_LIMIT} className="w-full rounded bg-indigo-500/15 px-2 py-1 text-[10px] text-indigo-200 disabled:opacity-40">Banco</button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end">
                      <button onClick={() => onlineAction({ kind: "end_turn" })} disabled={!onlineIsPlayerTurn} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm hover:bg-indigo-500 disabled:opacity-40">Encerrar turno <ChevronRight size={14} /></button>
                    </div>
                  </div>
                </div>
                <aside className="glass h-fit rounded-xl p-4">
                  <h3 className="mb-3 text-sm uppercase tracking-widest text-slate-400">Log</h3>
                  <div className="space-y-2 text-xs text-slate-400">
                    {(onlineState.log || []).map((entry, index) => <div key={index} className="rounded bg-slate-950/60 p-2">{entry}</div>)}
                  </div>
                </aside>
              </div>
            ) : (
              <div className="glass rounded-xl p-12 text-center text-slate-400">Aguardando estado do duelo.</div>
            )}
          </section>
        </div>
        {detailCard && <CommunityCardDetailModal card={detailCard} onClose={() => setDetailCard(null)} />}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1500px] mx-auto">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-sm uppercase tracking-[0.2em] text-indigo-400 mb-1 flex items-center gap-2">
            <Sword size={14} />
            Duelo
          </div>
          <h1 className="text-4xl font-bold" style={{ fontFamily: "Outfit" }}>Arena GeekCards</h1>
          <p className="mt-1 text-sm text-slate-400">
            Mão inicial {DUEL_RULES.INITIAL_HAND_SIZE}, banco {DUEL_RULES.BENCH_LIMIT}, Energy Zone automática e vitória com {DUEL_RULES.POINTS_TO_WIN} pontos.
          </p>
        </div>

        <div className="glass flex flex-wrap items-end gap-3 rounded-xl p-3">
          <div>
            <label className="mb-1 block text-xs text-slate-500">Seu deck</label>
            <select value={playerDeckId} onChange={event => setPlayerDeckId(event.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm">
              {decks.map(deck => <option key={deck.id} value={deck.id}>{deck.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Oponente</label>
            <select value={opponentDeckId} onChange={event => setOpponentDeckId(event.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm">
              {decks.map(deck => <option key={deck.id} value={deck.id}>{deck.name}</option>)}
            </select>
          </div>
          <button onClick={startDuel} disabled={starting || decks.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50">
            {starting ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            Iniciar
          </button>
        </div>
      </div>

      {!duel ? (
        <div className="glass rounded-xl p-12 text-center">
          <Shield className="mx-auto mb-3 text-slate-600" size={34} />
          <p className="text-slate-400">Escolha os decks e inicie um duelo local.</p>
        </div>
      ) : isSetup ? (
        <div className="glass rounded-xl p-5">
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold">Preparacao inicial</h2>
              <p className="mt-1 text-sm text-slate-400">
                Escolha uma carta basica ativa e, se quiser, ate 3 cartas basicas para o banco de cada lado.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDuel(current => current ? finishSetup(current) : current)}
              disabled={!player.active || !opponent.active}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-40"
            >
              <Play size={14} /> Comecar duelo
            </button>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <SetupPanel title="Voce" player={player} side="player" onAction={applySetup} onCardClick={setDetailCard} />
            <SetupPanel title="Oponente" player={opponent} side="opponent" onAction={applySetup} onCardClick={setDetailCard} />
          </div>
        </div>
      ) : (
        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-5">
            {duel.winner && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center text-emerald-200">
                {duel.winner === "player" ? "Voce venceu!" : "Oponente venceu!"}
              </div>
            )}

            <div className="glass rounded-xl p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <Bot size={16} className="text-rose-300" />
                  Oponente
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCemeterySide("opponent")}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-300 hover:border-rose-500/50"
                  >
                    <Archive size={12} /> Cemiterio {opponent.discard.length}
                  </button>
                  <div className="font-mono text-sm text-rose-300">{opponent.points} / {DUEL_RULES.POINTS_TO_WIN}</div>
                </div>
              </div>
              <div className="grid gap-3 lg:grid-cols-[1fr_20rem]">
                <FieldCard card={opponent.active} title="Ativa" onCardClick={setDetailCard}>
                  {pendingTargetAction && opponent.active && (
                    <button
                      type="button"
                      onClick={() => runCardAction(pendingTargetAction, { targetOverride: { side: "opponent", zone: "active", index: 0 } })}
                      className="rounded-md border border-rose-500/40 bg-rose-500/15 px-2 py-1 text-[11px] text-rose-100"
                    >
                      Alvo
                    </button>
                  )}
                </FieldCard>
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <div className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Banco</div>
                  <div className="flex gap-2">
                    {[0, 1, 2].map(index => (
                      <div key={index} className="space-y-1">
                        <CardThumb card={opponent.bench[index]} compact onClick={opponent.bench[index] ? () => setDetailCard(opponent.bench[index]) : undefined} />
                        {pendingTargetAction && opponent.bench[index] && (
                          <button
                            type="button"
                            onClick={() => runCardAction(pendingTargetAction, { targetOverride: { side: "opponent", zone: "bench", index } })}
                            className="w-full rounded bg-rose-500/15 px-1 py-0.5 text-[10px] text-rose-100"
                          >
                            Alvo
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="glass rounded-xl p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <Sparkles size={16} className="text-indigo-300" />
                  Voce
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setCemeterySide("player")}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-300 hover:border-indigo-500/50"
                  >
                    <Archive size={12} /> Cemiterio {player.discard.length}
                  </button>
                  <div className="font-mono text-sm text-indigo-300">{player.points} / {DUEL_RULES.POINTS_TO_WIN}</div>
                  <span className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-2 py-1 text-xs text-yellow-200">
                    Atual: {player.energy_zone?.current}
                  </span>
                  <span className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-400">
                    Próxima: {player.energy_zone?.next}
                  </span>
                  <span className="text-xs text-slate-400">
                    Anexos: {player.energy_remaining}
                  </span>
                </div>
              </div>

              <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <FieldCard card={player.active} title="Ativa" onCardClick={setDetailCard}>
                  {isPlayerTurn && player.active && (
                    <div className="space-y-2">
                      {canChooseEvolutionTarget("active", 0) && (
                        <button
                          type="button"
                          onClick={() => chooseEvolutionTarget("active", 0)}
                          className="rounded-md border border-cyan-500/40 bg-cyan-500/15 px-2 py-1 text-[11px] text-cyan-100"
                        >
                          Evoluir
                        </button>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => applyAndBot(state => attachEnergy(state, "player", "active", 0))}
                          disabled={player.energy_remaining <= 0}
                          className="inline-flex items-center gap-1 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-2 py-1 text-[11px] text-yellow-200 disabled:opacity-40">
                          <Zap size={12} /> Energia
                        </button>
                        <button
                          type="button"
                          onClick={() => setRetreatChoosing(true)}
                          disabled={!canPlayerRetreat}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-300 hover:border-indigo-500/60 disabled:opacity-40"
                        >
                          <RotateCcw size={12} /> Recuar
                        </button>
                      </div>
                      <div className="space-y-1">
                        {(player.active.abilities || []).map((ability, index) => (
                          <button key={index} onClick={() => handleAbilityClick(ability, index)}
                            disabled={!canPayAbility(player.active, ability) || !canAttackThisTurn(duel, "player", index)}
                            className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-left text-[11px] hover:border-indigo-500/60 disabled:opacity-40">
                            <span className="truncate">{ability.name}</span>
                            <span className="flex items-center gap-2 font-mono text-rose-300">
                              {abilityDamage(ability)}
                              <EnergyCostSymbols ability={ability} size="xs" />
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </FieldCard>

                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <div className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Banco</div>
                  <div className="flex gap-2">
                    {[0, 1, 2].map(index => (
                      <div key={index} className="space-y-1">
                        <CardThumb card={player.bench[index]} compact onClick={player.bench[index] ? () => setDetailCard(player.bench[index]) : undefined} />
                        {isPlayerTurn && player.bench[index] && (
                          <div className="grid gap-1">
                            <button onClick={() => applyAndBot(state => attachEnergy(state, "player", "bench", index))}
                              disabled={player.energy_remaining <= 0}
                              className="rounded bg-yellow-500/10 px-1 py-0.5 text-[10px] text-yellow-200 disabled:opacity-40">
                              Energia
                            </button>
                            {canChooseEvolutionTarget("bench", index) && (
                              <button
                                type="button"
                                onClick={() => chooseEvolutionTarget("bench", index)}
                                className="rounded bg-cyan-500/15 px-1 py-0.5 text-[10px] text-cyan-100"
                              >
                                Evoluir
                              </button>
                            )}
                            {retreatChoosing && (
                              <button
                                type="button"
                                onClick={() => {
                                  applyAndBot(state => retreat(state, "player", index));
                                  setRetreatChoosing(false);
                                }}
                                className="rounded bg-indigo-500/15 px-1 py-0.5 text-[10px] text-indigo-200"
                              >
                                Trocar
                              </button>
                            )}
                            {pendingEnergyMoveAction && (player.bench[index].attached_energy || []).length > 0 && (
                              <button
                                type="button"
                                onClick={() => runCardAction(pendingEnergyMoveAction, { energySourceOverride: index })}
                                className="rounded bg-cyan-500/15 px-1 py-0.5 text-[10px] text-cyan-100"
                              >
                                Fonte
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 min-w-0">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Mao</div>
                  <div className="text-[10px] font-mono text-slate-500">{playableHand.length} cartas</div>
                </div>
                <div className="max-h-64 max-w-full overflow-x-auto overflow-y-hidden rounded-lg border border-slate-800 bg-slate-950/45 p-2">
                  <div className="flex min-w-max gap-2 pb-1">
                    {playableHand.map(({ card, index }) => (
                      <div key={`${card.id}-${index}`} className="w-28 shrink-0 space-y-2 rounded-lg border border-slate-800 bg-slate-950/50 p-2">
                        <CardThumb card={card} onClick={() => setDetailCard(card)} />
                        {isPlayerTurn && (
                          <div className="grid gap-1">
                            {card.card_type === "Personagem" && !card.is_evolution && (
                              <button onClick={() => applyAndBot(state => playToBench(state, "player", index))}
                                disabled={player.bench.length >= DUEL_RULES.BENCH_LIMIT}
                                className="rounded bg-indigo-500/15 px-2 py-1 text-[10px] text-indigo-200 disabled:opacity-40">
                                Banco
                              </button>
                            )}
                            {card.is_evolution && getEvolutionTargets(index).length > 0 && (
                              <button onClick={() => handleEvolutionClick(index)}
                                className="rounded bg-cyan-500/15 px-2 py-1 text-[10px] text-cyan-200">
                                {pendingEvolutionHandIndex === index ? "Escolha" : "Evolucao"}
                              </button>
                          )}
                          {card.card_type !== "Personagem" && card.card_type !== "Energia" && (
                            <button onClick={() => handleHandActionClick(card, index)}
                              disabled={card.card_type === "Equipamento" && (!player.active || (player.active.equipments || []).length > 0)}
                              className="rounded bg-fuchsia-500/15 px-2 py-1 text-[10px] text-fuchsia-200 disabled:opacity-40">
                              {card.card_type === "Equipamento" ? "Equipar" : "Usar"}
                            </button>
                          )}
                          {card.card_type === "Energia" && (
                            <div className="rounded bg-slate-800 px-2 py-1 text-center text-[10px] text-slate-400">
                              Energia fora do deck
                            </div>
                          )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => setDuel(null)}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">
                  <RotateCcw size={14} /> Encerrar
                </button>
                <button onClick={() => applyAndBot(endTurn)} disabled={!isPlayerTurn}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm hover:bg-indigo-500 disabled:opacity-40">
                  Encerrar turno <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>

          <aside className="glass h-fit rounded-xl p-4">
            <h3 className="mb-3 text-sm uppercase tracking-widest text-slate-400">Log</h3>
            <div className="space-y-2 text-xs text-slate-400">
              {duel.log.map((entry, index) => (
                <div key={index} className="rounded bg-slate-950/60 p-2">{entry}</div>
              ))}
            </div>
          </aside>
        </div>
      )}
      {cemeterySide && duel && (
        <CemeteryModal
          title={cemeterySide === "player" ? "Seu cemiterio" : "Cemiterio do oponente"}
          cards={duel.players[cemeterySide].discard}
          onClose={() => setCemeterySide(null)}
          onCardClick={setDetailCard}
        />
      )}
      {detailCard && (
        <CommunityCardDetailModal card={detailCard} onClose={() => setDetailCard(null)} />
      )}
    </div>
  );
}
