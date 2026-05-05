import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { api, formatApiError, imageUrl } from "../lib/api";
import { NATURE_COLORS } from "../lib/natures";
import { EnergyCostSymbols } from "../components/EnergyCostSymbols";
import { ENERGY_SYMBOLS } from "../lib/energyCosts";
import { CommunityCardDetailModal } from "../components/CommunityCardDetailModal";
import { EFFECT_TYPES, normalizeEffects } from "../lib/cardEffects";
import {
  DUEL_RULES,
  TURN_MOMENTS,
  activateAbility,
  attachEnergy,
  canAttackThisTurn,
  canPayAbility,
  createDuel,
  drawTurnCard,
  endTurn,
  evolveFromHand,
  findEvolutionTargets,
  finishSetup,
  playActionCard,
  playToBench,
  promoteFromBench,
  retreat,
  runBotTurn,
  setupActive,
  setupBenchToHand,
  setupToBench,
} from "../lib/duelEngine";
import { Archive, BookOpen, Bot, ChevronRight, Loader2, Play, RotateCcw, Shield, Sparkles, Sword, X } from "lucide-react";
import { toast } from "sonner";

const ENERGY_SYMBOL_CLASSES = {
  Superior: "border-yellow-300/40 bg-yellow-300/15 text-yellow-200",
  Natural: "border-emerald-300/40 bg-emerald-300/15 text-emerald-200",
  Interior: "border-sky-300/40 bg-sky-300/15 text-sky-200",
  Universal: "border-slate-300/40 bg-slate-300/15 text-slate-100",
};

const TURN_MOMENT_LABELS = {
  [TURN_MOMENTS.SETUP]: "Preparacao",
  [TURN_MOMENTS.TURN_START]: "Inicio do turno",
  [TURN_MOMENTS.DRAW]: "Saque",
  [TURN_MOMENTS.ACTION]: "Fase de acao",
  [TURN_MOMENTS.ATTACK]: "Ataque",
  [TURN_MOMENTS.TURN_END]: "Fim do turno",
};

const cardId = (card, index) => `${card?.instance_id || card?.id || card?.name || "card"}-${index}`;

const AttachedEnergySymbols = ({ energies = [], compact = false, vertical = false }) => {
  const attached = (energies || []).filter(Boolean);
  if (attached.length === 0) return null;

  return (
    <div className={`flex ${vertical ? "flex-col" : "flex-wrap"} items-center justify-center gap-1`}>
      {attached.map((energy, index) => (
        <span
          key={`${energy}-${index}`}
          title={energy}
          className={`inline-flex items-center justify-center rounded-full border ${compact ? "h-4 w-4 text-[9px]" : "h-5 w-5 text-[10px]"} ${ENERGY_SYMBOL_CLASSES[energy] || ENERGY_SYMBOL_CLASSES.Universal}`}
        >
          {ENERGY_SYMBOLS[energy] || ENERGY_SYMBOLS.Universal || energy?.[0]}
        </span>
      ))}
    </div>
  );
};

const CardThumb = ({ card, compact = false, hand = false, onClick }) => {
  const width = hand ? "w-32" : compact ? "w-24" : "w-28";
  if (!card) {
    return <div className={`aspect-[2.5/3.5] rounded-xl border border-dashed border-slate-700 bg-slate-950/60 ${width}`} />;
  }

  const color = card.natures?.[0] ? NATURE_COLORS[card.natures[0]] : "#334155";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`relative aspect-[2.5/3.5] overflow-hidden rounded-xl border bg-slate-950 shadow-lg shadow-black/30 ${width}`}
      style={{ borderColor: `${color}aa` }}
    >
      {card.image_url ? (
        <img src={imageUrl(card.image_url)} alt={card.name} className="h-full w-full object-contain" loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-3xl font-bold opacity-20">
          {card.name?.[0] || "?"}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/75 to-transparent p-2">
        <div className="truncate text-[10px] font-black uppercase text-white">{card.name}</div>
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

const FieldCard = ({ card, title, tone = "player", children, onCardClick, onDrop }) => (
  <div
    className={`rounded-xl border p-3 ${tone === "opponent" ? "border-rose-500/30 bg-rose-950/10" : "border-indigo-500/30 bg-indigo-950/10"}`}
    onDragOver={onDrop ? event => event.preventDefault() : undefined}
    onDrop={onDrop}
  >
    <div className={`mb-2 text-[10px] uppercase tracking-wider ${tone === "opponent" ? "text-rose-200/60" : "text-indigo-200/60"}`}>{title}</div>
    <div className="flex min-w-0 items-start justify-center gap-3">
      <CardThumb card={card} onClick={card ? () => onCardClick?.(card) : undefined} />
      <div className="min-w-6 pt-1">
        <AttachedEnergySymbols energies={card?.attached_energy} compact vertical />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        {card ? children : <div className="text-xs text-slate-500">Sem carta ativa</div>}
      </div>
    </div>
  </div>
);

const BenchZone = ({ cards = [], tone = "player", onCardClick, onDropSlot, childrenForCard }) => (
  <div className={`rounded-xl border p-3 ${tone === "opponent" ? "border-rose-400/25 bg-slate-950/35" : "border-indigo-400/25 bg-slate-950/35"}`}>
    <div className={`mb-2 text-[10px] uppercase tracking-wider ${tone === "opponent" ? "text-rose-200/60" : "text-indigo-200/60"}`}>Banco</div>
    <div className="grid grid-cols-3 gap-2">
      {[0, 1, 2].map(index => {
        const card = cards[index];
        return (
          <div key={index} className="space-y-1">
            <div
              className={`flex min-h-[170px] items-center justify-center gap-1 rounded-xl border border-dashed bg-slate-950/30 p-1.5 ${tone === "opponent" ? "border-rose-400/25" : "border-indigo-400/25"}`}
              onDragOver={onDropSlot ? event => event.preventDefault() : undefined}
              onDrop={onDropSlot ? event => onDropSlot(event, index) : undefined}
            >
              <CardThumb card={card} compact onClick={card ? () => onCardClick?.(card) : undefined} />
              <AttachedEnergySymbols energies={card?.attached_energy} compact vertical />
            </div>
            {card && childrenForCard?.(card, index)}
          </div>
        );
      })}
    </div>
  </div>
);

const DeckPile = ({ count = 0, canDraw = false, onDraw }) => (
  <button
    type="button"
    onClick={onDraw}
    disabled={!canDraw}
    className={`flex h-full min-h-44 w-full shrink-0 flex-col items-center justify-center gap-2 rounded-xl border border-indigo-400/25 bg-indigo-950/15 p-3 text-center shadow-lg shadow-indigo-500/10 ${canDraw ? "hover:border-yellow-300/60 hover:bg-yellow-500/10" : "disabled:opacity-75"}`}
  >
    <BookOpen size={24} className={canDraw ? "text-yellow-200" : "text-indigo-200/60"} />
    <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-200/60">DECK</div>
    <div className="font-mono text-lg font-bold text-slate-100">{count}</div>
  </button>
);

const EnergyBubble = ({ energy }) => (
  <span
    title={energy}
    className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-[11px] ${ENERGY_SYMBOL_CLASSES[energy] || ENERGY_SYMBOL_CLASSES.Universal}`}
  >
    {ENERGY_SYMBOLS[energy] || ENERGY_SYMBOLS.Universal || energy?.[0]}
  </span>
);

const EnergyZone = ({ current, next, remaining, canDrag, onDragStart }) => (
  <div className="flex h-28 w-20 shrink-0 flex-col justify-center gap-2 rounded-lg border border-yellow-300/25 bg-yellow-500/10 p-2 text-center shadow-lg shadow-yellow-500/10">
    <div className="flex items-center justify-between gap-1">
      <span className="text-[8px] uppercase tracking-wider text-yellow-100/70">Atual</span>
      <span
        draggable={canDrag}
        onDragStart={onDragStart}
        className={canDrag ? "cursor-grab" : ""}
      >
        <EnergyBubble energy={current} />
      </span>
    </div>
    <div className="flex items-center justify-between gap-1">
      <span className="text-[8px] uppercase tracking-wider text-slate-400">Prox.</span>
      <EnergyBubble energy={next} />
    </div>
    <div className="flex items-center justify-between rounded border border-indigo-400/20 bg-indigo-500/10 px-1.5 py-1">
      <span className="text-[8px] uppercase tracking-wider text-indigo-200/70">Anexos</span>
      <span className="font-mono text-xs font-bold text-indigo-100">{remaining}</span>
    </div>
  </div>
);

const HudScoreBox = ({ tone = "player", points = 0, discardCount = 0, onOpenDiscard }) => (
  <div className={`flex min-h-20 items-center gap-2 rounded-lg border p-2 ${tone === "opponent" ? "border-rose-400/25 bg-rose-950/15" : "border-indigo-400/25 bg-indigo-950/15"}`}>
    <button
      type="button"
      onClick={onOpenDiscard}
      className="flex flex-1 items-center justify-center gap-1 rounded-md border border-slate-700 bg-slate-950/55 px-2 py-2 text-[10px] text-slate-300 hover:border-indigo-400/50 hover:text-slate-100"
    >
      <Archive size={13} />
      <span>Cemiterio</span>
      <span className="font-mono text-slate-100">{discardCount}</span>
    </button>
    <div className="min-w-16 text-center">
      <div className={`text-[9px] font-bold uppercase tracking-wider ${tone === "opponent" ? "text-rose-200/60" : "text-indigo-200/60"}`}>Pontos</div>
      <div className={`font-mono text-base font-black ${tone === "opponent" ? "text-rose-100" : "text-indigo-100"}`}>{points}/{DUEL_RULES.POINTS_TO_WIN}</div>
    </div>
  </div>
);

const DuelMomentPanel = ({ state, player, opponent, canEndTurn, onEndTurn, onOpenDiscard }) => {
  const flow = [TURN_MOMENTS.TURN_START, TURN_MOMENTS.DRAW, TURN_MOMENTS.ACTION, TURN_MOMENTS.ATTACK, TURN_MOMENTS.TURN_END];
  const events = new Set(state.turn_events || []);
  const moment = state.winner ? "WINNER" : state.turn_moment || TURN_MOMENTS.ACTION;
  const turnPlayer = state.players?.[state.turn];
  const label = state.winner ? "Fim do jogo" : TURN_MOMENT_LABELS[moment] || TURN_MOMENT_LABELS[TURN_MOMENTS.ACTION];
  const stepState = step => {
    if (moment === step) return "active";
    if (step === TURN_MOMENTS.DRAW && turnPlayer?.drew_this_turn) return "done";
    if (events.has(step)) return "done";
    if (step === TURN_MOMENTS.ACTION && moment === TURN_MOMENTS.ATTACK) return "done";
    return "pending";
  };

  return (
    <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-2 lg:grid-cols-[13rem_minmax(26rem,1fr)_13rem]">
      <HudScoreBox tone="opponent" points={opponent.points} discardCount={opponent.discard.length} onOpenDiscard={() => onOpenDiscard?.("opponent")} />
      <div className="rounded-lg border border-slate-700/80 bg-slate-950/80 px-3 py-2 shadow-lg shadow-black/20">
        <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Momento do jogo</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${state.turn === "player" ? "bg-indigo-400" : "bg-rose-400"}`} />
          <h3 className="text-sm font-bold text-slate-100">{label}</h3>
          <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs text-slate-400">Turno {state.turn_number || 1}</span>
          <span className={`rounded px-2 py-0.5 text-xs ${state.turn === "player" ? "bg-indigo-500/15 text-indigo-200" : "bg-rose-500/15 text-rose-200"}`}>{state.turn === "player" ? "Sua vez" : "Oponente"}</span>
        </div>
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
          {flow.map(step => {
            const status = stepState(step);
            const classes = status === "active"
              ? "border-indigo-400/50 bg-indigo-500/15 text-indigo-100"
              : status === "done"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : "border-slate-800 bg-slate-900/70 text-slate-500";
            return <span key={step} className={`rounded border px-2 py-1 text-[10px] font-medium ${classes}`}>{TURN_MOMENT_LABELS[step]}</span>;
          })}
          <button
            type="button"
            onClick={onEndTurn}
            disabled={!canEndTurn}
            className="ml-auto inline-flex items-center gap-1 rounded border border-indigo-400/40 bg-indigo-600 px-2 py-1 text-[10px] font-bold text-white shadow shadow-indigo-600/20 hover:bg-indigo-500 disabled:opacity-40"
          >
            Finalizar turno <ChevronRight size={12} />
          </button>
        </div>
      </div>
      <HudScoreBox tone="player" points={player.points} discardCount={player.discard.length} onOpenDiscard={() => onOpenDiscard?.("player")} />
    </div>
  );
};

const CemeteryModal = ({ title, cards = [], onClose, onCardClick }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
    <div className="max-h-[84vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl shadow-black/60">
      <div className="flex items-center justify-between border-b border-slate-800 p-4">
        <div className="flex items-center gap-2">
          <Archive size={16} className="text-indigo-300" />
          <div>
            <h3 className="text-sm font-black text-slate-100">{title}</h3>
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
      <div className="max-h-[68vh] overflow-y-auto p-4">
        {cards.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/50 p-10 text-center text-sm text-slate-500">
            Cemiterio vazio
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {cards.map((card, index) => (
              <div key={cardId(card, index)} className="flex justify-center">
                <CardThumb card={card} compact onClick={() => onCardClick?.(card)} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
);

const SetupPanel = ({ title, player, side, onAction, onCardClick, disabled = false }) => (
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
                  onClick={() => onAction({
                    kind: "setup_bench_to_hand",
                    side,
                    benchIndex: index,
                    localAction: state => setupBenchToHand(state, side, index),
                  })}
                  disabled={disabled}
                  className="w-full rounded bg-slate-800 px-1 py-0.5 text-[10px] text-slate-300 disabled:opacity-40"
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
      <div className="min-h-[310px] overflow-x-auto overflow-y-visible rounded-lg border border-slate-800 bg-slate-950/40 p-3">
        <div className="flex min-w-max items-start gap-3 pb-3">
          {player.hand.map((card, index) => {
            const isBasic = card.card_type === "Personagem" && !card.is_evolution;
            return (
              <div key={cardId(card, index)} className="w-28 shrink-0 space-y-2 rounded-lg border border-slate-800 bg-slate-950/50 p-2 pb-3">
                <CardThumb card={card} onClick={() => onCardClick?.(card)} />
                <div className="grid gap-1">
                  <button
                    type="button"
                    onClick={() => onAction({
                      kind: "setup_active",
                      side,
                      handIndex: index,
                      localAction: state => setupActive(state, side, index),
                    })}
                    disabled={disabled || !isBasic}
                    className="min-h-7 rounded bg-emerald-500/15 px-2 py-1 text-[10px] text-emerald-200 disabled:opacity-35"
                  >
                    Ativa
                  </button>
                  <button
                    type="button"
                    onClick={() => onAction({
                      kind: "setup_to_bench",
                      side,
                      handIndex: index,
                      localAction: state => setupToBench(state, side, index),
                    })}
                    disabled={disabled || !isBasic || player.bench.length >= DUEL_RULES.BENCH_LIMIT}
                    className="min-h-7 rounded bg-indigo-500/15 px-2 py-1 text-[10px] text-indigo-200 disabled:opacity-35"
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

const dragData = event => {
  try {
    return JSON.parse(event.dataTransfer.getData("application/json") || "{}");
  } catch {
    return {};
  }
};

const setDragData = (event, payload) => {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("application/json", JSON.stringify(payload));
};

export default function DuelPage() {
  const location = useLocation();
  const [decks, setDecks] = useState([]);
  const [playerDeckId, setPlayerDeckId] = useState("");
  const [opponentDeckId, setOpponentDeckId] = useState("");
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [duel, setDuel] = useState(null);
  const [duelEntryMode, setDuelEntryMode] = useState("");
  const [duelMode, setDuelMode] = useState("local");
  const [onlinePlayers, setOnlinePlayers] = useState([]);
  const [onlineDuels, setOnlineDuels] = useState([]);
  const [onlineDuel, setOnlineDuel] = useState(null);
  const [requestedOnlineDuelId, setRequestedOnlineDuelId] = useState("");
  const [onlineOpponentId, setOnlineOpponentId] = useState("");
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [retreatChoosing, setRetreatChoosing] = useState(false);
  const [detailCard, setDetailCard] = useState(null);
  const [cemeterySide, setCemeterySide] = useState(null);
  const onlineDuelId = onlineDuel?.id;

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const duelId = params.get("online");
    if (duelId !== null) {
      setDuelEntryMode("online");
      setDuelMode("online");
      setRequestedOnlineDuelId(duelId);
    }
  }, [location.search]);

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

  const refreshOnlineDuelData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setOnlineLoading(true);
    try {
      const [playersRes, duelsRes] = await Promise.all([
        api.get("/duels/online/players"),
        api.get("/duels/online"),
      ]);
      setOnlinePlayers(playersRes.data || []);
      setOnlineDuels(duelsRes.data || []);
      setOnlineOpponentId(current => current || playersRes.data?.find(player => !player.in_duel)?.id || "");

      const currentOnlineId = onlineDuelId || requestedOnlineDuelId;
      const activeOnlineDuel = currentOnlineId
        ? duelsRes.data?.find(item => item.id === currentOnlineId)
        : duelsRes.data?.find(item => item.state);

      if (activeOnlineDuel) {
        setOnlineDuel(activeOnlineDuel);
        setDuelMode("online");
        setDuelEntryMode("online");
        if (activeOnlineDuel.state) setDuel(activeOnlineDuel.state);
      }
    } catch (e) {
      if (!silent) toast.error(formatApiError(e));
    } finally {
      if (!silent) setOnlineLoading(false);
    }
  }, [onlineDuelId, requestedOnlineDuelId]);

  useEffect(() => {
    refreshOnlineDuelData({ silent: true });
    const interval = window.setInterval(() => refreshOnlineDuelData({ silent: true }), onlineDuelId ? 2500 : 6000);
    return () => window.clearInterval(interval);
  }, [onlineDuelId, refreshOnlineDuelData]);

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

      setDuel(createDuel(
        playerCards,
        chosenOpponentCards,
        playerRes.data.deck.energy_types,
        opponentRes.data.deck.energy_types
      ));
      setDuelMode("local");
      setDuelEntryMode("bot");
      setOnlineDuel(null);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setStarting(false);
    }
  };

  const setOnlineDuelView = data => {
    setOnlineDuel(data);
    setDuelMode("online");
    setDuelEntryMode("online");
    if (data?.state) setDuel(data.state);
    refreshOnlineDuelData({ silent: true });
  };

  const inviteOnlineDuel = async (opponentId = onlineOpponentId) => {
    if (!opponentId) {
      toast.error("Escolha um jogador online");
      return;
    }
    setOnlineLoading(true);
    try {
      const { data } = await api.post("/duels/online/invite", { opponent_id: opponentId });
      setOnlineDuelView(data);
      toast.success("Convite enviado");
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setOnlineLoading(false);
    }
  };

  const acceptOnlineDuel = async duelId => {
    setOnlineLoading(true);
    try {
      const { data } = await api.post(`/duels/online/${duelId}/accept`);
      setOnlineDuelView(data);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setOnlineLoading(false);
    }
  };

  const declineOnlineDuel = async duelId => {
    setOnlineLoading(true);
    try {
      await api.post(`/duels/online/${duelId}/decline`);
      if (onlineDuel?.id === duelId) {
        setOnlineDuel(null);
        setDuel(null);
      }
      refreshOnlineDuelData();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setOnlineLoading(false);
    }
  };

  const chooseOnlineDeck = async duelId => {
    if (!playerDeckId) {
      toast.error("Escolha um deck");
      return;
    }
    setOnlineLoading(true);
    try {
      const { data } = await api.post(`/duels/online/${duelId}/deck`, { deck_id: playerDeckId });
      setOnlineDuelView(data);
      toast.success(data.state ? "Deck confirmado" : "Deck escolhido. Aguardando oponente.");
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setOnlineLoading(false);
    }
  };

  const confirmOnlineSetup = async () => {
    if (!onlineDuel?.id) return;
    setOnlineLoading(true);
    try {
      const { data } = await api.post(`/duels/online/${onlineDuel.id}/setup-ready`, { ready: true });
      setOnlineDuelView(data);
      toast.success(data.status === "battle" ? "Duelo iniciado" : "Preparacao confirmada. Aguardando oponente.");
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setOnlineLoading(false);
    }
  };

  const sendOnlineAction = async body => {
    if (!onlineDuel?.id) return;
    setOnlineLoading(true);
    try {
      const { data } = await api.post(`/duels/online/${onlineDuel.id}/action`, body);
      setOnlineDuelView(data);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setOnlineLoading(false);
    }
  };

  const player = duel?.players.player;
  const opponent = duel?.players.opponent;
  const isSetup = duel?.phase === "setup";
  const isOnlineDuel = duelMode === "online" && Boolean(onlineDuel);
  const playerDeckCount = player?.deck?.length ?? player?.deck_count ?? 0;
  const isPlayerTurn = duel?.turn === "player" && !duel?.winner;
  const canPlayerDraw = Boolean(isPlayerTurn && !player?.drew_this_turn && playerDeckCount > 0);
  const canPlayerAct = Boolean(isPlayerTurn && (player?.drew_this_turn || playerDeckCount === 0));
  const activeRetreatCost = Math.max(0, parseInt(player?.active?.recuo, 10) || 0);
  const canPlayerRetreat = Boolean(
    canPlayerAct &&
    player?.active &&
    player?.bench?.length > 0 &&
    (player.active.attached_energy || []).length >= activeRetreatCost
  );

  const applyAndBot = action => {
    setDuel(current => {
      if (!current) return current;
      const next = action(current);
      return next.turn === "opponent" && !next.winner ? runBotTurn(next) : next;
    });
  };

  const applyDuelAction = (localAction, onlineAction) => {
    if (isOnlineDuel) {
      sendOnlineAction(onlineAction);
      return;
    }
    applyAndBot(localAction);
  };

  const applySetup = action => {
    if (isOnlineDuel) {
      if (action.side !== "player") return;
      if (player?.setup_ready) {
        toast.info("Sua preparacao ja foi confirmada.");
        return;
      }
      sendOnlineAction({
        kind: action.kind,
        hand_index: action.handIndex,
        bench_index: action.benchIndex,
      });
      return;
    }
    setDuel(current => current ? action.localAction(current) : current);
  };

  const playableHand = useMemo(() => {
    if (!player) return [];
    return player.hand.map((card, index) => ({ card, index }));
  }, [player]);

  useEffect(() => {
    if (!canPlayerRetreat) setRetreatChoosing(false);
  }, [canPlayerRetreat]);

  const handleDrop = (event, zone, targetIndex = 0) => {
    event.preventDefault();
    const payload = dragData(event);
    if (!payload.source || !canPlayerAct) return;

    if (payload.source === "energy") {
      applyDuelAction(
        state => attachEnergy(state, "player", zone, targetIndex),
        { kind: "attach_energy", zone, target_index: targetIndex }
      );
      return;
    }

    if (payload.source !== "hand") return;
    const handIndex = payload.index;
    const card = player.hand[handIndex];
    if (!card) return;

    if (zone === "bench" && card.card_type === "Personagem" && !card.is_evolution) {
      applyDuelAction(
        state => playToBench(state, "player", handIndex),
        { kind: "play_to_bench", hand_index: handIndex }
      );
      return;
    }

    if (card.is_evolution) {
      const canEvolveHere = findEvolutionTargets(duel, "player", handIndex)
        .some(target => target.zone === zone && target.index === targetIndex);
      if (canEvolveHere) {
        applyDuelAction(
          state => evolveFromHand(state, "player", handIndex, zone, targetIndex),
          { kind: "evolve", hand_index: handIndex, zone, target_index: targetIndex }
        );
      }
      return;
    }

    if (zone === "active" && card.card_type !== "Personagem" && card.card_type !== "Energia") {
      applyDuelAction(
        state => playActionCard(state, "player", handIndex),
        { kind: "play_action", hand_index: handIndex, zone, target_index: targetIndex }
      );
    }
  };

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-indigo-400" /></div>;
  }

  return (
    <div className="p-6 max-w-[1680px] mx-auto">
      <div className={`${duel ? "hidden" : "mb-6 space-y-4"}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-sm uppercase tracking-[0.2em] text-indigo-400">
              <Sword size={14} />
              Duelo
            </div>
            <h1 className="text-4xl font-bold" style={{ fontFamily: "Outfit" }}>Arena GeekCards</h1>
          </div>
          {duelEntryMode && (
            <button
              type="button"
              onClick={() => {
                setDuelEntryMode("");
                setOnlineDuel(null);
                setDuel(null);
              }}
              className="self-start rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300 hover:border-indigo-400/50 lg:self-auto"
            >
              Trocar modo
            </button>
          )}
        </div>

        {!duelEntryMode && (
          <div className="grid gap-4 lg:grid-cols-2">
            <button
              type="button"
              onClick={() => setDuelEntryMode("bot")}
              className="glass group rounded-2xl border border-indigo-400/25 p-6 text-left transition hover:border-indigo-300/60 hover:bg-indigo-500/10"
            >
              <div className="mb-3 inline-flex rounded-xl border border-indigo-400/25 bg-indigo-500/10 p-3 text-indigo-200">
                <Bot size={24} />
              </div>
              <h2 className="text-2xl font-black text-slate-100">Duelo contra bot</h2>
              <p className="mt-2 text-sm text-slate-400">Escolha seu deck, escolha o deck do bot e jogue imediatamente.</p>
            </button>

            <button
              type="button"
              onClick={() => {
                setDuelEntryMode("online");
                refreshOnlineDuelData();
              }}
              className="glass group rounded-2xl border border-cyan-400/25 p-6 text-left transition hover:border-cyan-300/60 hover:bg-cyan-500/10"
            >
              <div className="mb-3 inline-flex rounded-xl border border-cyan-400/25 bg-cyan-500/10 p-3 text-cyan-200">
                <Sparkles size={24} />
              </div>
              <h2 className="text-2xl font-black text-slate-100">Duelo online</h2>
              <p className="mt-2 text-sm text-slate-400">Veja jogadores online, envie convite e jogue com preparação simultânea.</p>
            </button>
          </div>
        )}

        {duelEntryMode === "bot" && (
          <div className="glass flex flex-wrap items-end gap-3 rounded-xl p-4">
            <div>
              <label className="mb-1 block text-xs text-slate-500">Seu deck</label>
              <select value={playerDeckId} onChange={event => setPlayerDeckId(event.target.value)}
                className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm">
                {decks.map(deck => <option key={deck.id} value={deck.id}>{deck.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Deck do bot</label>
              <select value={opponentDeckId} onChange={event => setOpponentDeckId(event.target.value)}
                className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm">
                {decks.map(deck => <option key={deck.id} value={deck.id}>{deck.name}</option>)}
              </select>
            </div>
            <button onClick={startDuel} disabled={starting || decks.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50">
              {starting ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              Iniciar contra bot
            </button>
          </div>
        )}

        {duelEntryMode === "online" && (
          <div className="glass rounded-xl p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-slate-100">Jogadores online</h2>
                <p className="text-sm text-slate-400">Convide jogadores disponiveis ou continue um convite em andamento.</p>
              </div>
              <button
                type="button"
                onClick={() => refreshOnlineDuelData()}
                disabled={onlineLoading}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300 hover:border-indigo-400/50 disabled:opacity-50"
              >
                {onlineLoading && <Loader2 size={14} className="animate-spin" />}
                Atualizar
              </button>
            </div>

            {onlineDuels.length > 0 && (
              <div className="mb-4 space-y-2 rounded-xl border border-indigo-400/20 bg-indigo-950/10 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-200/60">Seus convites e duelos</div>
                {onlineDuels.map(item => {
                  const needsDeck = item.status === "deck_selection" && !item.me?.deck_id;
                  const waitingOpponentDeck = item.status === "deck_selection" && item.me?.deck_id;
                  const statusText = item.status === "invited"
                    ? "Convite pendente"
                    : item.status === "deck_selection"
                      ? waitingOpponentDeck ? "Voce preparou o deck. Aguardando oponente." : "Escolha seu deck"
                      : item.status === "setup"
                        ? "Preparacao das cartas iniciais"
                        : "Em duelo";
                  return (
                    <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/55 px-3 py-2 text-xs">
                      <div>
                        <div className="font-bold text-slate-100">{item.opponent?.name || "Oponente"}</div>
                        <div className="text-slate-500">{statusText}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {item.status === "invited" && item.invitee_id === item.me?.user_id && (
                          <button type="button" onClick={() => acceptOnlineDuel(item.id)} className="rounded bg-emerald-500/15 px-2 py-1 text-emerald-100">Aceitar</button>
                        )}
                        {needsDeck && (
                          <>
                            <select value={playerDeckId} onChange={event => setPlayerDeckId(event.target.value)} className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-slate-200">
                              {decks.map(deck => <option key={deck.id} value={deck.id}>{deck.name}</option>)}
                            </select>
                            <button type="button" onClick={() => chooseOnlineDeck(item.id)} className="rounded bg-indigo-500/20 px-2 py-1 text-indigo-100">Preparado</button>
                          </>
                        )}
                        {item.state && (
                          <button type="button" onClick={() => setOnlineDuelView(item)} className="rounded bg-cyan-500/15 px-2 py-1 text-cyan-100">Abrir</button>
                        )}
                        {["invited", "deck_selection", "setup"].includes(item.status) && (
                          <button type="button" onClick={() => declineOnlineDuel(item.id)} className="rounded bg-rose-500/15 px-2 py-1 text-rose-100">Cancelar duelo</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="grid gap-2">
              {onlinePlayers.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/40 p-6 text-center text-sm text-slate-500">
                  Nenhum jogador online disponivel agora.
                </div>
              ) : onlinePlayers.map(onlinePlayer => {
                const relatedDuel = onlineDuels.find(item => item.opponent?.user_id === onlinePlayer.id);
                const busy = onlinePlayer.in_duel && !relatedDuel;
                return (
                  <div key={onlinePlayer.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/55 px-3 py-2">
                    <div>
                      <div className="text-sm font-bold text-slate-100">{onlinePlayer.name || onlinePlayer.email}</div>
                      <div className={`text-xs ${busy ? "text-rose-300" : relatedDuel ? "text-indigo-300" : "text-emerald-300"}`}>
                        {busy ? "Em duelo" : relatedDuel ? "Convite ou duelo em andamento" : "Online"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => inviteOnlineDuel(onlinePlayer.id)}
                      disabled={onlineLoading || busy || Boolean(relatedDuel)}
                      className="rounded-lg border border-cyan-400/35 bg-cyan-500/15 px-3 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-500/25 disabled:opacity-40"
                    >
                      Convidar
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {!duel ? (
        <div className="glass rounded-xl p-12 text-center">
          <Shield className="mx-auto mb-3 text-slate-600" size={34} />
          <p className="text-slate-400">
            {!duelEntryMode
              ? "Escolha duelo contra bot ou duelo online."
              : duelEntryMode === "bot"
                ? "Escolha os decks para iniciar contra o bot."
                : "Convide um jogador online ou continue um duelo pendente."}
          </p>
          {onlineDuel && !onlineDuel.state && (
            <div className="mt-4 rounded-lg border border-indigo-400/25 bg-indigo-500/10 p-3 text-sm text-indigo-100">
              Duelo online com {onlineDuel.opponent?.name || "oponente"}: {onlineDuel.status === "invited" ? "aguardando aceite" : "aguardando escolha de decks"}.
            </div>
          )}
        </div>
      ) : isSetup ? (
        <div className="glass rounded-xl p-5">
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold">Preparacao inicial</h2>
              <p className="mt-1 text-sm text-slate-400">
                {isOnlineDuel
                  ? "Escolha sua ativa e ate 3 cartas para o banco. As escolhas do oponente ficam ocultas ate os dois confirmarem."
                  : "Escolha uma carta basica ativa e, se quiser, ate 3 cartas basicas para o banco de cada lado."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {isOnlineDuel && (
                <button
                  type="button"
                  onClick={() => declineOnlineDuel(onlineDuel.id)}
                  disabled={onlineLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-500/35 bg-rose-950/40 px-4 py-2 text-sm font-medium text-rose-100 hover:bg-rose-900/60 disabled:opacity-40"
                >
                  Cancelar duelo
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (isOnlineDuel) {
                    confirmOnlineSetup();
                    return;
                  }
                  setDuel(current => current ? finishSetup(current) : current);
                }}
                disabled={onlineLoading || !player.active || (!isOnlineDuel && !opponent.active) || (isOnlineDuel && player.setup_ready)}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-40"
              >
                <Play size={14} /> {isOnlineDuel ? (player.setup_ready ? "Aguardando oponente" : "Confirmar preparacao") : "Comecar duelo"}
              </button>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <SetupPanel title="Voce" player={player} side="player" onAction={applySetup} onCardClick={setDetailCard} disabled={isOnlineDuel && player.setup_ready} />
            {isOnlineDuel ? (
              <div className="rounded-xl border border-rose-400/25 bg-slate-950/45 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-rose-100">Oponente</h3>
                  <span className={`rounded border px-2 py-1 text-xs ${opponent.setup_ready ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-rose-500/30 bg-rose-500/10 text-rose-200"}`}>
                    {opponent.setup_ready ? "Preparado" : "Escolhendo"}
                  </span>
                </div>
                <div className="flex min-h-[430px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-800 bg-slate-950/40 p-6 text-center">
                  <Bot className="mb-3 text-rose-300/70" size={34} />
                  <div className="text-sm font-bold text-slate-200">Campo oculto</div>
                  <p className="mt-2 max-w-sm text-sm text-slate-500">
                    As cartas escolhidas pelo oponente serao reveladas somente depois que os dois confirmarem a preparacao.
                  </p>
                </div>
              </div>
            ) : (
              <SetupPanel title="Oponente" player={opponent} side="opponent" onAction={applySetup} onCardClick={setDetailCard} />
            )}
          </div>
        </div>
      ) : (
        <div className="mx-auto min-w-0 max-w-[1680px] overflow-hidden rounded-3xl border border-indigo-300/20 bg-[#050816] p-3 shadow-2xl shadow-black/50">
          <div className="relative min-h-[min(920px,calc(100vh-7rem))] overflow-hidden rounded-2xl border border-slate-700/70 bg-[#070b1d] p-4">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(244,63,94,0.08),transparent_27%,rgba(14,165,233,0.08)_50%,transparent_68%,rgba(99,102,241,0.1))]" />
            <div className="relative flex min-h-[inherit] flex-col gap-3">
              {duel.winner && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center text-sm text-emerald-200">
                  {duel.winner === "player" ? "Voce venceu!" : "Oponente venceu!"}
                </div>
              )}

              <section className="rounded-2xl border border-rose-400/35 bg-slate-950/35 p-4 shadow-xl shadow-rose-500/10">
                <div className="mb-3 flex items-center gap-2 text-sm font-black text-rose-100">
                  <Bot size={15} className="text-rose-300" />
                  Oponente
                </div>
                <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(340px,420px)_minmax(420px,1fr)]">
                  <FieldCard card={opponent.active} title="Ativa" tone="opponent" onCardClick={setDetailCard}>
                    {opponent.active && <div className="text-[10px] text-rose-100/70">Vale {opponent.active.is_alpha ? 2 : 1} ponto(s)</div>}
                  </FieldCard>
                  <BenchZone cards={opponent.bench} tone="opponent" onCardClick={setDetailCard} />
                </div>
              </section>

              <DuelMomentPanel
                state={duel}
                player={player}
                opponent={opponent}
                canEndTurn={canPlayerAct}
                onEndTurn={() => applyDuelAction(endTurn, { kind: "end_turn" })}
                onOpenDiscard={setCemeterySide}
              />

              <section className="rounded-2xl border border-indigo-400/35 bg-slate-950/35 p-4 shadow-xl shadow-indigo-500/10">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-black text-indigo-100">
                    <Sparkles size={15} className="text-indigo-300" />
                    Voce
                  </div>
                </div>

                <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(340px,420px)_minmax(420px,1fr)_80px]">
                  <FieldCard card={player.active} title="Ativa" tone="player" onCardClick={setDetailCard} onDrop={event => handleDrop(event, "active", 0)}>
                    {player.active && (
                      <>
                        <div className="flex flex-wrap gap-1">
                          <button type="button" onClick={() => setRetreatChoosing(true)} disabled={!canPlayerRetreat} className="inline-flex items-center gap-1 rounded-lg border border-indigo-400/25 bg-slate-950/70 px-2 py-1 text-[10px] text-slate-300 disabled:opacity-40"><RotateCcw size={11} /> Recuar</button>
                          <button
                            type="button"
                            onClick={() => applyDuelAction(
                              state => attachEnergy(state, "player", "active", 0),
                              { kind: "attach_energy", zone: "active", target_index: 0 }
                            )}
                            disabled={!canPlayerAct || player.energy_remaining <= 0}
                            className="inline-flex items-center gap-1 rounded-lg border border-yellow-400/35 bg-yellow-400/10 px-2 py-1 text-[10px] text-yellow-100 disabled:opacity-40"
                          >
                            Energia
                          </button>
                        </div>
                        {(player.active.abilities || []).map((ability, index) => (
                          <button
                            key={index}
                            onClick={() => applyDuelAction(
                              state => activateAbility(state, "player", index),
                              { kind: "ability", ability_index: index, zone: "active", target_index: 0 }
                            )}
                            disabled={!canPayAbility(player.active, ability) || !canAttackThisTurn(duel, "player", index)}
                            className="flex w-full items-center justify-between gap-2 rounded-lg border border-indigo-400/25 bg-slate-950/70 px-2 py-1 text-left text-[10px] text-slate-200 disabled:opacity-40"
                          >
                            <span className="truncate">{ability.name}</span>
                            <span className="flex items-center gap-1 font-mono text-rose-300">
                              {abilityDamage(ability)}
                              <EnergyCostSymbols ability={ability} size="xs" />
                            </span>
                          </button>
                        ))}
                      </>
                    )}
                  </FieldCard>
                  <BenchZone
                    cards={player.bench}
                    tone="player"
                    onCardClick={setDetailCard}
                    onDropSlot={(event, index) => handleDrop(event, "bench", index)}
                    childrenForCard={(card, index) => (
                      <div className="grid gap-1">
                        {isPlayerTurn && !player.active && (
                          <button
                            onClick={() => applyDuelAction(
                              state => promoteFromBench(state, "player", index),
                              { kind: "promote", bench_index: index }
                            )}
                            className="rounded bg-emerald-500/15 px-1 py-0.5 text-[9px] text-emerald-100"
                          >
                            Promover
                          </button>
                        )}
                        {canPlayerAct && retreatChoosing && (
                          <button
                            type="button"
                            onClick={() => {
                              applyDuelAction(
                                state => retreat(state, "player", index),
                                { kind: "retreat", bench_index: index }
                              );
                              setRetreatChoosing(false);
                            }}
                            className="rounded bg-indigo-500/15 px-1 py-0.5 text-[9px] text-indigo-200"
                          >
                            Trocar
                          </button>
                        )}
                      </div>
                    )}
                  />
                  <EnergyZone
                    current={player.energy_zone?.current}
                    next={player.energy_zone?.next}
                    remaining={player.energy_remaining}
                    canDrag={canPlayerAct && player.energy_remaining > 0}
                    onDragStart={event => setDragData(event, { source: "energy" })}
                  />
                </div>

                <div className="relative mt-3 flex items-stretch justify-center">
                  <div className="mx-auto min-w-0 w-full max-w-[46rem] rounded-2xl border border-indigo-400/20 bg-slate-950/45 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-200/60">Mao</div>
                      <div className="font-mono text-xs text-slate-500">{playableHand.length} cartas</div>
                    </div>
                    <div className="overflow-x-auto overflow-y-hidden">
                      <div className="flex min-w-max justify-center pb-6 pl-14 pr-8 pt-3">
                        {playableHand.map(({ card, index }) => {
                          const center = (playableHand.length - 1) / 2;
                          const offset = index - center;
                          const rotate = offset * 5;
                          const lift = Math.abs(offset) * 4;
                          return (
                          <div
                            key={cardId(card, index)}
                            draggable={canPlayerAct}
                            onDragStart={event => setDragData(event, { source: "hand", index })}
                            className="-ml-14 origin-bottom transition-transform hover:z-20 hover:!translate-y-[-2rem] hover:!rotate-0 hover:scale-110"
                            style={{ transform: `translateY(${lift}px) rotate(${rotate}deg)` }}
                          >
                            <div className="w-32 shrink-0 rounded-xl border border-indigo-300/25 bg-slate-950/80 p-2 shadow-lg shadow-black/30">
                              <CardThumb card={card} hand onClick={() => setDetailCard(card)} />
                              {canPlayerAct && (
                                <div className="mt-1 grid gap-1">
                                  {card.card_type === "Personagem" && !card.is_evolution && (
                                    <button
                                      onClick={() => applyDuelAction(
                                        state => playToBench(state, "player", index),
                                        { kind: "play_to_bench", hand_index: index }
                                      )}
                                      disabled={player.bench.length >= DUEL_RULES.BENCH_LIMIT}
                                      className="rounded bg-indigo-500/20 px-1 py-0.5 text-[8px] text-indigo-100 disabled:opacity-40"
                                    >
                                      Banco
                                    </button>
                                  )}
                                  {card.is_evolution && findEvolutionTargets(duel, "player", index).map(target => (
                                    <button
                                      key={`${target.zone}-${target.index}`}
                                      onClick={() => applyDuelAction(
                                        state => evolveFromHand(state, "player", index, target.zone, target.index),
                                        { kind: "evolve", hand_index: index, zone: target.zone, target_index: target.index }
                                      )}
                                      className="rounded bg-cyan-500/15 px-1 py-0.5 text-[8px] text-cyan-100"
                                    >
                                      {target.zone === "active" ? "Evoluir ativa" : `Evoluir banco ${target.index + 1}`}
                                    </button>
                                  ))}
                                  {card.card_type !== "Personagem" && card.card_type !== "Energia" && (
                                    <button
                                      onClick={() => applyDuelAction(
                                        state => playActionCard(state, "player", index),
                                        { kind: "play_action", hand_index: index, zone: "active", target_index: 0 }
                                      )}
                                      className="rounded bg-fuchsia-500/20 px-1 py-0.5 text-[8px] text-fuchsia-100"
                                    >
                                      {card.card_type === "Equipamento" ? "Equipar" : "Usar"}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="absolute bottom-0 right-0 top-0 w-[200px] shrink-0">
                    <DeckPile
                      count={playerDeckCount}
                      canDraw={canPlayerDraw}
                      onDraw={() => applyDuelAction(
                        state => drawTurnCard(state, "player"),
                        { kind: "draw_card" }
                      )}
                    />
                  </div>
                </div>
              </section>

              <button
                type="button"
                onClick={() => {
                  if (!window.confirm("Desistir deste duelo?")) return;
                  if (isOnlineDuel) {
                    sendOnlineAction({ kind: "forfeit" });
                    return;
                  }
                  setDuel(null);
                }}
                className="absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-xl border border-rose-500/35 bg-rose-950/70 px-3 py-2 text-xs font-bold text-rose-100 shadow-lg shadow-black/30 hover:bg-rose-900/80"
              >
                Desistir
              </button>
            </div>
          </div>
        </div>
      )}
      {cemeterySide && duel && (
        <CemeteryModal
          title={cemeterySide === "player" ? "Seu cemiterio" : "Cemiterio do oponente"}
          cards={duel.players[cemeterySide]?.discard || []}
          onClose={() => setCemeterySide(null)}
          onCardClick={setDetailCard}
        />
      )}
      {detailCard && <CommunityCardDetailModal card={detailCard} onClose={() => setDetailCard(null)} />}
    </div>
  );
}
