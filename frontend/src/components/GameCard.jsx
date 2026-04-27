import React from "react";
import { NATURE_COLORS, RARITY_COLORS, computeEffectiveWeaknesses } from "../lib/natures";
import { imageUrl } from "../lib/api";
import { Star, Zap, Heart, Swords, ArrowLeft, ArrowDown, Sparkles } from "lucide-react";

// A visual representation of a game card
export const GameCard = ({ card, size = "md", onClick, selected = false, showStats = true }) => {
  if (!card) return null;

  const sizeClasses = {
    sm: "w-36",
    md: "w-48",
    lg: "w-64",
  };

  const rarityColor = card.is_alpha ? RARITY_COLORS.alpha : RARITY_COLORS[card.rarity] || RARITY_COLORS[1];
  const primaryNature = card.natures?.[0];
  const primaryColor = primaryNature ? NATURE_COLORS[primaryNature] : "#334155";
  const weaknesses = computeEffectiveWeaknesses(card.natures || []);

  return (
    <div
      data-testid={`game-card-${card.id}`}
      onClick={onClick}
      className={`relative ${sizeClasses[size]} aspect-[2.5/3.5] rounded-xl overflow-hidden card-shine cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl group ${selected ? "ring-2 ring-indigo-400" : ""}`}
      style={{
        background: `linear-gradient(145deg, ${primaryColor}22, #0F172A 60%)`,
        border: `2px solid ${rarityColor}`,
        boxShadow: card.is_alpha ? `0 0 24px ${rarityColor}55` : "0 4px 16px rgba(0,0,0,0.4)",
      }}
    >
      {/* Image */}
      <div className="absolute inset-0">
        {card.image_url ? (
          <img src={imageUrl(card.image_url)} alt={card.name} className="w-full h-full object-cover" />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-6xl font-bold opacity-10"
            style={{ color: primaryColor, fontFamily: "Outfit" }}
          >
            {card.name?.[0] || "?"}
          </div>
        )}
      </div>

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent pointer-events-none" />

      {/* ALPHA badge */}
      {card.is_alpha && (
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-black tracking-widest" style={{ background: RARITY_COLORS.alpha, color: "white" }}>
          ALPHA
        </div>
      )}

      {/* Rarity stars */}
      <div className="absolute top-2 right-2 flex gap-0.5">
        {card.rarity > 0 &&
          Array.from({ length: card.rarity }).map((_, i) => (
            <Star
              key={i}
              size={12}
              fill={rarityColor}
              color={rarityColor}
            />
          ))
        }
      </div>

      {/* Natures */}
      {card.natures?.length > 0 && (
        <div className="absolute top-8 left-2 flex flex-col gap-1">
          {card.natures.map(n => (
            <div key={n} className="nature-badge" style={{ background: `${NATURE_COLORS[n]}CC`, color: "#fff", borderColor: NATURE_COLORS[n] }}>
              {n}
            </div>
          ))}
        </div>
      )}

      {/* Weaknesses */}
      {weaknesses.length > 0 && (
        <div className="absolute top-7 right-2 flex flex-col items-end gap-0.5">
          {weaknesses.slice(0, 3).map((w, i) => (
            <div
              key={i}
              className="px-1.5 py-0.5 rounded-md text-[9px] font-bold border"
              style={{
              background: "rgb(255, 0, 0)", // vermelho suave
              borderColor: "#520000",
              color: "#ffffff"
              }}
            >
              ⚠ {w}
            </div>
          ))}
        </div>
      )}

      {/* Name + type */}
      <div className="absolute bottom-0 left-0 right-0 p-3">
        <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5 font-mono">
          {card.card_type} {card.energy_type && `· ${card.energy_type}`}
        </div>
        <div className="text-sm font-bold text-white leading-tight truncate" style={{ fontFamily: "Outfit" }}>
          {card.name}
        </div>
        {showStats && card.card_type === "Personagem" && (
          <div className="flex gap-2 mt-1 font-mono text-[10px]">
            <span className="flex items-center gap-0.5 text-rose-400"><Heart size={10} />{card.hp}</span>
            <span className="flex items-center gap-0.5 text-sky-400"><ArrowLeft size={10} />{card.recuo}</span>
          </div>
        )}

        {/* Abilities preview */}
        {showStats && Array.isArray(card.abilities) && card.abilities.length > 0 && (
          <div className="mt-1.5 space-y-1">
            {card.abilities.slice(0, 3).map((ab, i) => (
              <div key={i} className="flex items-start gap-1">
                <Sparkles size={8} className="shrink-0 mt-0.5 text-indigo-400" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[9px] font-semibold text-indigo-300 leading-tight">
                  {ab.name}
                </span>

                {ab.damage > 0 && (
                  <span className="text-[8px] font-mono text-rose-400">
                    ⚔ {ab.damage}
                  </span>
                )}

                {ab.energy_cost > 0 && (
                  <span className="text-[8px] font-mono text-yellow-400">
                    ⚡ {ab.energy_cost}
                  </span>
                )}
              </div>
                  {ab.description && (
                    <p className="text-[8px] text-slate-400 leading-tight truncate">{ab.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
