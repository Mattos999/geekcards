import React, { useEffect, useMemo } from "react";
import {
  ArrowLeft,
  ChevronsUp,
  Heart,
  Layers,
  ShieldAlert,
  Sparkles,
  Star,
  Swords,
  User,
  X,
  Zap,
} from "lucide-react";
import { GameCard } from "./GameCard";
import { EnergyCostSymbols } from "./EnergyCostSymbols";
import {
  NATURES,
  NATURE_COLORS,
  RARITY_COLORS,
  WEAKNESS_MAP,
  computeEffectiveWeaknesses,
} from "../lib/natures";

const ADVANTAGE_MAP = {};
NATURES.forEach(nature => {
  ADVANTAGE_MAP[nature] = [];
});
Object.entries(WEAKNESS_MAP).forEach(([nature, weaknesses]) => {
  weaknesses.forEach(weakness => {
    ADVANTAGE_MAP[weakness].push(nature);
  });
});

const Section = ({ title, children }) => (
  <section className="space-y-2">
    <h3 className="text-xs uppercase tracking-[0.18em] text-slate-500 font-bold">
      {title}
    </h3>
    {children}
  </section>
);

const InfoTile = ({ icon: Icon, label, value, tone = "slate" }) => {
  const toneClass = {
    slate: "border-slate-800 bg-slate-950/70 text-slate-200",
    rose: "border-rose-500/30 bg-rose-500/10 text-rose-200",
    sky: "border-sky-500/30 bg-sky-500/10 text-sky-200",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-200",
    indigo: "border-indigo-500/30 bg-indigo-500/10 text-indigo-200",
  }[tone];

  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-slate-400">
        <Icon size={13} />
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold font-mono leading-none">
        {value ?? "-"}
      </div>
    </div>
  );
};

const NaturePill = ({ nature }) => {
  const color = NATURE_COLORS[nature] || "#94A3B8";

  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold"
      style={{
        background: `${color}22`,
        borderColor: `${color}99`,
        color,
      }}
    >
      {nature}
    </span>
  );
};

export function CommunityCardDetailModal({ card, onClose }) {
  const weaknesses = useMemo(
    () => computeEffectiveWeaknesses(card?.natures || []),
    [card]
  );

  const advantages = useMemo(() => {
    const result = new Set();
    (card?.natures || []).forEach(nature => {
      (ADVANTAGE_MAP[nature] || []).forEach(target => result.add(target));
    });
    return [...result].sort();
  }, [card]);

  useEffect(() => {
    if (!card) return undefined;

    const onKeyDown = event => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [card, onClose]);

  if (!card) return null;

  const abilities = Array.isArray(card.abilities) ? card.abilities : [];
  const rarityColor = card.is_alpha
    ? RARITY_COLORS.alpha
    : RARITY_COLORS[card.rarity] ?? RARITY_COLORS[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Detalhes da carta ${card.name}`}
    >
      <div
        className="glass relative my-auto grid w-full max-w-5xl gap-6 rounded-xl p-4 shadow-2xl sm:p-6 lg:grid-cols-[18rem_1fr]"
        onClick={event => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-lg border border-slate-700 bg-slate-950/80 p-2 text-slate-400 transition-colors hover:text-white"
          aria-label="Fechar detalhes"
        >
          <X size={18} />
        </button>

        <div className="flex items-start justify-center self-start lg:justify-start">
          <div className="shrink-0">
            <GameCard card={card} size="lg" showStats />
          </div>
        </div>

        <div className="min-w-0 space-y-5 pr-0 sm:pr-10 lg:pr-2">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.18em] text-indigo-300">
              <span>{card.card_type}</span>
              {card.energy_type && <span>{card.energy_type}</span>}
              {card.is_alpha && (
                <span className="rounded-full bg-amber-400 px-2 py-0.5 font-black text-slate-950">
                  ALPHA
                </span>
              )}
            </div>

            <h2
              className="text-3xl font-bold leading-tight text-white sm:text-4xl"
              style={{ fontFamily: "Outfit" }}
            >
              {card.name}
            </h2>

            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
              {card.owner_name && (
                <span className="inline-flex items-center gap-1.5">
                  <User size={14} />
                  por {card.owner_name}
                </span>
              )}

              <span className="inline-flex items-center gap-1.5">
                {Array.from({ length: Math.max(card.rarity || 0, 1) }).map((_, index) => (
                  <Star
                    key={index}
                    size={14}
                    fill={rarityColor}
                    color={rarityColor}
                  />
                ))}
                raridade {card.rarity ?? 0}
              </span>

              {card.is_evolution && card.evolution_number && (
                <span className="inline-flex items-center gap-1.5 text-cyan-300">
                  <ChevronsUp size={16} />
                  Evolucao {card.evolution_number}
                </span>
              )}
            </div>
          </div>

          {card.description && (
            <Section title="Descricao">
              <p className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm leading-relaxed text-slate-300">
                {card.description}
              </p>
            </Section>
          )}

          <Section title="Informacoes">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <InfoTile icon={Layers} label="Tipo" value={card.card_type} tone="indigo" />
              {card.card_type === "Personagem" && (
                <>
                  <InfoTile icon={Heart} label="HP" value={card.hp ?? 0} tone="rose" />
                  <InfoTile icon={ArrowLeft} label="Recuo" value={card.recuo ?? 0} tone="sky" />
                </>
              )}
              {card.energy_type && (
                <InfoTile icon={Zap} label="Energia" value={card.energy_type} tone="amber" />
              )}
            </div>
          </Section>

          {card.natures?.length > 0 && (
            <Section title="Naturezas">
              <div className="flex flex-wrap gap-2">
                {card.natures.map(nature => (
                  <NaturePill key={nature} nature={nature} />
                ))}
              </div>
            </Section>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Section title="Vantagens">
              <div className="min-h-[3rem] rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3">
                {advantages.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {advantages.map(nature => (
                      <NaturePill key={nature} nature={nature} />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">Sem vantagens por natureza.</p>
                )}
              </div>
            </Section>

            <Section title="Desvantagens">
              <div className="min-h-[3rem] rounded-lg border border-rose-500/25 bg-rose-500/10 p-3">
                {weaknesses.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {weaknesses.map(nature => (
                      <span
                        key={nature}
                        className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/15 px-2.5 py-1 text-xs font-bold text-rose-200"
                      >
                        <ShieldAlert size={12} />
                        {nature}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">Sem desvantagens por natureza.</p>
                )}
              </div>
            </Section>
          </div>

          <Section title={`Habilidades (${abilities.length}/3)`}>
            {abilities.length > 0 ? (
              <div className="space-y-3">
                {abilities.map((ability, index) => (
                  <div
                    key={`${ability.name}-${index}`}
                    className="rounded-lg border border-slate-800 bg-slate-950/60 p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <Sparkles size={15} className="shrink-0 text-indigo-300" />
                        <h4 className="truncate text-sm font-bold text-slate-100">
                          {ability.name || `Habilidade ${index + 1}`}
                        </h4>
                      </div>

                      <div className="flex shrink-0 gap-2 font-mono text-xs">
                        <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-2 py-1 text-rose-300">
                          <Swords size={12} />
                          {ability.damage ?? 0}
                        </span>
                        <span className="inline-flex min-h-6 items-center gap-1 rounded-md bg-yellow-500/10 px-2 py-1">
                          <EnergyCostSymbols ability={ability} size="sm" showEmpty className="text-yellow-300" />
                        </span>
                      </div>
                    </div>

                    {ability.description ? (
                      <p className="mt-2 text-sm leading-relaxed text-slate-400">
                        {ability.description}
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-slate-500">Sem descricao.</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-400">
                Nenhuma habilidade cadastrada.
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
