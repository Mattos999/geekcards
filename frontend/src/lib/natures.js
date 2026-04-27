// Natures constants - must match backend
export const NATURES = [
  "Anjo", "Demônio", "Entidade", "Mago", "Cavaleiro", "Caçador",
  "Monstro", "Super", "Agente", "Pirata", "Herói", "Vilão",
  "Shinobi", "Dragão"
];

export const NATURE_COLORS = {
  "Anjo": "#FDE047",
  "Demônio": "#991B1B",
  "Entidade": "#7E22CE",
  "Mago": "#3B82F6",
  "Cavaleiro": "#94A3B8",
  "Caçador": "#4D7C0F",
  "Monstro": "#22C55E",
  "Super": "#F59E0B",
  "Agente": "#0EA5E9",
  "Pirata": "#14B8A6",
  "Herói": "#4338CA",
  "Vilão": "#BE185D",
  "Shinobi": "#1F2937",
  "Dragão": "#DC2626",
};

export const WEAKNESS_MAP = {
  "Anjo": [],
  "Demônio": ["Anjo"],
  "Entidade": ["Demônio"],
  "Mago": ["Entidade"],
  "Cavaleiro": ["Mago", "Dragão"],
  "Caçador": ["Cavaleiro"],
  "Monstro": ["Caçador"],
  "Super": ["Monstro"],
  "Agente": ["Super"],
  "Pirata": ["Agente"],
  "Herói": ["Pirata"],
  "Vilão": ["Herói"],
  "Shinobi": ["Vilão"],
  "Dragão": ["Shinobi"],
};

export const CARD_TYPES = ["Personagem", "Item", "Mestre", "Energia"];
export const ENERGY_TYPES = ["Superior", "Natural", "Interior", "Universal"];

export const RARITY_COLORS = {
  0: "#94A3B8",
  1: "#abffa8",
  2: "#4e91fd",
  3: "#c83cff",
  4: "#ff2f2f",
  alpha: "#ffd900",
};

export function computeEffectiveWeaknesses(natures) {
  if (!natures || natures.length === 0) return [];
  const weak = new Set();
  for (const n of natures) {
    (WEAKNESS_MAP[n] || []).forEach(w => weak.add(w));
  }
  natures.forEach(n => weak.delete(n));
  return [...weak].sort();
}
