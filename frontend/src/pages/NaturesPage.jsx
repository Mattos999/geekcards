import React, { useState } from "react";
import { NATURES, NATURE_COLORS, WEAKNESS_MAP, computeEffectiveWeaknesses } from "../lib/natures";
import { ArrowRight, Shield, Swords, Sparkles, X } from "lucide-react";

// Inverse: who each nature BEATS (has advantage against)
const ADVANTAGE_MAP = {};
NATURES.forEach(n => { ADVANTAGE_MAP[n] = []; });
Object.entries(WEAKNESS_MAP).forEach(([n, weakTo]) => {
  weakTo.forEach(w => { ADVANTAGE_MAP[w].push(n); });
});

const NatureBadge = ({ name, size = "md", withDot = false }) => {
  const color = NATURE_COLORS[name];
  const sizeCls = size === "sm" ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold border ${sizeCls}`}
      style={{ background: `${color}22`, borderColor: `${color}88`, color }}>
      {withDot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />}
      {name}
    </span>
  );
};

export default function NaturesPage() {
  const [selected, setSelected] = useState([]);

  const toggle = (n) => {
    setSelected(s => {
      if (s.includes(n)) return s.filter(x => x !== n);
      if (s.length >= 3) return s;
      return [...s, n];
    });
  };

  const effectiveWeak = computeEffectiveWeaknesses(selected);
  // Neutralized = weaknesses that WOULD apply from individual natures but got cancelled
  const rawWeak = new Set();
  selected.forEach(n => (WEAKNESS_MAP[n] || []).forEach(w => rawWeak.add(w)));
  const neutralized = [...rawWeak].filter(w => selected.includes(w)).sort();

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-10 animate-fade-in-up">
        <div className="text-sm uppercase tracking-[0.2em] text-indigo-400 mb-1">Referência</div>
        <h1 className="text-4xl sm:text-5xl font-bold" style={{ fontFamily: "Outfit" }}>Tabela de Naturezas</h1>
        <p className="text-slate-400 mt-2 text-sm">Vantagens, desvantagens e neutralizações entre as 14 naturezas do Geek Cards.</p>
      </div>

      {/* Section 1: Chain */}
      <section className="glass rounded-xl p-6 mb-8" data-testid="nature-chain-section">
        <h2 className="text-xl font-semibold mb-1 flex items-center gap-2" style={{ fontFamily: "Outfit" }}>
          <Sparkles size={18} className="text-indigo-400" />
          Cadeia de Fraquezas
        </h2>
        <p className="text-sm text-slate-400 mb-4">Cada natureza é forte contra a próxima. <span className="text-amber-300">Anjo</span> não tem fraquezas. <span className="text-slate-300">Cavaleiro</span> tem duas (Mago e Dragão).</p>
        <div className="flex flex-wrap items-center gap-2">
          {NATURES.map((n, i) => (
            <React.Fragment key={n}>
              <NatureBadge name={n} withDot />
              {i < NATURES.length - 1 && <ArrowRight size={12} className="text-slate-600" />}
            </React.Fragment>
          ))}
          <ArrowRight size={12} className="text-slate-600" />
          <span className="text-xs text-slate-500 italic">(Dragão → Cavaleiro)</span>
        </div>
      </section>

      {/* Section 2: Detail list */}
      <section className="glass rounded-xl p-6 mb-8" data-testid="nature-detail-list">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2" style={{ fontFamily: "Outfit" }}>
          <Swords size={18} className="text-amber-400" />
          Vantagens × Desvantagens por Natureza
        </h2>
        <div className="grid md:grid-cols-2 gap-3">
          {NATURES.map(n => {
            const beats = ADVANTAGE_MAP[n];
            const weakTo = WEAKNESS_MAP[n];
            return (
              <div key={n} className="p-4 rounded-lg bg-slate-900/50 border border-slate-800" data-testid={`nature-row-${n}`}>
                <div className="mb-3">
                  <NatureBadge name={n} />
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 mt-0.5 w-16 text-emerald-400 font-semibold uppercase tracking-wider">Vence</span>
                    <div className="flex flex-wrap gap-1">
                      {beats.length ? beats.map(b => <NatureBadge key={b} name={b} size="sm" />) : <span className="text-slate-500 italic">—</span>}
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 mt-0.5 w-16 text-rose-400 font-semibold uppercase tracking-wider">Perde</span>
                    <div className="flex flex-wrap gap-1">
                      {weakTo.length ? weakTo.map(w => <NatureBadge key={w} name={w} size="sm" />) : <span className="text-slate-500 italic">nenhum</span>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Section 3: Matrix */}
      <section className="glass rounded-xl p-6 mb-8 overflow-x-auto" data-testid="nature-matrix-section">
        <h2 className="text-xl font-semibold mb-1 flex items-center gap-2" style={{ fontFamily: "Outfit" }}>
          <Shield size={18} className="text-sky-400" />
          Matriz de Confronto
        </h2>
        <p className="text-sm text-slate-400 mb-4">Linha = atacante, coluna = defensor. <span className="text-emerald-400">Verde</span> = vantagem. <span className="text-rose-400">Vermelho</span> = desvantagem.</p>
        <table className="min-w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 bg-slate-950 p-2 text-left text-[10px] uppercase tracking-wider text-slate-500 border border-slate-800">Atk ↓ / Def →</th>
              {NATURES.map(n => (
                <th key={n} className="p-1 border border-slate-800" style={{ color: NATURE_COLORS[n], minWidth: 44 }}>
                  <div className="[writing-mode:vertical-rl] rotate-180 py-2 text-[10px] font-semibold">{n}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NATURES.map(atk => (
              <tr key={atk}>
                <td className="sticky left-0 bg-slate-950 p-2 border border-slate-800 font-semibold whitespace-nowrap" style={{ color: NATURE_COLORS[atk] }}>
                  {atk}
                </td>
                {NATURES.map(def => {
                  const advantage = ADVANTAGE_MAP[atk].includes(def);  // atk beats def
                  const disadvantage = WEAKNESS_MAP[atk].includes(def); // atk weak to def
                  let cell = null;
                  let bg = "";
                  let title = "Neutro";
                  if (advantage) { cell = "+"; bg = "bg-emerald-500/25 text-emerald-300"; title = `${atk} vence ${def}`; }
                  else if (disadvantage) { cell = "−"; bg = "bg-rose-500/25 text-rose-300"; title = `${atk} perde para ${def}`; }
                  else if (atk === def) { cell = "·"; bg = "bg-slate-800/50 text-slate-500"; title = "Mesmo tipo"; }
                  else { cell = ""; bg = ""; }
                  return (
                    <td key={def} className={`text-center border border-slate-800 font-bold ${bg}`} title={title}>
                      {cell}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Section 4: Neutralization simulator */}
      <section className="glass rounded-xl p-6" data-testid="neutralization-simulator">
        <h2 className="text-xl font-semibold mb-1 flex items-center gap-2" style={{ fontFamily: "Outfit" }}>
          <Shield size={18} className="text-pink-400" />
          Simulador de Neutralização
        </h2>
        <p className="text-sm text-slate-400 mb-4">
          Uma carta pode ter até 3 naturezas. Se uma natureza do combo é justamente a fraqueza de outra, a fraqueza é <span className="text-pink-300 font-semibold">neutralizada</span>.
          Selecione até 3 naturezas para simular:
        </p>

        <div className="flex flex-wrap gap-2 mb-6">
          {NATURES.map(n => {
            const active = selected.includes(n);
            return (
              <button
                key={n}
                type="button"
                onClick={() => toggle(n)}
                data-testid={`sim-toggle-${n}`}
                disabled={!active && selected.length >= 3}
                className="px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  background: active ? NATURE_COLORS[n] : "transparent",
                  borderColor: NATURE_COLORS[n],
                  color: active ? "#fff" : NATURE_COLORS[n],
                }}
              >
                {n}
              </button>
            );
          })}
          {selected.length > 0 && (
            <button onClick={() => setSelected([])} className="px-3 py-1.5 rounded-full text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 flex items-center gap-1">
              <X size={12} /> Limpar
            </button>
          )}
        </div>

        {selected.length === 0 ? (
          <div className="text-sm text-slate-500 italic">Selecione uma ou mais naturezas acima.</div>
        ) : (
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-800" data-testid="sim-result-combo">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Combo</div>
              <div className="flex flex-wrap gap-1.5">
                {selected.map(n => <NatureBadge key={n} name={n} size="sm" withDot />)}
              </div>
            </div>

            <div className="p-4 rounded-lg bg-rose-500/5 border border-rose-500/30" data-testid="sim-result-weaknesses">
              <div className="text-[10px] uppercase tracking-widest text-rose-400 mb-2">Fraquezas efetivas</div>
              {effectiveWeak.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {effectiveWeak.map(n => <NatureBadge key={n} name={n} size="sm" />)}
                </div>
              ) : (
                <div className="text-xs text-emerald-300 font-semibold">Sem fraquezas! 🛡️</div>
              )}
            </div>

            <div className="p-4 rounded-lg bg-pink-500/5 border border-pink-500/30" data-testid="sim-result-neutralized">
              <div className="text-[10px] uppercase tracking-widest text-pink-400 mb-2">Neutralizadas</div>
              {neutralized.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {neutralized.map(n => <NatureBadge key={n} name={n} size="sm" />)}
                </div>
              ) : (
                <div className="text-xs text-slate-500 italic">Nenhuma neutralização neste combo.</div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
