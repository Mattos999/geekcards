import React from "react";
import { ENERGY_SYMBOLS, normalizeAbilityEnergyCosts, sanitizeEnergyCosts } from "../lib/energyCosts";

const ENERGY_CLASSES = {
  Superior: "text-yellow-300",
  Natural: "text-yellow-300",
  Interior: "text-yellow-300",
  Universal: "text-yellow-300",
};

export function EnergyCostSymbols({
  ability,
  costs,
  className = "",
  size = "sm",
  showEmpty = false,
}) {
  const entries = costs
    ? sanitizeEnergyCosts(costs)
    : normalizeAbilityEnergyCosts(ability);

  if (entries.length === 0) {
    return showEmpty ? <span className={className}>-</span> : null;
  }

  const sizeClass = size === "xs" ? "text-[8px]" : size === "lg" ? "text-sm" : "text-xs";

  return (
    <span
      className={`inline-flex items-center font-mono font-black leading-none ${sizeClass} ${className}`}
      aria-label={entries.map(cost => `${cost.amount} ${cost.energy_type}`).join(", ")}
    >
      {entries.flatMap((cost, costIndex) =>
        Array.from({ length: cost.amount }).map((_, symbolIndex) => (
          <span
            key={`${cost.energy_type}-${costIndex}-${symbolIndex}`}
            title={cost.energy_type}
            className={ENERGY_CLASSES[cost.energy_type]}
          >
            {ENERGY_SYMBOLS[cost.energy_type]}
          </span>
        ))
      )}
    </span>
  );
}
