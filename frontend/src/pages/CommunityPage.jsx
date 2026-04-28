import React, { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { NATURES, CARD_TYPES } from "../lib/natures";
import { GameCard } from "../components/GameCard";
import { EditCommunityCardModal } from "../components/EditCommunityCardModal";
import { CommunityCardDetailModal } from "../components/CommunityCardDetailModal";

import {
  Search,
  Copy,
  Users,
  Loader2
} from "lucide-react";

import { toast } from "sonner";

export default function CommunityPage() {

  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [natureFilter, setNatureFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [alphaOnly, setAlphaOnly] = useState(false);

  const [cloning, setCloning] = useState(null);

  const [user, setUser] = useState(null);

  const [editingCard, setEditingCard] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);

  const statusLabels = {
    approved: "Aprovada",
    pending: "Pendente",
    rejected: "Rejeitada",
    private: "Privada"
  };

  const statusClasses = {
    approved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    pending: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    rejected: "border-rose-500/30 bg-rose-500/10 text-rose-300",
    private: "border-slate-600 bg-slate-800/60 text-slate-300"
  };

  // =========================
  // LOAD USER
  // =========================

  const loadUser = async () => {

    try {

      const { data } =
        await api.get("/auth/me");

      setUser(data);

    }

    catch (e) {

      console.error(e);

    }

  };

  // =========================
  // LOAD CARDS
  // =========================

  const load = async () => {

    setLoading(true);

    try {

      const { data } =
        await api.get("/community/cards");

      setCards(data);

    }

    catch (e) {

      toast.error(
        formatApiError(e)
      );

    }

    finally {

      setLoading(false);

    }

  };

  useEffect(() => {

    load();
    loadUser();

  }, []);

  // =========================
  // FILTER
  // =========================

  const filtered = useMemo(() =>
    cards.filter(c => {

      if (
        q &&
        !c.name
          .toLowerCase()
          .includes(q.toLowerCase())
      )
        return false;

      if (
        natureFilter &&
        !(c.natures || [])
          .includes(natureFilter)
      )
        return false;

      if (
        typeFilter &&
        c.card_type !== typeFilter
      )
        return false;

      if (
        alphaOnly &&
        !c.is_alpha
      )
        return false;

      return true;

    }),
    [
      cards,
      q,
      natureFilter,
      typeFilter,
      alphaOnly
    ]
  );

  // =========================
  // CLONE
  // =========================

  const clone = async (card) => {

    setCloning(card.id);

    try {

      await api.post(
        `/cards/${card.id}/clone`
      );

      toast.success(
        `"${card.name}" copiada para sua coleção`
      );

    }

    catch (e) {

      toast.error(
        formatApiError(e)
      );

    }

    finally {

      setCloning(null);

    }

  };

  // =========================
  // DELETE (ADMIN)
  // =========================

  const deleteCard = async (card) => {

    if (
      !confirm(
        `Excluir "${card.name}" da comunidade?`
      )
    )
      return;

    try {

      await api.delete(
        `/admin/cards/${card.id}`
      );

      toast.success(
        "Carta excluída"
      );

      load();

    }

    catch (e) {

      toast.error(
        formatApiError(e)
      );

    }

  };

  // =========================
  // EDIT (ADMIN)
  // =========================

  const editCard = (card) => {

    setEditingCard(card);

  };

  // =========================
  // UI
  // =========================

  return (

    <div className="p-8 max-w-7xl mx-auto">

      {/* HEADER */}

      <div className="mb-8 animate-fade-in-up">

        <div className="text-sm uppercase tracking-[0.2em] text-indigo-400 mb-1 flex items-center gap-2">

          <Users size={14} />

          Comunidade

        </div>

        <h1
          className="text-4xl sm:text-5xl font-bold"
          style={{ fontFamily: "Outfit" }}
        >

          Biblioteca Pública

        </h1>

        <p className="text-slate-400 mt-2 text-sm">

          Cartas aprovadas pelos admins.
          Copie pra sua coleção e use
          em qualquer deck.

        </p>

      </div>

      {/* FILTERS */}

      <div className="glass rounded-xl p-4 mb-6 flex flex-wrap gap-3 items-center">

        {/* SEARCH */}

        <div className="relative flex-1 min-w-[200px]">

          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />

          <input
            value={q}
            onChange={e =>
              setQ(e.target.value)
            }
            placeholder="Buscar por nome..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />

        </div>

        {/* NATURE */}

        <select
          value={natureFilter}
          onChange={e =>
            setNatureFilter(e.target.value)
          }
          className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm"
        >

          <option value="">
            Todas naturezas
          </option>

          {NATURES.map(n => (

            <option key={n}>
              {n}
            </option>

          ))}

        </select>

        {/* TYPE */}

        <select
          value={typeFilter}
          onChange={e =>
            setTypeFilter(e.target.value)
          }
          className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm"
        >

          <option value="">
            Todos tipos
          </option>

          {CARD_TYPES.map(t => (

            <option key={t}>
              {t}
            </option>

          ))}

        </select>

        {/* ALPHA */}

        <label className="flex items-center gap-2 text-sm cursor-pointer px-2 py-2">
          <input
            type="checkbox"
            checked={alphaOnly}
            onChange={e =>
              setAlphaOnly(e.target.checked)
            }
          />
          ALPHA
        </label>

      </div>

      {/* LOADING */}

      {loading ? (

        <div className="flex items-center justify-center p-16">

          <Loader2 className="animate-spin text-indigo-400" />

        </div>

      )

        : filtered.length === 0 ? (

          <div className="glass rounded-xl p-16 text-center">

            <Users
              className="mx-auto text-slate-600 mb-3"
              size={32}
            />

            <p className="text-slate-400">

              {cards.length === 0

                ? "Nenhuma carta aprovada ainda na comunidade."

                : "Nenhuma carta encontrada com esses filtros."}

            </p>

          </div>

        )

        : (

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">

            {filtered.map(c => (

              <div
                key={c.id}
                className="animate-fade-in-up flex flex-col items-center gap-2"
              >

                <GameCard
                  card={c}
                  size="md"
                  showStats
                  selected={selectedCard?.id === c.id}
                  onClick={() => setSelectedCard(c)}
                />

                <div className="w-48 text-center text-[10px] text-slate-500 truncate px-1">

                  por {c.owner_name}

                </div>

                {user?.role === "admin" && (

                  <div className={`w-48 text-[10px] text-center uppercase tracking-wider font-semibold rounded-md border px-2 py-1 ${statusClasses[c.public_status] || statusClasses.private}`}>

                    {statusLabels[c.public_status] || c.public_status || "Privada"}

                  </div>

                )}

                {/* CLONE */}

                {c.public_status === "approved" && (

                  <button
                    onClick={() => clone(c)}
                    disabled={cloning === c.id}
                    className="w-48 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-200 text-xs transition-colors disabled:opacity-50"
                  >

                    {cloning === c.id

                      ? <Loader2 size={12} className="animate-spin" />

                      : <Copy size={12} />

                    }

                    Copiar

                  </button>

                )}

                {/* ADMIN BUTTONS */}

                {user?.role === "admin" && (

                  <div className="flex w-48 gap-2">

                    <button
                      onClick={() => editCard(c)}
                      className="flex-1 text-xs px-2 py-1 rounded bg-yellow-500/20 border border-yellow-500/40 text-yellow-300 hover:bg-yellow-500/30"
                    >

                     Editar

                    </button>

                    <button
                      onClick={() => deleteCard(c)}
                      className="flex-1 text-xs px-2 py-1 rounded bg-red-600/20 border border-red-600/40 text-red-300 hover:bg-red-600/30"
                    >

                       Excluir

                    </button>

                  </div>

                )}

              </div>

            ))}

          </div>

        )}

      {/* EDIT MODAL */}

      {editingCard && (

        <EditCommunityCardModal
          card={editingCard}
          onClose={() =>
            setEditingCard(null)
          }
          onSaved={load}
        />

      )}

      {/* DETAIL MODAL */}

      {selectedCard && (

        <CommunityCardDetailModal
          card={selectedCard}
          onClose={() =>
            setSelectedCard(null)
          }
        />

      )}

    </div>

  );

}
