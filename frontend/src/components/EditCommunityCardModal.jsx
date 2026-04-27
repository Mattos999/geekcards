import React, { useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { NATURES, CARD_TYPES, ENERGY_TYPES } from "../lib/natures";
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
    is_alpha: false,
    hp: 0,
    recuo: 0,
    abilities: [],
    energy_type: "",
    image_url: "",
    description: "",
    public_status: "approved"
  });

  useEffect(() => {

    if (!card) return;

    setForm({
      name: card.name || "",
      card_type: card.card_type || "Personagem",
      natures: card.natures || [],
      rarity: card.rarity ?? 1,
      is_alpha: card.is_alpha || false,
      hp: card.hp || 0,
      recuo: card.recuo || 0,
      abilities: card.abilities || [],
      energy_type: card.energy_type || "",
      image_url: card.image_url || "",
      description: card.description || "",
      public_status: card.public_status || "approved"
    });

  }, [card]);

  // =====================
  // NATURES
  // =====================

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

  // =====================
  // ABILITIES
  // =====================

  const updateAbility = (i, field, value) => {

    const list = [...form.abilities];

    list[i] = {
      ...list[i],
      [field]: value
    };

    setForm({
      ...form,
      abilities: list
    });

  };

  const addAbility = () => {

    if (form.abilities.length >= 3) {

      toast.error("Máximo 3 habilidades");

      return;

    }

    setForm({
      ...form,
      abilities: [
        ...form.abilities,
        {
          name: "",
          description: "",
          damage: 0,
          energy_cost: 0
        }
      ]
    });

  };

  // =====================
  // SAVE
  // =====================

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

      console.error(e);

    }

    finally {

      setSaving(false);

    }

  };

  if (!card) return null;

  return (

    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 overflow-y-auto">

      <div className="glass rounded-xl p-6 w-full max-w-xl">

        {/* HEADER */}

        <div className="flex justify-between mb-4">

          <h2 className="text-lg font-bold">

            Editar Carta

          </h2>

          <button onClick={onClose}>

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
          className="w-full mb-3 input"
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
          className="w-full mb-3 input"
        >

          {CARD_TYPES.map(t => (

            <option key={t}>
              {t}
            </option>

          ))}

        </select>

        {/* RARITY */}

        <input
          type="number"
          value={form.rarity}
          onChange={e =>
            setForm({
              ...form,
              rarity: Number(e.target.value)
            })
          }
          className="w-full mb-3 input"
        />

        {/* ALPHA */}

        <label className="flex gap-2 mb-3">

          <input
            type="checkbox"
            checked={form.is_alpha}
            onChange={e =>
              setForm({
                ...form,
                is_alpha: e.target.checked
              })
            }
          />

          Alpha

        </label>

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
          className="w-full mb-3 input"
        />

        {/* RECUO */}

        <input
          type="number"
          value={form.recuo}
          onChange={e =>
            setForm({
              ...form,
              recuo: Number(e.target.value)
            })
          }
          placeholder="Recuo"
          className="w-full mb-3 input"
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
          className="w-full mb-4 input"
        />

        {/* SAVE */}

        <button
          onClick={save}
          disabled={saving}
          className="w-full bg-indigo-600 py-2 rounded"
        >

          {saving
            ? <Loader2 className="animate-spin mx-auto" />
            : "Salvar"
          }

        </button>

      </div>

    </div>

  );

}