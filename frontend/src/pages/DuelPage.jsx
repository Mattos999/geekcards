import React, { useMemo, useState, useEffect } from "react";
import { api, formatApiError, imageUrl } from "../lib/api";
import { NATURE_COLORS } from "../lib/natures";
import { EnergyCostSymbols } from "../components/EnergyCostSymbols";
import { ENERGY_SYMBOLS } from "../lib/energyCosts";
import { CommunityCardDetailModal } from "../components/CommunityCardDetailModal";
import { EFFECT_TYPES, TARGETS, normalizeEffects } from "../lib/cardEffects";
import {
  DUEL_RULES,
  TURN_MOMENTS,
  attachEnergy,
  createDuel,
  drawTurnCard,
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
  promoteFromBench,
  setupActive,
  setupBenchToHand,
  setupToBench,
} from "../lib/duelEngine";
import { Archive, BookOpen, Bot, ChevronRight, Loader2, Menu, Play, RotateCcw, Shield, Sparkles, Sword, Users, X, Zap } from "lucide-react";
import { toast } from "sonner";

const ENERGY_SYMBOL_CLASSES = {
  Superior: "border-yellow-300/40 bg-yellow-300/15 text-yellow-200",
  Natural: "border-emerald-300/40 bg-emerald-300/15 text-emerald-200",
  Interior: "border-sky-300/40 bg-sky-300/15 text-sky-200",
  Universal: "border-slate-300/40 bg-slate-300/15 text-slate-100",
};

const FIELD_TONE_CLASSES = {
  player: {
    panel: "border-indigo-500/30 bg-indigo-950/10",
    title: "text-indigo-200",
    icon: "text-indigo-300",
  },
  opponent: {
    panel: "border-rose-500/30 bg-rose-950/10",
    title: "text-rose-200",
    icon: "text-rose-300",
  },
  neutral: {
    panel: "border-slate-800 bg-slate-950/50",
    title: "text-slate-500",
    icon: "text-slate-400",
  },
};

const TURN_MOMENT_LABELS = {
  [TURN_MOMENTS.SETUP]: "Preparacao",
  [TURN_MOMENTS.TURN_START]: "Inicio do turno",
  [TURN_MOMENTS.DRAW]: "Saque",
  [TURN_MOMENTS.ACTION]: "Fase de acao",
  [TURN_MOMENTS.ATTACK]: "Ataque",
  [TURN_MOMENTS.TURN_END]: "Fim do turno",
};

const AttachedEnergySymbols = ({ energies = [], compact = false }) => {
  const attached = (energies || []).filter(Boolean);
  if (attached.length === 0) return null;

  return (
    <div className={`mt-1 flex flex-wrap justify-center gap-0.5 ${compact ? "max-w-16" : "max-w-28"}`}>
      {attached.map((energy, index) => (
        <span
          key={`${energy}-${index}`}
          title={energy}
          className={`inline-flex items-center justify-center rounded-full border ${compact ? "h-4 w-4" : "h-5 w-5"} ${ENERGY_SYMBOL_CLASSES[energy] || ENERGY_SYMBOL_CLASSES.Universal}`}
        >
          {ENERGY_SYMBOLS[energy] || ENERGY_SYMBOLS.Universal}
        </span>
      ))}
    </div>
  );
};

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
        <AttachedEnergySymbols energies={card.attached_energy} compact={compact} />
      </div>
      {card.is_alpha && (
        <div className="absolute left-1 top-1 rounded bg-yellow-300 px-1 text-[8px] font-black text-slate-950">A</div>
      )}
    </button>
  );
};

const FieldCard = ({ card, title, tone = "neutral", children, onCardClick }) => {
  const toneClasses = FIELD_TONE_CLASSES[tone] || FIELD_TONE_CLASSES.neutral;
  return (
  <div className={`rounded-lg border p-3 ${toneClasses.panel}`}>
    <div className={`mb-2 text-[10px] uppercase tracking-wider ${toneClasses.title}`}>{title}</div>
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
              Recuo {card.recuo ?? 0} - Vale {knockoutPoints(card)} ponto(s)
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
};

const SetupPanel = ({ title, player, side, tone = "neutral", onAction, onCardClick }) => {
  const toneClasses = FIELD_TONE_CLASSES[tone] || FIELD_TONE_CLASSES.neutral;
  return (
  <div className={`rounded-xl border p-4 ${toneClasses.panel}`}>
    <div className="mb-3 flex items-center justify-between">
      <h3 className={`text-sm font-bold ${toneClasses.title}`}>{title}</h3>
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
};

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

const DeckPile = ({ count = 0, canDraw = false, onDraw, tone = "player", hidden = false }) => {
  const toneClasses = FIELD_TONE_CLASSES[tone] || FIELD_TONE_CLASSES.neutral;
  return (
    <button
      type="button"
      onClick={onDraw}
      disabled={!canDraw}
      className={`flex h-full min-h-28 w-full min-w-24 flex-col items-center justify-center gap-2 rounded-lg border p-3 transition-colors ${toneClasses.panel} ${canDraw ? "hover:border-yellow-400/50 hover:bg-yellow-500/10" : "disabled:opacity-70"}`}
      title={canDraw ? "Comprar carta" : "Baralho"}
    >
      <BookOpen size={20} className={canDraw ? "text-yellow-200" : toneClasses.icon} />
      <div className={`text-[10px] uppercase tracking-wider ${toneClasses.title}`}>Baralho</div>
      <div className="font-mono text-sm text-slate-200">{hidden ? "?" : count}</div>
    </button>
  );
};

const CardBackFan = ({ count = 0, tone = "opponent", label = "Mao" }) => {
  const toneClasses = FIELD_TONE_CLASSES[tone] || FIELD_TONE_CLASSES.neutral;
  const visibleCount = Math.min(Math.max(count, 0), 5);

  return (
    <div className={`rounded-lg border px-3 py-2 ${toneClasses.panel}`}>
      <div className={`mb-1 text-[10px] uppercase tracking-wider ${toneClasses.title}`}>{label}</div>
      <div className="flex min-h-16 items-center">
        {visibleCount > 0 ? (
          Array.from({ length: visibleCount }).map((_, index) => (
            <div
              key={index}
              className={`h-16 w-11 shrink-0 rounded-md border bg-slate-950 shadow-lg shadow-black/25 ${tone === "opponent" ? "border-rose-400/35" : "border-indigo-400/35"}`}
              style={{
                marginLeft: index === 0 ? 0 : -24,
                transform: `rotate(${(index - Math.floor(visibleCount / 2)) * 5}deg)`,
                zIndex: index + 1,
              }}
            >
              <div className={`m-1 h-[calc(100%-0.5rem)] rounded border ${tone === "opponent" ? "border-rose-300/20 bg-rose-500/10" : "border-indigo-300/20 bg-indigo-500/10"}`} />
            </div>
          ))
        ) : (
          <div className="h-16 w-11 rounded-md border border-dashed border-slate-700 bg-slate-950/60" />
        )}
        <span className="ml-3 font-mono text-sm text-slate-300">{count}</span>
      </div>
    </div>
  );
};

const BattleArena = ({ children }) => (
  <div className="mx-auto min-w-0 max-w-[1680px] overflow-hidden rounded-3xl border border-indigo-300/20 bg-[#050816] p-3 shadow-2xl shadow-black/50">
    <div className="relative min-h-[min(920px,calc(100vh-7rem))] overflow-hidden rounded-2xl border border-slate-700/70 bg-[#070b1d] p-4">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(244,63,94,0.08),transparent_27%,rgba(14,165,233,0.08)_50%,transparent_68%,rgba(99,102,241,0.1))]" />
      <div className="relative flex min-h-[inherit] flex-col gap-3">{children}</div>
    </div>
  </div>
);

const mobileTone = {
  player: {
    border: "border-indigo-400/35",
    softBorder: "border-indigo-400/25",
    panel: "bg-indigo-950/15",
    text: "text-indigo-100",
    muted: "text-indigo-200/60",
    glow: "shadow-indigo-500/10",
    accent: "bg-indigo-500",
    button: "bg-indigo-600 hover:bg-indigo-500",
  },
  opponent: {
    border: "border-rose-400/35",
    softBorder: "border-rose-400/25",
    panel: "bg-rose-950/15",
    text: "text-rose-100",
    muted: "text-rose-200/60",
    glow: "shadow-rose-500/10",
    accent: "bg-rose-500",
    button: "bg-rose-600 hover:bg-rose-500",
  },
};

const MobileDeckPile = ({ count = 0, canDraw = false, onDraw, tone = "player" }) => {
  const toneClasses = mobileTone[tone] || mobileTone.player;
  return (
    <button
      type="button"
      onClick={onDraw}
      disabled={!canDraw}
      className={`flex h-full min-h-32 w-full flex-col items-center justify-center gap-2 rounded-xl border ${toneClasses.softBorder} bg-slate-950/45 p-3 text-center shadow-lg ${toneClasses.glow} disabled:opacity-75 ${canDraw ? "hover:border-yellow-300/60 hover:bg-yellow-500/10" : ""}`}
      title={canDraw ? "Comprar carta" : "Baralho"}
    >
      <BookOpen size={22} className={canDraw ? "text-yellow-200" : toneClasses.muted} />
      <div className={`text-[10px] font-bold uppercase tracking-wider ${toneClasses.muted}`}>Baralho</div>
      <div className="font-mono text-lg font-bold text-slate-100">{count}</div>
    </button>
  );
};

const MobileCounters = ({ points = 0, discardCount = 0, tone = "player", onCemetery }) => {
  const toneClasses = mobileTone[tone] || mobileTone.player;
  return (
    <div className="flex h-full min-h-32 flex-col gap-2">
      <button
        type="button"
        onClick={onCemetery}
        className={`rounded-xl border ${toneClasses.softBorder} bg-slate-950/45 px-2 py-3 text-[10px] text-slate-300 hover:bg-slate-900/70`}
      >
        <Archive size={13} className="mx-auto mb-1" />
        <span className="block uppercase tracking-wider">Cemiterio</span>
        <span className="font-mono text-sm text-slate-100">{discardCount}</span>
      </button>
      <div className={`flex flex-1 flex-col items-center justify-center rounded-xl border ${toneClasses.softBorder} ${toneClasses.panel} px-2 py-2`}>
        <div className={`text-[9px] font-bold uppercase tracking-wider ${toneClasses.muted}`}>Pontos</div>
        <div className={`mt-1 font-mono text-base font-bold ${toneClasses.text}`}>{points} / {DUEL_RULES.POINTS_TO_WIN}</div>
      </div>
    </div>
  );
};

const MobileActiveZone = ({ card, tone = "player", children, onCardClick, onDropAction }) => {
  const toneClasses = mobileTone[tone] || mobileTone.player;
  const energyCount = (card?.attached_energy || []).length;

  return (
    <div
      className={`h-full rounded-xl border ${toneClasses.border} ${toneClasses.panel} p-3 shadow-lg ${toneClasses.glow}`}
      onDragOver={onDropAction ? event => event.preventDefault() : undefined}
      onDrop={onDropAction}
    >
      <div className={`mb-2 text-[9px] font-bold uppercase tracking-wider ${toneClasses.muted}`}>Ativa</div>
      <div className="flex min-w-0 gap-3">
        <CardThumb card={card} compact onClick={card ? () => onCardClick?.(card) : undefined} />
        <div className="min-w-0 flex-1">
          {card ? (
            <>
              <div className="truncate text-sm font-black text-white">{card.name}</div>
              <div className="mt-1 text-[10px] text-slate-500">{energyCount > 0 ? `${energyCount} energia(s)` : "Sem energia"}</div>
              <div className="mt-1 text-[10px] text-slate-500">Recuo {card.recuo ?? 0} - Vale {knockoutPoints(card)} ponto(s)</div>
              <div className="mt-2 space-y-1">{children}</div>
            </>
          ) : (
            <div className="text-xs text-slate-500">Sem carta ativa</div>
          )}
        </div>
      </div>
    </div>
  );
};

const MobileBenchZone = ({ cards = [], tone = "player", renderActions, onCardClick, onDropSlot }) => {
  const toneClasses = mobileTone[tone] || mobileTone.player;
  return (
    <div className={`h-full rounded-xl border ${toneClasses.softBorder} bg-slate-950/35 p-3`}>
      <div className={`mb-2 text-[10px] font-bold uppercase tracking-wider ${toneClasses.muted}`}>Banco</div>
      <div className="grid h-[calc(100%-1.5rem)] grid-cols-3 gap-3">
        {[0, 1, 2].map(index => {
          const card = cards?.[index];
          return (
            <div key={index} className="min-w-0 space-y-1">
              <div
                className={`flex min-h-32 items-center justify-center rounded-xl border border-dashed ${toneClasses.softBorder} bg-slate-950/30 p-2`}
                onDragOver={onDropSlot ? event => event.preventDefault() : undefined}
                onDrop={onDropSlot ? event => onDropSlot(event, index) : undefined}
              >
                <CardThumb card={card} compact onClick={card ? () => onCardClick?.(card) : undefined} />
              </div>
              {card && renderActions?.(card, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const MobileHandCard = ({ card, children, onCardClick }) => {
  const firstAbility = (card.abilities || [])[0];
  const summary = firstAbility?.name || card.card_type || "Carta";
  return (
    <div className="w-32 shrink-0 rounded-xl border border-indigo-300/25 bg-slate-950/80 p-2 shadow-lg shadow-black/30">
      <CardThumb card={card} onClick={() => onCardClick?.(card)} />
      <div className="mt-1 min-w-0">
        <div className="truncate text-[10px] font-black text-white">{card.name}</div>
        <div className="mt-0.5 flex items-center justify-between gap-1 text-[9px] text-slate-500">
          <span className="truncate">{card.card_type || "Carta"}</span>
          <span className="font-mono text-rose-300">{card.hp ? `${card.hp} HP` : abilityDamage(firstAbility)}</span>
        </div>
        <div className="mt-0.5 truncate text-[9px] text-indigo-200/70">{summary}</div>
      </div>
      {children && <div className="mt-1 grid gap-1">{children}</div>}
    </div>
  );
};

const MobileHandRow = ({ cards, children }) => (
  <div className="rounded-2xl border border-indigo-400/20 bg-slate-950/45 p-3">
    <div className="mb-2 flex items-center justify-between">
      <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-200/60">Mao</div>
      <div className="font-mono text-xs text-slate-500">{cards.length} cartas</div>
    </div>
    <div className="overflow-x-auto overflow-y-hidden">
      <div className="flex min-w-max gap-3 pb-1">
        {children}
      </div>
    </div>
  </div>
);

const MobileSidePanel = ({
  title,
  icon,
  tone = "player",
  deckCount,
  canDraw = false,
  onDraw,
  points,
  discardCount,
  onCemetery,
  active,
  bench,
  activeActions,
  renderBenchActions,
  hand,
  children,
  onCardClick,
  onActiveDrop,
  onBenchDrop,
}) => {
  const toneClasses = mobileTone[tone] || mobileTone.player;
  return (
    <section className={`rounded-2xl border ${toneClasses.border} bg-slate-950/35 p-4 shadow-xl ${toneClasses.glow}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className={`flex items-center gap-2 text-sm font-black ${toneClasses.text}`}>
          {icon}
          {title}
        </div>
        {children}
      </div>
      <div className={`grid min-w-0 grid-cols-1 gap-3 ${tone === "player" ? "xl:grid-cols-[20rem_minmax(28rem,1fr)_9rem_8rem]" : "xl:grid-cols-[8rem_20rem_minmax(28rem,1fr)_9rem]"}`}>
        {tone !== "player" && <MobileDeckPile count={deckCount} canDraw={canDraw} onDraw={onDraw} tone={tone} />}
        <MobileActiveZone card={active} tone={tone} onCardClick={onCardClick} onDropAction={onActiveDrop}>
          {activeActions}
        </MobileActiveZone>
        <MobileBenchZone cards={bench} tone={tone} renderActions={renderBenchActions} onCardClick={onCardClick} onDropSlot={onBenchDrop} />
        <MobileCounters points={points} discardCount={discardCount} tone={tone} onCemetery={onCemetery} />
        {tone === "player" && <MobileDeckPile count={deckCount} canDraw={canDraw} onDraw={onDraw} tone={tone} />}
      </div>
      {hand && <div className="mt-3">{hand}</div>}
    </section>
  );
};

const DuelMomentPanel = ({ state }) => {
  if (!state) return null;

  const isSetup = state.phase === "setup";
  const isViewerTurn = state.turn === "player";
  const events = new Set(state.turn_events || []);
  const moment = state.winner ? "WINNER" : isSetup ? TURN_MOMENTS.SETUP : state.turn_moment || TURN_MOMENTS.ACTION;
  const momentLabel = state.winner
    ? "Fim do jogo"
    : TURN_MOMENT_LABELS[moment] || TURN_MOMENT_LABELS[TURN_MOMENTS.ACTION];

  const flow = [
    TURN_MOMENTS.TURN_START,
    TURN_MOMENTS.DRAW,
    TURN_MOMENTS.ACTION,
    TURN_MOMENTS.ATTACK,
    TURN_MOMENTS.TURN_END,
  ];

  const stepState = step => {
    if (isSetup) return step === TURN_MOMENTS.TURN_START ? "active" : "pending";
    if (moment === step) return "active";
    if (events.has(step) || [TURN_MOMENTS.TURN_START, TURN_MOMENTS.DRAW].includes(step) && events.has(TURN_MOMENTS.DRAW)) return "done";
    if (step === TURN_MOMENTS.ACTION && moment === TURN_MOMENTS.ATTACK) return "done";
    return "pending";
  };

  return (
    <div className="mx-auto w-full max-w-4xl rounded-lg border border-slate-700/80 bg-slate-950/80 px-3 py-2 shadow-lg shadow-black/20">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Momento do jogo</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${isViewerTurn ? "bg-indigo-400" : "bg-rose-400"}`} />
            <h3 className="text-sm font-bold text-slate-100">{momentLabel}</h3>
            <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs text-slate-400">
              Turno {state.turn_number || 1}
            </span>
            <span className={`rounded px-2 py-0.5 text-xs ${isViewerTurn ? "bg-indigo-500/15 text-indigo-200" : "bg-rose-500/15 text-rose-200"}`}>
              {isViewerTurn ? "Seu campo azul" : "Oponente em acao"}
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap gap-1.5">
          {flow.map(step => {
            const status = stepState(step);
            const classes = status === "active"
              ? "border-indigo-400/50 bg-indigo-500/15 text-indigo-100"
              : status === "done"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : "border-slate-800 bg-slate-900/70 text-slate-500";
            return (
              <span key={step} className={`rounded border px-2 py-1 text-[10px] font-medium ${classes}`}>
                {TURN_MOMENT_LABELS[step]}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const expandDeckCards = deckData => {
  const cardsById = Object.fromEntries((deckData.cards || []).map(card => [card.id, card]));
  return (deckData.deck.card_ids || [])
    .map(id => cardsById[id])
    .filter(Boolean);
};

const validateDuelDeck = (cards, ownerLabel) => {
  if (cards.some(card => card.public_status !== "approved")) return `${ownerLabel} possui cartas que ainda não foram aprovadas para duelo.`;
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
      if (path === "/decline" || payload.kind === "forfeit") {
        setActiveOnlineDuel(null);
      } else {
        setActiveOnlineDuel(data);
      }
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
  const canPlayerDraw = Boolean(isPlayerTurn && !player?.drew_this_turn && (player?.deck?.length || 0) > 0);
  const canPlayerAct = Boolean(isPlayerTurn && (player?.drew_this_turn || (player?.deck?.length || 0) === 0));
  const activeRetreatCost = player?.active?.ignore_retreat_cost
    ? 0
    : Math.max(0, (parseInt(player?.active?.recuo, 10) || 0) - (parseInt(player?.active?.retreat_cost_reduction, 10) || 0));
  const canPlayerRetreat = Boolean(
    canPlayerAct &&
    player?.active &&
    player?.bench?.length > 0 &&
    !(player.active.status_effects || []).some(status => ["prevent_retreat", "block_retreat"].includes(status)) &&
    (player.active.attached_energy || []).length >= activeRetreatCost
  );

  const chooseDamageReaction = ({ side, options, damageAmount, targetCard }) => {
    if (!options?.length) return null;

    if (side === "opponent") return 0;

    if (side !== "player") return null;

    const labelFor = option => `${option.sourceCard?.name || "Carta"} - ${option.ability?.name || "Habilidade"}`;
    if (options.length === 1) {
      return window.confirm(
        `Ativar ${labelFor(options[0])} antes de ${targetCard?.name || "a carta"} receber ${damageAmount} de dano?`
      ) ? 0 : null;
    }

    const answer = window.prompt(
      [
        `${targetCard?.name || "Sua carta"} vai receber ${damageAmount} de dano.`,
        "Escolha uma reacao ou deixe vazio para nao ativar:",
        ...options.map((option, index) => `${index + 1}. ${labelFor(option)}`),
      ].join("\n")
    );
    if (!answer) return null;
    const index = parseInt(answer, 10) - 1;
    return Number.isInteger(index) && index >= 0 && index < options.length ? index : null;
  };

  const reactionContext = () => ({ chooseDamageReaction });

  const applyAndBot = action => {
    setDuel(current => {
      if (!current) return current;
      const context = reactionContext();
      const next = action(current, context);
      return next.turn === "opponent" && !next.winner ? runBotTurn(next, context) : next;
    });
  };

  const applySetup = action => {
    setDuel(current => current ? action(current) : current);
  };

  const runCardAction = (action, context = {}) => {
    if (!action) return;
    if (action.kind === "ability") {
      applyAndBot((state, reaction) => activateAbility(state, "player", action.abilityIndex, { ...context, ...reaction }));
    } else if (action.kind === "hand") {
      applyAndBot((state, reaction) => playActionCard(state, "player", action.handIndex, { ...context, ...reaction }));
    }
    setPendingTargetAction(null);
    setPendingEnergyMoveAction(null);
    setPendingEvolutionHandIndex(null);
  };

  const handleAbilityClick = (ability, index) => {
    if (!canPlayerAct) {
      toast.error("Compre uma carta antes de agir");
      return;
    }
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
    applyAndBot((state, reaction) => activateAbility(state, "player", index, reaction));
  };

  const handleHandActionClick = (card, index) => {
    if (!canPlayerAct) {
      toast.error("Compre uma carta antes de agir");
      return;
    }
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
    applyAndBot((state, reaction) => playActionCard(state, "player", index, reaction));
  };

  const getEvolutionTargets = handIndex => duel ? findEvolutionTargets(duel, "player", handIndex) : [];

  const canChooseEvolutionTarget = (zone, index) => (
    pendingEvolutionHandIndex !== null &&
    getEvolutionTargets(pendingEvolutionHandIndex).some(target => target.zone === zone && target.index === index)
  );

  const handleEvolutionClick = handIndex => {
    if (!canPlayerAct) {
      toast.error("Compre uma carta antes de agir");
      return;
    }
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

  const handleLocalDrop = (event, zone, targetIndex = 0) => {
    event.preventDefault();
    const payload = dragData(event);

    if (payload.source === "energy") {
      if (!canPlayerAct) {
        toast.error("Compre uma carta antes de agir");
        return;
      }
      applyAndBot(state => attachEnergy(state, "player", zone, targetIndex));
      return;
    }

    if (payload.source !== "hand" || payload.index === undefined) return;
    const handIndex = payload.index;
    const card = player?.hand?.[handIndex];
    if (!card) return;

    if (!canPlayerAct) {
      toast.error("Compre uma carta antes de agir");
      return;
    }

    if (card.card_type === "Personagem" && !card.is_evolution && zone === "bench") {
      applyAndBot(state => playToBench(state, "player", handIndex));
      return;
    }

    if (card.is_evolution) {
      const canDropEvolution = getEvolutionTargets(handIndex).some(target => target.zone === zone && target.index === targetIndex);
      if (canDropEvolution) {
        applyAndBot(state => evolveFromHand(state, "player", handIndex, zone, targetIndex));
        setPendingEvolutionHandIndex(null);
        return;
      }
    }

    if (zone === "active" && card.card_type !== "Personagem" && card.card_type !== "Energia") {
      handleHandActionClick(card, handIndex);
    }
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
    const onlineCanDraw = Boolean(onlineIsPlayerTurn && !onlinePlayer?.drew_this_turn && (onlinePlayer?.deck_count || 0) > 0);
    const onlineCanAct = Boolean(onlineIsPlayerTurn && (onlinePlayer?.drew_this_turn || (onlinePlayer?.deck_count || 0) === 0));
    const inviteReceived = activeOnlineDuel?.status === "invited" && activeOnlineDuel?.invitee_id === activeOnlineDuel?.me?.user_id;
    const inviteSent = activeOnlineDuel?.status === "invited" && !inviteReceived;
    const onlineHasDuelProcess = Boolean(activeOnlineDuel && activeOnlineDuel.status !== "invited");
    const onlineEvolutionStage = card => {
      if (!card?.is_evolution) return 1;
      return { I: 2, II: 2, III: 3, IV: 4 }[String(card.evolution_number || "II").toUpperCase()] || 2;
    };
    const onlineCanEvolveTarget = (evolution, target) => {
      if (!evolution?.is_evolution || !target || target.entered_turn >= (onlineState?.turn_number || 1)) return false;
      if (onlineEvolutionStage(evolution) !== onlineEvolutionStage(target) + 1) return false;
      if (evolution.evolves_from_card_id || evolution.evolves_from_name) {
        return (
          evolution.evolves_from_card_id === target.id ||
          evolution.evolves_from_card_id === target.source_card_id ||
          evolution.evolves_from_name === target.name
        );
      }
      return true;
    };
    const onlineEvolutionTargets = card => [
      ...(onlineCanEvolveTarget(card, onlinePlayer?.active) ? [{ zone: "active", index: 0, label: "Evoluir ativa" }] : []),
      ...((onlinePlayer?.bench || []).map((target, index) =>
        onlineCanEvolveTarget(card, target) ? { zone: "bench", index, label: `Evoluir banco ${index + 1}` } : null
      ).filter(Boolean)),
    ];

    const handleOnlineDrop = (event, zone, targetIndex = 0) => {
      event.preventDefault();
      const payload = dragData(event);

      if (payload.source === "energy") {
        if (!onlineCanAct) {
          toast.error("Compre uma carta antes de agir");
          return;
        }
        onlineAction({ kind: "attach_energy", zone, target_index: targetIndex });
        return;
      }

      if (payload.source !== "hand" || payload.index === undefined) return;
      const handIndex = payload.index;
      const card = onlinePlayer?.hand?.[handIndex];
      if (!card) return;

      if (!onlineCanAct) {
        toast.error("Compre uma carta antes de agir");
        return;
      }

      if (card.card_type === "Personagem" && !card.is_evolution && zone === "bench") {
        onlineAction({ kind: "play_to_bench", hand_index: handIndex });
        return;
      }

      if (card.is_evolution && onlineEvolutionTargets(card).some(target => target.zone === zone && target.index === targetIndex)) {
        onlineAction({ kind: "evolve", hand_index: handIndex, zone, target_index: targetIndex });
        return;
      }

      if (zone === "active" && card.card_type !== "Personagem" && card.card_type !== "Energia") {
        onlineAction({ kind: "play_action", hand_index: handIndex, zone: "active", target_index: 0 });
      }
    };

    return (
      <div className="p-6 max-w-[1680px] mx-auto">
        <div className={`${onlineState ? "hidden" : "mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"}`}>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm uppercase tracking-[0.2em] text-indigo-400">
              <Users size={14} />
              Duelo online
            </div>
            <h1 className="text-xl font-bold" style={{ fontFamily: "Outfit" }}>Arena Online</h1>
            <p className="hidden">
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

        <div className={`grid gap-5 ${onlineHasDuelProcess ? "" : "xl:grid-cols-[22rem_minmax(0,1fr)]"}`}>
          {!onlineHasDuelProcess && (
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
                      <div className={`text-xs ${other.in_duel ? "text-amber-300" : "text-emerald-300"}`}>
                        {other.in_duel ? "em duelo" : "online"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => inviteOnlinePlayer(other.id)}
                      disabled={onlineBusy || other.in_duel}
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
          )}

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
                  <button onClick={() => postOnline("/decline")} disabled={onlineBusy}
                    className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50">
                    Encerrar
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
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => postOnline("/decline")}
                      disabled={onlineBusy}
                      className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                    >
                      Encerrar
                    </button>
                    <button
                      type="button"
                      onClick={() => postOnline("/setup-ready", { ready: !onlinePlayer?.setup_ready })}
                      disabled={!onlinePlayer?.active}
                      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-40"
                    >
                      {onlinePlayer?.setup_ready ? "Desmarcar pronto" : "Pronto"}
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className={`rounded-xl border p-4 ${FIELD_TONE_CLASSES.player.panel}`}>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <h3 className={`text-sm font-bold ${FIELD_TONE_CLASSES.player.title}`}>Você</h3>
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

                  <div className={`rounded-xl border p-4 ${FIELD_TONE_CLASSES.opponent.panel}`}>
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className={`text-sm font-bold ${FIELD_TONE_CLASSES.opponent.title}`}>{activeOnlineDuel.opponent?.name}</h3>
                      <span className="text-xs text-slate-500">{onlineOpponent?.setup_ready ? "pronto" : "preparando"}</span>
                    </div>
                    <div className="flex gap-3">
                      <div>
                        <div className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Ativa</div>
                        <CardThumb card={null} />
                      </div>
                      <div>
                        <div className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Banco oculto</div>
                        <div className="flex gap-2">
                          {[0, 1, 2].map(index => (
                            <CardThumb key={index} card={null} compact />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : onlineState ? (
              <BattleArena>
                {onlineState.winner && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center text-sm text-emerald-200">
                    {onlineState.winner === "player" ? "Voce venceu!" : "Oponente venceu!"}
                  </div>
                )}

                <MobileSidePanel
                  title={activeOnlineDuel.opponent?.name || "Oponente"}
                  icon={<Bot size={15} className="text-rose-300" />}
                  tone="opponent"
                  deckCount={onlineOpponent.deck_count ?? 0}
                  points={onlineOpponent.points}
                  discardCount={onlineOpponent.discard?.length || 0}
                  onCemetery={() => setCemeterySide("opponent")}
                  active={onlineOpponent.active}
                  bench={onlineOpponent.bench}
                  onCardClick={setDetailCard}
                />

                <DuelMomentPanel state={onlineState} />

                <MobileSidePanel
                  title="Voce"
                  icon={<Sparkles size={15} className="text-indigo-300" />}
                  tone="player"
                  deckCount={onlinePlayer.deck_count ?? 0}
                  canDraw={onlineCanDraw}
                  onDraw={() => onlineAction({ kind: "draw_card" })}
                  points={onlinePlayer.points}
                  discardCount={onlinePlayer.discard?.length || 0}
                  onCemetery={() => setCemeterySide("player")}
                  active={onlinePlayer.active}
                  bench={onlinePlayer.bench}
                  onCardClick={setDetailCard}
                  onActiveDrop={event => handleOnlineDrop(event, "active", 0)}
                  onBenchDrop={(event, index) => handleOnlineDrop(event, "bench", index)}
                  activeActions={onlineCanAct && onlinePlayer.active && (
                    <>
                      <button onClick={() => onlineAction({ kind: "attach_energy", zone: "active", target_index: 0 })} disabled={onlinePlayer.energy_remaining <= 0} className="inline-flex items-center gap-1 rounded-lg border border-yellow-400/40 bg-yellow-400/10 px-2 py-1 text-[10px] text-yellow-100 disabled:opacity-40"><Zap size={11} /> Energia</button>
                      {(onlinePlayer.active.abilities || []).map((ability, index) => (
                        <button key={index} onClick={() => onlineAction({ kind: "ability", ability_index: index, zone: "active", target_index: 0 })} disabled={!canPayAbility(onlinePlayer.active, ability) || onlineState.turn_number <= 1} className="flex w-full items-center justify-between gap-2 rounded-lg border border-indigo-400/25 bg-slate-950/70 px-2 py-1 text-left text-[10px] text-slate-200 disabled:opacity-40">
                          <span className="truncate">{ability.name}</span>
                          <span className="font-mono text-rose-300">{abilityDamage(ability)}</span>
                        </button>
                      ))}
                    </>
                  )}
                  renderBenchActions={(card, index) => (
                    <div className="grid gap-1">
                      {onlineIsPlayerTurn && !onlinePlayer.active && (
                        <button onClick={() => onlineAction({ kind: "promote", bench_index: index })} className="rounded bg-emerald-500/15 px-1 py-0.5 text-[9px] text-emerald-100">Promover</button>
                      )}
                      {onlineCanAct && (
                        <>
                          <button onClick={() => onlineAction({ kind: "attach_energy", zone: "bench", target_index: index })} disabled={onlinePlayer.energy_remaining <= 0} className="rounded bg-yellow-500/10 px-1 py-0.5 text-[9px] text-yellow-200 disabled:opacity-40">Energia</button>
                          <button onClick={() => onlineAction({ kind: "retreat", bench_index: index })} className="rounded bg-indigo-500/15 px-1 py-0.5 text-[9px] text-indigo-200">Trocar</button>
                        </>
                      )}
                    </div>
                  )}
                  hand={(
                    <div className="mt-2">
                      <MobileHandRow cards={onlinePlayer.hand}>
                        {onlinePlayer.hand.map((card, index) => (
                          <div
                            key={`${card.id}-${index}`}
                            draggable={onlineCanAct}
                            onDragStart={event => setDragData(event, { source: "hand", index })}
                            className="transition-transform hover:z-10 hover:-translate-y-2"
                          >
                            <MobileHandCard card={card} onCardClick={setDetailCard}>
                              {onlineCanAct && card.card_type === "Personagem" && !card.is_evolution && (
                                <button onClick={() => onlineAction({ kind: "play_to_bench", hand_index: index })} disabled={(onlinePlayer.bench?.length || 0) >= DUEL_RULES.BENCH_LIMIT} className="rounded bg-indigo-500/20 px-1 py-0.5 text-[8px] text-indigo-100 disabled:opacity-40">Banco</button>
                              )}
                              {onlineCanAct && card.is_evolution && onlineEvolutionTargets(card).map(target => (
                                <button key={`${target.zone}-${target.index}`} onClick={() => onlineAction({ kind: "evolve", hand_index: index, zone: target.zone, target_index: target.index })} className="rounded bg-cyan-500/15 px-1 py-0.5 text-[8px] text-cyan-100">{target.label}</button>
                              ))}
                              {onlineCanAct && card.card_type !== "Personagem" && card.card_type !== "Energia" && (
                                <button
                                  onClick={() => onlineAction({ kind: "play_action", hand_index: index, zone: "active", target_index: 0 })}
                                  disabled={
                                    (card.card_type === "Equipamento" && (!onlinePlayer.active || (onlinePlayer.active.equipments || []).length > 0)) ||
                                    (card.card_type === "Mestre" && onlinePlayer.master_used_this_turn)
                                  }
                                  className="rounded bg-fuchsia-500/20 px-1 py-0.5 text-[8px] text-fuchsia-100 disabled:opacity-40"
                                >
                                  {card.card_type === "Equipamento" ? "Equipar" : "Usar"}
                                </button>
                              )}
                            </MobileHandCard>
                          </div>
                        ))}
                      </MobileHandRow>
                    </div>
                  )}
                >
                  <div className="flex min-w-0 flex-wrap justify-end gap-1 text-[9px]">
                    <span
                      draggable={onlineCanAct && onlinePlayer.energy_remaining > 0}
                      onDragStart={event => setDragData(event, { source: "energy" })}
                      className="cursor-grab rounded-full border border-yellow-400/35 bg-yellow-400/10 px-2 py-0.5 text-yellow-100"
                    >
                      Atual: {onlinePlayer.energy_zone?.current}
                    </span>
                    <span className="rounded-full border border-slate-700 bg-slate-950/70 px-2 py-0.5 text-slate-400">Prox: {onlinePlayer.energy_zone?.next}</span>
                    <span className="rounded-full border border-indigo-400/20 bg-indigo-500/10 px-2 py-0.5 text-indigo-100">Anexos: {onlinePlayer.energy_remaining}</span>
                  </div>
                </MobileSidePanel>

                <div className="flex items-center justify-between gap-2 px-1">
                  <button
                    onClick={() => {
                      if (window.confirm("Desistir deste duelo?")) onlineAction({ kind: "forfeit" });
                    }}
                    disabled={Boolean(onlineState.winner)}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs text-slate-300 disabled:opacity-40"
                  >
                    <Menu size={14} /> Menu
                  </button>
                  <button onClick={() => onlineAction({ kind: "end_turn" })} disabled={!onlineCanAct} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 disabled:opacity-40">Finalizar turno <ChevronRight size={14} /></button>
                </div>
                <div className="hidden">
                  {onlineState.winner && (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center text-emerald-200">
                      {onlineState.winner === "player" ? "Você venceu!" : "Oponente venceu!"}
                    </div>
                  )}
                  <div className="glass rounded-xl border border-rose-500/30 bg-rose-950/10 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-bold text-rose-200"><Bot size={16} className="text-rose-300" /> {activeOnlineDuel.opponent?.name}</div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCemeterySide("opponent")}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-300 hover:border-rose-500/50"
                        >
                          <Archive size={12} /> Cemiterio {onlineOpponent.discard?.length || 0}
                        </button>
                        <div className="font-mono text-sm text-rose-300">{onlineOpponent.points} / {DUEL_RULES.POINTS_TO_WIN}</div>
                      </div>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-[12rem_minmax(0,1fr)_20rem_7rem]">
                      <CardBackFan count={onlineOpponent.hand_count ?? 0} tone="opponent" label="Mao" />
                      <FieldCard card={onlineOpponent.active} title="Ativa" tone="opponent" onCardClick={setDetailCard} />
                      <div className={`rounded-lg border p-3 ${FIELD_TONE_CLASSES.opponent.panel}`}>
                        <div className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Banco</div>
                        <div className="flex gap-2">{[0, 1, 2].map(index => <CardThumb key={index} card={onlineOpponent.bench?.[index]} compact onClick={onlineOpponent.bench?.[index] ? () => setDetailCard(onlineOpponent.bench[index]) : undefined} />)}</div>
                        <div className="mt-3 text-xs text-slate-500">Mão: {onlineOpponent.hand_count ?? 0} cartas ocultas</div>
                      </div>
                      <DeckPile count={onlineOpponent.deck_count ?? 0} tone="opponent" />
                    </div>
                  </div>

                  <DuelMomentPanel state={onlineState} />

                  <div className="glass rounded-xl border border-indigo-500/30 bg-indigo-950/10 p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-bold text-indigo-200"><Sparkles size={16} className="text-indigo-300" /> Você</div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setCemeterySide("player")}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-300 hover:border-indigo-500/50"
                        >
                          <Archive size={12} /> Cemiterio {onlinePlayer.discard?.length || 0}
                        </button>
                        <div className="font-mono text-sm text-indigo-300">{onlinePlayer.points} / {DUEL_RULES.POINTS_TO_WIN}</div>
                        <span className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-2 py-1 text-xs text-yellow-200">Atual: {onlinePlayer.energy_zone?.current}</span>
                        <span className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-400">Próxima: {onlinePlayer.energy_zone?.next}</span>
                        <span className="text-xs text-slate-400">Anexos: {onlinePlayer.energy_remaining}</span>
                      </div>
                    </div>
                    <div className="grid min-w-0 gap-3 lg:grid-cols-[7rem_minmax(0,1fr)_20rem_7rem]">
                      <DeckPile
                        count={onlinePlayer.deck_count ?? 0}
                        canDraw={onlineCanDraw}
                        onDraw={() => onlineAction({ kind: "draw_card" })}
                        tone="player"
                      />
                      <FieldCard card={onlinePlayer.active} title="Ativa" tone="player" onCardClick={setDetailCard}>
                        {onlineCanAct && onlinePlayer.active && (
                          <div className="space-y-2">
                            <button onClick={() => onlineAction({ kind: "attach_energy", zone: "active", target_index: 0 })} disabled={onlinePlayer.energy_remaining <= 0} className="inline-flex items-center gap-1 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-2 py-1 text-[11px] text-yellow-200 disabled:opacity-40"><Zap size={12} /> Energia</button>
                            <div className="space-y-1">
                              {(onlinePlayer.active.abilities || []).map((ability, index) => (
                                <button key={index} onClick={() => onlineAction({ kind: "ability", ability_index: index, zone: "active", target_index: 0 })} disabled={!canPayAbility(onlinePlayer.active, ability) || onlineState.turn_number <= 1} className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-left text-[11px] hover:border-indigo-500/60 disabled:opacity-40">
                                  <span className="truncate">{ability.name}</span>
                                  <span className="font-mono text-rose-300">{abilityDamage(ability)}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </FieldCard>
                      <div className={`rounded-lg border p-3 ${FIELD_TONE_CLASSES.player.panel}`}>
                        <div className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Banco</div>
                        <div className="flex gap-2">
                          {[0, 1, 2].map(index => (
                            <div key={index} className="space-y-1">
                              <CardThumb card={onlinePlayer.bench?.[index]} compact onClick={onlinePlayer.bench?.[index] ? () => setDetailCard(onlinePlayer.bench[index]) : undefined} />
                              {onlineCanAct && onlinePlayer.bench?.[index] && (
                                <div className="grid gap-1">
                                  <button onClick={() => onlineAction({ kind: "attach_energy", zone: "bench", target_index: index })} disabled={onlinePlayer.energy_remaining <= 0} className="rounded bg-yellow-500/10 px-1 py-0.5 text-[10px] text-yellow-200 disabled:opacity-40">Energia</button>
                                  <button onClick={() => onlineAction({ kind: "retreat", bench_index: index })} className="rounded bg-indigo-500/15 px-1 py-0.5 text-[10px] text-indigo-200">Trocar</button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                      <CardBackFan count={onlinePlayer.hand.length} tone="player" label="Mao" />
                    </div>
                    <div className="mt-4">
                      <div className="mb-2 flex items-center justify-between"><div className="text-[10px] uppercase tracking-wider text-slate-500">Mão</div><div className="text-[10px] font-mono text-slate-500">{onlinePlayer.hand.length} cartas</div></div>
                      <div className="max-h-64 overflow-x-auto overflow-y-hidden rounded-lg border border-slate-800 bg-slate-950/45 p-2">
                        <div className="flex min-w-max pb-2 pl-8">
                          {onlinePlayer.hand.map((card, index) => (
                            <div key={`${card.id}-${index}`} className="-ml-8 w-28 shrink-0 space-y-2 rounded-lg border border-slate-800 bg-slate-950/50 p-2 shadow-lg shadow-black/20 transition-transform hover:z-10 hover:-translate-y-2 hover:border-indigo-400/60">
                              <CardThumb card={card} onClick={() => setDetailCard(card)} />
                              {onlineCanAct && card.card_type === "Personagem" && !card.is_evolution && (
                                <button onClick={() => onlineAction({ kind: "play_to_bench", hand_index: index })} disabled={(onlinePlayer.bench?.length || 0) >= DUEL_RULES.BENCH_LIMIT} className="w-full rounded bg-indigo-500/15 px-2 py-1 text-[10px] text-indigo-200 disabled:opacity-40">Banco</button>
                              )}
                              {onlineCanAct && card.is_evolution && onlineEvolutionTargets(card).map(target => (
                                <button
                                  key={`${target.zone}-${target.index}`}
                                  onClick={() => onlineAction({ kind: "evolve", hand_index: index, zone: target.zone, target_index: target.index })}
                                  className="w-full rounded bg-cyan-500/15 px-2 py-1 text-[10px] text-cyan-100"
                                >
                                  {target.label}
                                </button>
                              ))}
                              {onlineCanAct && card.card_type !== "Personagem" && card.card_type !== "Energia" && (
                                <button
                                  onClick={() => onlineAction({ kind: "play_action", hand_index: index, zone: "active", target_index: 0 })}
                                  disabled={
                                    (card.card_type === "Equipamento" && (!onlinePlayer.active || (onlinePlayer.active.equipments || []).length > 0)) ||
                                    (card.card_type === "Mestre" && onlinePlayer.master_used_this_turn)
                                  }
                                  className="w-full rounded bg-fuchsia-500/15 px-2 py-1 text-[10px] text-fuchsia-200 disabled:opacity-40"
                                >
                                  {card.card_type === "Equipamento" ? "Equipar" : "Usar"}
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap justify-end gap-2">
                      <button
                        onClick={() => {
                          if (window.confirm("Desistir deste duelo?")) onlineAction({ kind: "forfeit" });
                        }}
                        disabled={Boolean(onlineState.winner)}
                        className="inline-flex items-center gap-2 rounded-lg border border-rose-500/40 px-3 py-2 text-sm text-rose-200 hover:bg-rose-500/10 disabled:opacity-40"
                      >
                        Desistir
                      </button>
                      <button onClick={() => onlineAction({ kind: "end_turn" })} disabled={!onlineCanAct} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm hover:bg-indigo-500 disabled:opacity-40">Finalizar turno <ChevronRight size={14} /></button>
                    </div>
                  </div>
                </div>
              </BattleArena>
            ) : (
              <div className="glass rounded-xl p-12 text-center text-slate-400">Aguardando estado do duelo.</div>
            )}
          </section>
        </div>
        {cemeterySide && onlineState && (
          <CemeteryModal
            title={cemeterySide === "player" ? "Seu cemiterio" : "Cemiterio do oponente"}
            cards={onlineState.players?.[cemeterySide]?.discard || []}
            onClose={() => setCemeterySide(null)}
            onCardClick={setDetailCard}
          />
        )}
        {detailCard && <CommunityCardDetailModal card={detailCard} onClose={() => setDetailCard(null)} />}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1680px] mx-auto">
      <div className={`${duel ? "hidden" : "mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"}`}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm uppercase tracking-[0.2em] text-indigo-400">
            <Sword size={14} />
            Duelo
          </div>
          <h1 className="text-xl font-bold" style={{ fontFamily: "Outfit" }}>Arena GeekCards</h1>
          <p className="hidden">
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
            <SetupPanel title="Voce" player={player} side="player" tone="player" onAction={applySetup} onCardClick={setDetailCard} />
            <SetupPanel title="Oponente" player={opponent} side="opponent" tone="opponent" onAction={applySetup} onCardClick={setDetailCard} />
          </div>
        </div>
      ) : (
        <BattleArena>
          {duel.winner && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center text-sm text-emerald-200">
              {duel.winner === "player" ? "Voce venceu!" : "Oponente venceu!"}
            </div>
          )}

          <MobileSidePanel
            title="Oponente"
            icon={<Bot size={15} className="text-rose-300" />}
            tone="opponent"
            deckCount={opponent.deck.length}
            points={opponent.points}
            discardCount={opponent.discard.length}
            onCemetery={() => setCemeterySide("opponent")}
            active={opponent.active}
            bench={opponent.bench}
            onCardClick={setDetailCard}
            activeActions={pendingTargetAction && opponent.active && (
              <button
                type="button"
                onClick={() => runCardAction(pendingTargetAction, { targetOverride: { side: "opponent", zone: "active", index: 0 } })}
                className="rounded-lg border border-rose-400/40 bg-rose-500/15 px-2 py-1 text-[10px] text-rose-100"
              >
                Alvo
              </button>
            )}
            renderBenchActions={(card, index) => pendingTargetAction && (
              <button
                type="button"
                onClick={() => runCardAction(pendingTargetAction, { targetOverride: { side: "opponent", zone: "bench", index } })}
                className="w-full rounded bg-rose-500/15 px-1 py-0.5 text-[9px] text-rose-100"
              >
                Alvo
              </button>
            )}
          />

          <DuelMomentPanel state={duel} />

          <MobileSidePanel
            title="Voce"
            icon={<Sparkles size={15} className="text-indigo-300" />}
            tone="player"
            deckCount={player.deck.length}
            canDraw={canPlayerDraw}
            onDraw={() => applyAndBot(state => drawTurnCard(state, "player"))}
            points={player.points}
            discardCount={player.discard.length}
            onCemetery={() => setCemeterySide("player")}
            active={player.active}
            bench={player.bench}
            onCardClick={setDetailCard}
            onActiveDrop={event => handleLocalDrop(event, "active", 0)}
            onBenchDrop={(event, index) => handleLocalDrop(event, "bench", index)}
            activeActions={canPlayerAct && player.active && (
              <>
                {canChooseEvolutionTarget("active", 0) && (
                  <button type="button" onClick={() => chooseEvolutionTarget("active", 0)} className="rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-2 py-1 text-[10px] text-cyan-100">Evoluir</button>
                )}
                <div className="flex flex-wrap gap-1">
                  <button onClick={() => applyAndBot(state => attachEnergy(state, "player", "active", 0))} disabled={player.energy_remaining <= 0} className="inline-flex items-center gap-1 rounded-lg border border-yellow-400/40 bg-yellow-400/10 px-2 py-1 text-[10px] text-yellow-100 disabled:opacity-40"><Zap size={11} /> Energia</button>
                  <button type="button" onClick={() => setRetreatChoosing(true)} disabled={!canPlayerRetreat} className="inline-flex items-center gap-1 rounded-lg border border-indigo-400/25 bg-slate-950/70 px-2 py-1 text-[10px] text-slate-300 disabled:opacity-40"><RotateCcw size={11} /> Recuar</button>
                </div>
                {(player.active.abilities || []).map((ability, index) => (
                  <button key={index} onClick={() => handleAbilityClick(ability, index)} disabled={!canPayAbility(player.active, ability) || !canAttackThisTurn(duel, "player", index)} className="flex w-full items-center justify-between gap-2 rounded-lg border border-indigo-400/25 bg-slate-950/70 px-2 py-1 text-left text-[10px] text-slate-200 disabled:opacity-40">
                    <span className="truncate">{ability.name}</span>
                    <span className="flex items-center gap-1 font-mono text-rose-300">
                      {abilityDamage(ability)}
                      <EnergyCostSymbols ability={ability} size="xs" />
                    </span>
                  </button>
                ))}
              </>
            )}
            renderBenchActions={(card, index) => (
              <div className="grid gap-1">
                {isPlayerTurn && !player.active && (
                  <button onClick={() => applyAndBot(state => promoteFromBench(state, "player", index))} className="rounded bg-emerald-500/15 px-1 py-0.5 text-[9px] text-emerald-100">Promover</button>
                )}
                {canPlayerAct && (
                  <>
                    <button onClick={() => applyAndBot(state => attachEnergy(state, "player", "bench", index))} disabled={player.energy_remaining <= 0} className="rounded bg-yellow-500/10 px-1 py-0.5 text-[9px] text-yellow-200 disabled:opacity-40">Energia</button>
                    {canChooseEvolutionTarget("bench", index) && (
                      <button type="button" onClick={() => chooseEvolutionTarget("bench", index)} className="rounded bg-cyan-500/15 px-1 py-0.5 text-[9px] text-cyan-100">Evoluir</button>
                    )}
                    {retreatChoosing && (
                      <button
                        type="button"
                        onClick={() => {
                          applyAndBot(state => retreat(state, "player", index));
                          setRetreatChoosing(false);
                        }}
                        className="rounded bg-indigo-500/15 px-1 py-0.5 text-[9px] text-indigo-200"
                      >
                        Trocar
                      </button>
                    )}
                    {pendingEnergyMoveAction && (card.attached_energy || []).length > 0 && (
                      <button type="button" onClick={() => runCardAction(pendingEnergyMoveAction, { energySourceOverride: index })} className="rounded bg-cyan-500/15 px-1 py-0.5 text-[9px] text-cyan-100">Fonte</button>
                    )}
                  </>
                )}
              </div>
            )}
            hand={(
              <div className="mt-2">
                <MobileHandRow cards={playableHand}>
                  {playableHand.map(({ card, index }) => (
                    <div
                      key={`${card.id}-${index}`}
                      draggable={canPlayerAct}
                      onDragStart={event => setDragData(event, { source: "hand", index })}
                      className="transition-transform hover:z-10 hover:-translate-y-2"
                    >
                      <MobileHandCard card={card} onCardClick={setDetailCard}>
                        {canPlayerAct && card.card_type === "Personagem" && !card.is_evolution && (
                          <button onClick={() => applyAndBot(state => playToBench(state, "player", index))} disabled={player.bench.length >= DUEL_RULES.BENCH_LIMIT} className="rounded bg-indigo-500/20 px-1 py-0.5 text-[8px] text-indigo-100 disabled:opacity-40">Banco</button>
                        )}
                        {canPlayerAct && card.is_evolution && getEvolutionTargets(index).length > 0 && (
                          <button onClick={() => handleEvolutionClick(index)} className="rounded bg-cyan-500/15 px-1 py-0.5 text-[8px] text-cyan-100">{pendingEvolutionHandIndex === index ? "Escolha" : "Evolucao"}</button>
                        )}
                        {canPlayerAct && card.card_type !== "Personagem" && card.card_type !== "Energia" && (
                          <button
                            onClick={() => handleHandActionClick(card, index)}
                            disabled={
                              (card.card_type === "Equipamento" && (!player.active || (player.active.equipments || []).length > 0)) ||
                              (card.card_type === "Mestre" && player.master_used_this_turn)
                            }
                            className="rounded bg-fuchsia-500/20 px-1 py-0.5 text-[8px] text-fuchsia-100 disabled:opacity-40"
                          >
                            {card.card_type === "Equipamento" ? "Equipar" : "Usar"}
                          </button>
                        )}
                        {canPlayerAct && card.card_type === "Energia" && (
                          <div className="rounded bg-slate-800 px-1 py-0.5 text-center text-[8px] text-slate-400">Energia fora</div>
                        )}
                      </MobileHandCard>
                    </div>
                  ))}
                </MobileHandRow>
              </div>
            )}
          >
            <div className="flex min-w-0 flex-wrap justify-end gap-1 text-[9px]">
              <span
                draggable={canPlayerAct && player.energy_remaining > 0}
                onDragStart={event => setDragData(event, { source: "energy" })}
                className="cursor-grab rounded-full border border-yellow-400/35 bg-yellow-400/10 px-2 py-0.5 text-yellow-100"
              >
                Atual: {player.energy_zone?.current}
              </span>
              <span className="rounded-full border border-slate-700 bg-slate-950/70 px-2 py-0.5 text-slate-400">Prox: {player.energy_zone?.next}</span>
              <span className="rounded-full border border-indigo-400/20 bg-indigo-500/10 px-2 py-0.5 text-indigo-100">Anexos: {player.energy_remaining}</span>
            </div>
          </MobileSidePanel>

          <div className="flex items-center justify-between gap-2 px-1">
            <button onClick={() => setDuel(null)} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs text-slate-300">
              <Menu size={14} /> Menu
            </button>
            <button onClick={() => applyAndBot(endTurn)} disabled={!canPlayerAct} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 disabled:opacity-40">
              Finalizar turno <ChevronRight size={14} />
            </button>
          </div>
          <div className="hidden">
            {duel.winner && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center text-emerald-200">
                {duel.winner === "player" ? "Voce venceu!" : "Oponente venceu!"}
              </div>
            )}

            <div className="glass rounded-xl border border-rose-500/30 bg-rose-950/10 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-bold text-rose-200">
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
              <div className="grid gap-3 lg:grid-cols-[12rem_minmax(0,1fr)_20rem_7rem]">
                <CardBackFan count={opponent.hand.length} tone="opponent" label="Mao" />
                <FieldCard card={opponent.active} title="Ativa" tone="opponent" onCardClick={setDetailCard}>
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
                <div className={`rounded-lg border p-3 ${FIELD_TONE_CLASSES.opponent.panel}`}>
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
                <DeckPile count={opponent.deck.length} tone="opponent" />
              </div>
            </div>

            <DuelMomentPanel state={duel} />

            <div className="glass rounded-xl border border-indigo-500/30 bg-indigo-950/10 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-bold text-indigo-200">
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

              <div className="grid min-w-0 gap-3 lg:grid-cols-[7rem_minmax(0,1fr)_20rem_7rem]">
                <DeckPile
                  count={player.deck.length}
                  canDraw={canPlayerDraw}
                  onDraw={() => applyAndBot(state => drawTurnCard(state, "player"))}
                  tone="player"
                />
                <FieldCard card={player.active} title="Ativa" tone="player" onCardClick={setDetailCard}>
                  {canPlayerAct && player.active && (
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

                <div className={`rounded-lg border p-3 ${FIELD_TONE_CLASSES.player.panel}`}>
                  <div className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Banco</div>
                  <div className="flex gap-2">
                    {[0, 1, 2].map(index => (
                      <div key={index} className="space-y-1">
                        <CardThumb card={player.bench[index]} compact onClick={player.bench[index] ? () => setDetailCard(player.bench[index]) : undefined} />
                        {canPlayerAct && player.bench[index] && (
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
                <CardBackFan count={playableHand.length} tone="player" label="Mao" />
              </div>

              <div className="mt-4 min-w-0">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Mao</div>
                  <div className="text-[10px] font-mono text-slate-500">{playableHand.length} cartas</div>
                </div>
                <div className="max-h-64 max-w-full overflow-x-auto overflow-y-hidden rounded-lg border border-slate-800 bg-slate-950/45 p-2">
                  <div className="flex min-w-max pb-2 pl-8">
                    {playableHand.map(({ card, index }) => (
                      <div key={`${card.id}-${index}`} className="-ml-8 w-28 shrink-0 space-y-2 rounded-lg border border-slate-800 bg-slate-950/50 p-2 shadow-lg shadow-black/20 transition-transform hover:z-10 hover:-translate-y-2 hover:border-indigo-400/60">
                        <CardThumb card={card} onClick={() => setDetailCard(card)} />
                        {canPlayerAct && (
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
                              disabled={
                                (card.card_type === "Equipamento" && (!player.active || (player.active.equipments || []).length > 0)) ||
                                (card.card_type === "Mestre" && player.master_used_this_turn)
                              }
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

              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button onClick={() => setDuel(null)}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">
                  <RotateCcw size={14} /> Encerrar
                </button>
                <button onClick={() => applyAndBot(endTurn)} disabled={!canPlayerAct}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm hover:bg-indigo-500 disabled:opacity-40">
                  Finalizar turno <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </BattleArena>
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
