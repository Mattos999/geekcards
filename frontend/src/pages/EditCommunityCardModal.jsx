import React, { useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { NATURES, CARD_TYPES } from "../lib/natures";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";

export function EditCommunityCardModal({
  card,
  onClose,
  onSaved
}) {

  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    card_type: "Personagem",
    natures: [],
    rarity: 1,
    hp: 0,
    description: ""
  });

  useEffect(() => {

    if (!card) return;

    setForm({
      name: card.name || "",
      card_type: card.card_type || "Personagem",
      natures: card.natures || [],
      rarity: card.rarity || 1,
      hp: card.hp || 0,
      description: card.description || ""
    });

  }, [card]);

  const toggleNature = (nature) => {

    let list = [...form.natures];

    if (list.includes(nature)) {

      list = list.filter(n => n !== nature);

    } else {

      if (list.length >= 3) {

        toast.error("Máximo 3 naturezas");

        return;

      }

      list.push(nature);

    }

    setForm({
      ...form,
      natures: list
    });

  };

  const save = async () => {

    setSaving(true);

    try {

      await api.put(
        `/admin/cards/${card.id}/edit`,
        form
      );

      toast.success("Carta atualizada");

      onSaved();

      onClose();

    }

    catch (e) {

      toast.error(
        formatApiError(e)
      );

    }

    finally {

      setSaving(false);

    }

  };

  if (!card) return null;

  return (

    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">

      <div className="glass rounded-xl p-6 w-full max-w-lg">

        {/* HEADER */}

        <div className="flex justify-between items-center mb-4">

          <h2 className="text-lg font-bold">

            Editar Carta

          </h2>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white"
          >

            <X size={18} />

          </button>

        </div>

        {/* NAME */}

        <input
          value={form.name}
          onChange={e =>
            setForm({
              ...form,
              name: e.target.value
            })
          }
          placeholder="Nome"
          className="w-full mb-3 bg-slate-950 border border-slate-800 rounded px-3 py-2"
        />

        {/* TYPE */}

        <select
          value={form.card_type}
          onChange={e =>
            setForm({
              ...form,
              card_type: e.target.value
            })
          }
          className="w-full mb-3 bg-slate-950 border border-slate-800 rounded px-3 py-2"
        >

          {CARD_TYPES.map(t => (

            <option key={t}>
              {t}
            </option>

          ))}

        </select>

        {/* NATURES */}

        <div className="mb-3">

          <div className="text-xs text-slate-400 mb-1">

            Naturezas

          </div>

          <div className="flex flex-wrap gap-2">

            {NATURES.map(n => (

              <button
                key={n}
                onClick={() => toggleNature(n)}
                className={`px-2 py-1 text-xs rounded border ${
                  form.natures.includes(n)
                    ? "bg-indigo-500 border-indigo-400"
                    : "border-slate-700"
                }`}
              >

                {n}

              </button>

            ))}

          </div>

        </div>

        {/* HP */}

        <input
          type="number"
          value={form.hp}
          onChange={e =>
            setForm({
              ...form,
              hp: Number(e.target.value)
            })
          }
          placeholder="HP"
          className="w-full mb-3 bg-slate-950 border border-slate-800 rounded px-3 py-2"
        />

        {/* DESCRIPTION */}

        <textarea
          value={form.description}
          onChange={e =>
            setForm({
              ...form,
              description: e.target.value
            })
          }
          placeholder="Descrição"
          className="w-full mb-4 bg-slate-950 border border-slate-800 rounded px-3 py-2"
        />

        {/* SAVE */}

        <button
          onClick={save}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded bg-indigo-600 hover:bg-indigo-700"
        >

          {saving
            ? <Loader2 className="animate-spin" size={16} />
            : "Salvar"
          }

        </button>

      </div>

    </div>

  );

}