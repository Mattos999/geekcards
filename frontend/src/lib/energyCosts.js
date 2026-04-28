import {
  CircleStop,
  Triangle,
  Sparkle,
  Pentagon,
} from "lucide-react";

export const ENERGY_SYMBOLS = {
  Superior: <Sparkle size={12} />,
  Natural: <Triangle size={12} />,
  Interior: <Pentagon size={12} />,
  Universal: <CircleStop size={12} />,
};

export function sanitizeEnergyCosts(costs = []) {
  if (!Array.isArray(costs)) return [];

  return costs
    .map(cost => ({
      energy_type: cost.energy_type,
      amount: Math.max(0, parseInt(cost.amount, 10) || 0),
    }))
    .filter(cost => ENERGY_SYMBOLS[cost.energy_type] && cost.amount > 0);
}

export function normalizeAbilityEnergyCosts(ability = {}) {
  const costs = sanitizeEnergyCosts(ability.energy_costs);
  if (costs.length > 0) return costs;

  const legacyCost = Math.max(0, parseInt(ability.energy_cost, 10) || 0);
  if (legacyCost === 0) return [];

  return [{ energy_type: "Universal", amount: legacyCost }];
}

export function totalEnergyCost(costs = []) {
  return sanitizeEnergyCosts(costs).reduce((sum, cost) => sum + cost.amount, 0);
}
