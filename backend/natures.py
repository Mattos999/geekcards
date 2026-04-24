"""Geek Cards TCG Natures System - single source of truth for weakness chain."""

NATURES = [
    "Anjo", "Demônio", "Entidade", "Mago", "Cavaleiro", "Caçador",
    "Monstro", "Super", "Agente", "Pirata", "Herói", "Vilão",
    "Shinobi", "Dragão"
]

# Weakness chain: key is weak TO the values in the list
WEAKNESS_MAP = {
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
}

# Who each nature has advantage against (inverse of weakness map)
ADVANTAGE_MAP = {n: [] for n in NATURES}
for nature, weak_to in WEAKNESS_MAP.items():
    for w in weak_to:
        ADVANTAGE_MAP[w].append(nature)


def compute_effective_weaknesses(card_natures: list[str]) -> list[str]:
    """Given a card's natures, compute final weaknesses after cancellations.
    A weakness is cancelled if another characteristic on the card has that weakness's own weakness.
    Simpler rule: take union of all weaknesses, remove any nature that is also in the card's natures.
    """
    if not card_natures:
        return []
    weaknesses = set()
    for n in card_natures:
        for w in WEAKNESS_MAP.get(n, []):
            weaknesses.add(w)
    # Remove weaknesses that are themselves in the card's own natures (self-cancel)
    weaknesses -= set(card_natures)
    return sorted(weaknesses)


CARD_TYPES = ["Personagem", "Item", "Mestre", "Energia"]
ENERGY_TYPES = ["Superior", "Natural", "Interior", "Universal"]
RARITIES = [1, 2, 3]
